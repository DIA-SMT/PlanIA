"use server";

import { revalidatePath } from "next/cache";
import { getPerfilActual } from "./auth";
import { getSupabaseServer } from "./supabase/server";
import { ANIO_POA } from "./poa-2027";
import { puedeEditarPrioritarios } from "./proyectos-prioritarios";
import {
  ANIOS_CARGABLES,
  ANIOS_HISTORIAL,
  CAMPOS_PRIORITARIO,
  PERIODICIDADES,
  esEnlaceWeb,
  leerMetas,
  leerNumero,
  tienePrioritarios,
  type CampoPrioritario,
  type FilaHistorial,
  type MetaPrioritario,
} from "./proyectos-prioritarios-comun";

/**
 * Proyectos prioritarios del POA 2027 — corrección del 28.10, migración 059.
 *
 * Se editan como las fichas del POA: en la ficha misma, campo por campo, y con
 * los mismos permisos (puedeEditarPrioritarios); la RLS repite el control.
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
  if (!(await puedeEditarPrioritarios(perfil, unidadId))) {
    return "No podés editar los proyectos prioritarios de esta área";
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
      // 04.11: arranca con una meta vacía, con un indicador vacío, para que la
      // ficha muestre dónde va cada cosa.
      metas: [{ id: crypto.randomUUID(), valor: null, descripcion: null, indicadores: [{ id: crypto.randomUUID(), texto: "" }] }],
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
  if (!ANIOS_CARGABLES.includes(anio)) return { success: false, error: "Ese año no va en el historial" };
  const n = leerNumero(valor.trim());
  if (n === "invalido") return { success: false, error: "Escribí un número, sin letras" };
  const p = await prioritarioDe(id);
  if (!p) return { success: false, error: "No se encontró la ficha" };
  const sinPermiso = await puedeEditar(p.unidad_id);
  if (sinPermiso) return { success: false, error: sinPermiso };

  const actual = Array.isArray(p.historial) ? p.historial : [];
  // 04.11: con 2023, que es opcional.
  const historial = ANIOS_CARGABLES.map((a) => ({
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

/*
 * Metas e indicadores — 04.11: "se debe poder cargar más de un indicador x
 * meta y más de una meta x proyecto" (062).
 *
 * Cada acción lee la lista, la cambia y la guarda entera, como el historial.
 * Al guardar, meta_anual e indicador quedan iguales a la primera meta y su
 * primer indicador: el Plan Rector proyecta con la primera meta.
 */
async function cambiarMetas(
  id: string,
  cambiar: (metas: MetaPrioritario[]) => MetaPrioritario[] | string
): Promise<Resultado> {
  const sb = await getSupabaseServer();
  const { data } = await sb
    .from("proyecto_prioritario")
    .select("id, unidad_id, metas")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  const p = data as { id: string; unidad_id: string; metas: unknown } | null;
  if (!p) return { success: false, error: "No se encontró la ficha" };
  const sinPermiso = await puedeEditar(p.unidad_id);
  if (sinPermiso) return { success: false, error: sinPermiso };

  const metas = cambiar(leerMetas(p.metas));
  if (typeof metas === "string") return { success: false, error: metas };
  const primera = metas[0];
  const { error } = await sb
    .from("proyecto_prioritario")
    .update({
      metas,
      meta_anual: primera?.valor ?? null,
      indicador: primera?.indicadores.find((i) => i.texto.trim())?.texto ?? null,
    })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  refrescar(id);
  return { success: true };
}

export async function agregarMetaPrioritario(id: string): Promise<Resultado> {
  return cambiarMetas(id, (metas) => [
    ...metas,
    { id: crypto.randomUUID(), valor: null, descripcion: null, indicadores: [{ id: crypto.randomUUID(), texto: "" }] },
  ]);
}

export async function borrarMetaPrioritario(id: string, metaId: string): Promise<Resultado> {
  return cambiarMetas(id, (metas) => metas.filter((m) => m.id !== metaId));
}

/** campo: "valor" (la cantidad comprometida) o "descripcion". */
export async function editarMetaPrioritario(
  id: string,
  metaId: string,
  campo: string,
  valor: string
): Promise<Resultado> {
  if (campo !== "valor" && campo !== "descripcion") return { success: false, error: "Campo desconocido" };
  let numero: number | null = null;
  if (campo === "valor") {
    const n = leerNumero(valor.trim());
    if (n === "invalido") return { success: false, error: "Escribí un número, sin letras" };
    numero = n;
  }
  return cambiarMetas(id, (metas) => {
    if (!metas.some((m) => m.id === metaId)) return "No se encontró la meta";
    return metas.map((m) =>
      m.id !== metaId
        ? m
        : campo === "valor"
          ? { ...m, valor: numero }
          : { ...m, descripcion: valor.trim() || null }
    );
  });
}

export async function agregarIndicadorPrioritario(id: string, metaId: string): Promise<Resultado> {
  return cambiarMetas(id, (metas) => {
    if (!metas.some((m) => m.id === metaId)) return "No se encontró la meta";
    return metas.map((m) =>
      m.id === metaId ? { ...m, indicadores: [...m.indicadores, { id: crypto.randomUUID(), texto: "" }] } : m
    );
  });
}

export async function editarIndicadorPrioritario(
  id: string,
  metaId: string,
  indicadorId: string,
  texto: string
): Promise<Resultado> {
  return cambiarMetas(id, (metas) =>
    metas.map((m) =>
      m.id !== metaId
        ? m
        : {
            ...m,
            indicadores: m.indicadores.map((i) => (i.id === indicadorId ? { ...i, texto: texto.trim() } : i)),
          }
    )
  );
}

export async function borrarIndicadorPrioritario(
  id: string,
  metaId: string,
  indicadorId: string
): Promise<Resultado> {
  return cambiarMetas(id, (metas) =>
    metas.map((m) =>
      m.id !== metaId ? m : { ...m, indicadores: m.indicadores.filter((i) => i.id !== indicadorId) }
    )
  );
}
