"use server";

import { revalidatePath } from "next/cache";
import { getPerfilActual } from "./auth";
import { getSupabaseServer } from "./supabase/server";
import { ANIO_POA } from "./poa-2027";
import {
  ANIOS_HISTORIAL,
  CAMPOS_PRIORITARIO,
  PERIODICIDADES,
  esEnlaceWeb,
  leerNumero,
  tienePrioritarios,
  type CampoPrioritario,
  type FilaHistorial,
} from "./proyectos-prioritarios-comun";

/**
 * Proyectos prioritarios del POA 2027 — corrección del 28.10, migración 059.
 *
 * Se editan como las fichas del POA: en la ficha misma, campo por campo. Puede
 * editar el director del área y Planificación, que es lo que deja la base
 * (usuario_puede_cargar_unidad); la RLS repite el control.
 */

type Resultado = { success: boolean; error?: string };

function refrescar(id?: string) {
  revalidatePath("/poa-2027/prioritarios");
  if (id) revalidatePath(`/poa-2027/prioritarios/${id}`);
}

/** Comprueba que quien pide pueda editar los prioritarios de esa área, y que el área los tenga. */
async function puedeEditar(unidadId: string): Promise<string | null> {
  const perfil = await getPerfilActual();
  if (!perfil) return "No autenticado";
  const esPlanificacion = perfil.rol === "admin_funcional";
  if (!esPlanificacion && !(perfil.rol === "director" && perfil.unidad_id === unidadId)) {
    return "Solo el director del área o Planificación pueden editar sus proyectos prioritarios";
  }
  const sb = await getSupabaseServer();
  const { data } = await sb
    .from("unidad_organizacional")
    .select("codigo")
    .eq("id", unidadId)
    .maybeSingle();
  if (!tienePrioritarios((data as { codigo: string | null } | null)?.codigo)) {
    return "Esta área no tiene proyectos prioritarios";
  }
  return null;
}

async function prioritarioDe(id: string) {
  const sb = await getSupabaseServer();
  const { data } = await sb
    .from("proyecto_prioritario")
    .select("id, unidad_id, historial")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return data as { id: string; unidad_id: string; historial: FilaHistorial[] } | null;
}

/** El proyecto elegido tiene que ser de la misma área. */
async function proyectoDelArea(proyectoId: string, unidadId: string): Promise<boolean> {
  const sb = await getSupabaseServer();
  const { data } = await sb
    .from("proyecto")
    .select("id")
    .eq("id", proyectoId)
    .eq("unidad_id", unidadId)
    .is("deleted_at", null)
    .maybeSingle();
  return !!data;
}

/** Genera una ficha nueva: el director pone el nombre y, si corresponde, el proyecto del 2026. */
export async function crearProyectoPrioritario(
  unidadId: string,
  nombre: string,
  proyectoId: string | null
): Promise<Resultado & { id?: string }> {
  if (!nombre.trim()) return { success: false, error: "Poné el nombre del proyecto" };
  const sinPermiso = await puedeEditar(unidadId);
  if (sinPermiso) return { success: false, error: sinPermiso };
  if (proyectoId && !(await proyectoDelArea(proyectoId, unidadId))) {
    return { success: false, error: "Ese proyecto no es de esta área" };
  }

  const sb = await getSupabaseServer();
  const { data: auth } = await sb.auth.getUser();
  const { data, error } = await sb
    .from("proyecto_prioritario")
    .insert({
      unidad_id: unidadId,
      anio: ANIO_POA,
      nombre: nombre.trim(),
      proyecto_id: proyectoId,
      historial: ANIOS_HISTORIAL.map((anio) => ({ anio, valor: null })),
      created_by: auth.user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };
  refrescar();
  return { success: true, id: (data as { id: string }).id };
}

export async function editarCampoPrioritario(
  id: string,
  campo: string,
  valor: string
): Promise<Resultado> {
  if (!(campo in CAMPOS_PRIORITARIO)) {
    return { success: false, error: "Ese campo no se puede editar desde acá" };
  }
  const tipo = CAMPOS_PRIORITARIO[campo as CampoPrioritario];
  const p = await prioritarioDe(id);
  if (!p) return { success: false, error: "No se encontró la ficha" };
  const sinPermiso = await puedeEditar(p.unidad_id);
  if (sinPermiso) return { success: false, error: sinPermiso };

  const texto = valor.trim();
  let guardar: string | number | null = texto || null;
  if (tipo === "numero") {
    const n = leerNumero(texto);
    if (n === "invalido") return { success: false, error: "Escribí un número, sin letras" };
    guardar = n;
  } else if (tipo === "anio") {
    const n = texto ? Number(texto) : null;
    if (n !== null && !(Number.isInteger(n) && n >= 2000 && n <= 2100)) {
      return { success: false, error: "Escribí un año, como 2024" };
    }
    guardar = n;
  } else if (tipo === "enlace") {
    if (texto && !esEnlaceWeb(texto)) {
      return { success: false, error: "Pegá el enlace completo, empezando con https://" };
    }
  } else if (tipo === "periodicidad") {
    if (texto && !PERIODICIDADES.includes(texto)) return { success: false, error: "Periodicidad desconocida" };
  } else if (tipo === "proyecto") {
    if (texto && !(await proyectoDelArea(texto, p.unidad_id))) {
      return { success: false, error: "Ese proyecto no es de esta área" };
    }
  } else if (campo === "nombre" && !texto) {
    return { success: false, error: "El proyecto tiene que tener nombre" };
  }

  const sb = await getSupabaseServer();
  const { error } = await sb
    .from("proyecto_prioritario")
    .update({ [campo]: guardar })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  refrescar(id);
  return { success: true };
}

/** Lo ejecutado en un año del historial. Vacío es "sin datos disponibles", no cero. */
export async function editarHistorialPrioritario(
  id: string,
  anio: number,
  valor: string
): Promise<Resultado> {
  if (!ANIOS_HISTORIAL.includes(anio)) return { success: false, error: "Ese año no va en el historial" };
  const n = leerNumero(valor.trim());
  if (n === "invalido") return { success: false, error: "Escribí un número, sin letras" };
  const p = await prioritarioDe(id);
  if (!p) return { success: false, error: "No se encontró la ficha" };
  const sinPermiso = await puedeEditar(p.unidad_id);
  if (sinPermiso) return { success: false, error: sinPermiso };

  const actual = Array.isArray(p.historial) ? p.historial : [];
  const historial = ANIOS_HISTORIAL.map((a) => ({
    anio: a,
    valor: a === anio ? n : actual.find((h) => Number(h.anio) === a)?.valor ?? null,
  }));

  const sb = await getSupabaseServer();
  const { error } = await sb.from("proyecto_prioritario").update({ historial }).eq("id", id);
  if (error) return { success: false, error: error.message };
  refrescar(id);
  return { success: true };
}

/** Borrado lógico: se puede recuperar desde la base si fue un error. */
export async function borrarProyectoPrioritario(id: string): Promise<Resultado> {
  const p = await prioritarioDe(id);
  if (!p) return { success: false, error: "No se encontró la ficha" };
  const sinPermiso = await puedeEditar(p.unidad_id);
  if (sinPermiso) return { success: false, error: sinPermiso };

  const sb = await getSupabaseServer();
  const { error } = await sb
    .from("proyecto_prioritario")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  refrescar(id);
  return { success: true };
}
