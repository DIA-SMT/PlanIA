"use server";

import { revalidatePath } from "next/cache";
import { getPerfilActual, getScopeUnidades } from "./auth";
import { getSupabaseServer } from "./supabase/server";
import { ANIO_POA, type TipoTextoPoa } from "./poa-2027";

/**
 * Introducciones y banco de ideas del POA 2027 — 08.10, migración 057.
 *
 * "Deberíamos poder editarlas." Se editan como las fichas: en el documento
 * mismo, campo por campo, y con el mismo alcance —el área lo suyo y lo de
 * abajo, Planificación todo—. La base repite el control por RLS.
 */

type Resultado = { success: boolean; error?: string };

const TIPOS: TipoTextoPoa[] = ["introduccion", "idea"];
const CAMPOS = ["titulo", "texto"] as const;

function refrescar() {
  revalidatePath("/poa-2027");
  revalidatePath("/poa-2027/mis-fichas");
}

/** Comprueba que quien pide pueda editar el POA de esa área. */
async function puedeEditar(unidadId: string): Promise<string | null> {
  const perfil = await getPerfilActual();
  if (!perfil) return "No autenticado";
  const alcance = await getScopeUnidades(perfil);
  if (!alcance.includes(unidadId)) return "Ese POA es de otra área: no lo podés editar";
  return null;
}

async function textoDe(id: string) {
  const sb = await getSupabaseServer();
  const { data } = await sb
    .from("poa_texto")
    .select("id, unidad_id, tipo, orden")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  return data as { id: string; unidad_id: string; tipo: TipoTextoPoa; orden: number } | null;
}

/** Agrega una introducción o una idea vacía al final de las de su tipo. */
export async function agregarTextoPoa(unidadId: string, tipo: TipoTextoPoa): Promise<Resultado> {
  if (!TIPOS.includes(tipo)) return { success: false, error: "Tipo de texto desconocido" };
  const sinPermiso = await puedeEditar(unidadId);
  if (sinPermiso) return { success: false, error: sinPermiso };

  const sb = await getSupabaseServer();
  const { data: ultimo } = await sb
    .from("poa_texto")
    .select("orden")
    .eq("unidad_id", unidadId)
    .eq("anio", ANIO_POA)
    .eq("tipo", tipo)
    .is("deleted_at", null)
    .order("orden", { ascending: false })
    .limit(1);
  const orden = ((ultimo?.[0] as { orden: number } | undefined)?.orden ?? 0) + 1;

  const { data: auth } = await sb.auth.getUser();
  const { error } = await sb.from("poa_texto").insert({
    unidad_id: unidadId,
    anio: ANIO_POA,
    tipo,
    orden,
    created_by: auth.user?.id ?? null,
  });
  if (error) return { success: false, error: error.message };
  refrescar();
  return { success: true };
}

export async function editarCampoTextoPoa(id: string, campo: string, valor: string): Promise<Resultado> {
  if (!CAMPOS.includes(campo as (typeof CAMPOS)[number])) {
    return { success: false, error: "Ese campo no se puede editar desde acá" };
  }
  const t = await textoDe(id);
  if (!t) return { success: false, error: "No se encontró el texto" };
  const sinPermiso = await puedeEditar(t.unidad_id);
  if (sinPermiso) return { success: false, error: sinPermiso };

  const sb = await getSupabaseServer();
  const { error } = await sb
    .from("poa_texto")
    .update({ [campo]: valor.trim() || null })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  refrescar();
  return { success: true };
}

/** Borrado lógico: se puede recuperar desde la base si fue un error. */
export async function borrarTextoPoa(id: string): Promise<Resultado> {
  const t = await textoDe(id);
  if (!t) return { success: false, error: "No se encontró el texto" };
  const sinPermiso = await puedeEditar(t.unidad_id);
  if (sinPermiso) return { success: false, error: sinPermiso };

  const sb = await getSupabaseServer();
  const { error } = await sb
    .from("poa_texto")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  refrescar();
  return { success: true };
}

/**
 * Sube o baja un texto un lugar dentro de los de su tipo.
 *
 * Renumera todos los de su tipo y no solo intercambia dos órdenes: dos textos
 * pueden haber quedado con el mismo número, y con un intercambio no se
 * moverían.
 */
export async function moverTextoPoa(id: string, hacia: "arriba" | "abajo"): Promise<Resultado> {
  const t = await textoDe(id);
  if (!t) return { success: false, error: "No se encontró el texto" };
  const sinPermiso = await puedeEditar(t.unidad_id);
  if (sinPermiso) return { success: false, error: sinPermiso };

  const sb = await getSupabaseServer();
  const { data } = await sb
    .from("poa_texto")
    .select("id")
    .eq("unidad_id", t.unidad_id)
    .eq("anio", ANIO_POA)
    .eq("tipo", t.tipo)
    .is("deleted_at", null)
    .order("orden")
    .order("created_at");
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  const i = ids.indexOf(id);
  const j = hacia === "arriba" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return { success: true };
  [ids[i], ids[j]] = [ids[j], ids[i]];

  for (const [k, otro] of ids.entries()) {
    const { error } = await sb.from("poa_texto").update({ orden: k + 1 }).eq("id", otro);
    if (error) return { success: false, error: error.message };
  }
  refrescar();
  return { success: true };
}
