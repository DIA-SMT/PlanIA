"use server";

import { revalidatePath } from "next/cache";
import { getPerfilActual } from "./auth";
import { getSupabaseServer } from "./supabase/server";
import { ANIO_POA } from "./poa-2027";
import { esEjePlanRector, getAreasConPrioritarios, puedeEditarPrioritarios } from "./proyectos-prioritarios";
import {
  ANIOS_CARGABLES,
  ANIOS_HISTORIAL,
  CAMPOS_PRIORITARIO,
  PERIODICIDADES,
  esEnlaceWeb,
  leerHistorial,
  leerLineaBase,
  leerMetas,
  leerNumero,
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
  if (!(await getAreasConPrioritarios()).has(unidadId)) {
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
      metas: [{ id: crypto.randomUUID(), valor: null, descripcion: null, indicadores: [{ id: crypto.randomUUID(), texto: "", total: null }], historial: [] }],
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
  // 05.11: la línea de base guarda el número y, si no es un número solo, lo escrito.
  let tambien: Record<string, string | null> = {};
  if (tipo === "linea_base") {
    const lb = leerLineaBase(texto);
    guardar = lb.numero;
    tambien = { [`${campo}_texto`]: lb.texto };
  } else if (tipo === "eje") {
    if (texto && !(await esEjePlanRector(texto))) {
      return { success: false, error: "Ese eje no está en el Plan Rector" };
    }
  } else if (tipo === "numero") {
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
    .update({ [campo]: guardar, ...tambien })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  refrescar(id);
  return { success: true };
}

/**
 * Lo ejecutado en un año del historial de una meta. Vacío es "sin datos
 * disponibles", no cero.
 *
 * 12.11: "necesitamos que cada meta pueda vincularse con un histórico". Antes
 * había un solo historial por ficha; cambiarMetas deja el de la ficha igual al
 * de la primera meta.
 */
export async function editarHistorialPrioritario(
  id: string,
  metaId: string,
  anio: number,
  valor: string
): Promise<Resultado> {
  if (!ANIOS_CARGABLES.includes(anio)) return { success: false, error: "Ese año no va en el historial" };
  const n = leerNumero(valor.trim());
  if (n === "invalido") return { success: false, error: "Escribí un número, sin letras" };
  return cambiarMetas(id, (metas) => {
    if (!metas.some((m) => m.id === metaId)) return "No se encontró la meta";
    return metas.map((m) =>
      m.id !== metaId
        ? m
        : {
            ...m,
            // 04.11: con 2023, que es opcional.
            historial: ANIOS_CARGABLES.map((a) => ({
              anio: a,
              valor: a === anio ? n : m.historial.find((h) => h.anio === a)?.valor ?? null,
            })),
          }
    );
  });
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
    .select("id, unidad_id, metas, historial")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  const p = data as { id: string; unidad_id: string; metas: unknown; historial: unknown } | null;
  if (!p) return { success: false, error: "No se encontró la ficha" };
  const sinPermiso = await puedeEditar(p.unidad_id);
  if (sinPermiso) return { success: false, error: sinPermiso };

  const metas = cambiar(leerMetas(p.metas, leerHistorial(p.historial)));
  if (typeof metas === "string") return { success: false, error: metas };
  const primera = metas[0];
  const { error } = await sb
    .from("proyecto_prioritario")
    .update({
      metas,
      meta_anual: primera?.valor ?? null,
      indicador: primera?.indicadores.find((i) => i.texto.trim())?.texto ?? null,
      // 12.11: el historial de la ficha es el de la primera meta. Sin metas, queda el que tenía.
      ...(primera ? { historial: primera.historial } : {}),
    })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  refrescar(id);
  return { success: true };
}

export async function agregarMetaPrioritario(id: string): Promise<Resultado> {
  return cambiarMetas(id, (metas) => [
    ...metas,
    { id: crypto.randomUUID(), valor: null, descripcion: null, indicadores: [{ id: crypto.randomUUID(), texto: "", total: null }], historial: [] },
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
      m.id === metaId ? { ...m, indicadores: [...m.indicadores, { id: crypto.randomUUID(), texto: "", total: null }] } : m
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

/**
 * 05.11: el total planificado de un indicador ("dividir la meta en totales x
 * indicador"). Vacío es que todavía no se cargó, no cero.
 */
export async function editarTotalIndicadorPrioritario(
  id: string,
  metaId: string,
  indicadorId: string,
  valor: string
): Promise<Resultado> {
  const total = leerNumero(valor.trim());
  if (total === "invalido") return { success: false, error: "Escribí un número, sin letras" };
  return cambiarMetas(id, (metas) =>
    metas.map((m) =>
      m.id !== metaId
        ? m
        : { ...m, indicadores: m.indicadores.map((i) => (i.id === indicadorId ? { ...i, total } : i)) }
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

/*
 * Áreas con proyectos prioritarios — 11.11: "crear una herramienta/botón en
 * este tablero para que desde planificación estratégica podamos asignar
 * proyectos prioritarios a nuevas direcciones y eliminar direcciones de ser
 * necesario" (064). Solo Planificación; la RLS repite el control.
 */
async function soloPlanificacion(): Promise<string | null> {
  const perfil = await getPerfilActual();
  if (!perfil) return "No autenticado";
  if (perfil.rol !== "admin_funcional") return "Solo Planificación cambia las áreas con proyectos prioritarios";
  return null;
}

function refrescarAreas() {
  revalidatePath("/poa-2027/prioritarios");
  revalidatePath("/prioritarios");
  revalidatePath("/poa-2027");
  // El menú del director depende de la lista.
  revalidatePath("/", "layout");
}

/** Agrega un área al final de la lista. */
export async function agregarAreaPrioritaria(unidadId: string): Promise<Resultado> {
  const sinPermiso = await soloPlanificacion();
  if (sinPermiso) return { success: false, error: sinPermiso };
  const sb = await getSupabaseServer();
  const { data: unidad } = await sb
    .from("unidad_organizacional")
    .select("id")
    .eq("id", unidadId)
    .eq("activa", true)
    .maybeSingle();
  if (!unidad) return { success: false, error: "No se encontró el área" };

  const { data: ultima } = await sb
    .from("area_prioritaria")
    .select("orden")
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: auth } = await sb.auth.getUser();
  const { error } = await sb.from("area_prioritaria").insert({
    unidad_id: unidadId,
    orden: ((ultima as { orden: number } | null)?.orden ?? 0) + 1,
    created_by: auth.user?.id ?? null,
  });
  if (error) {
    return { success: false, error: error.code === "23505" ? "Esa área ya está en la lista" : error.message };
  }
  refrescarAreas();
  return { success: true };
}

/**
 * Quita un área de la lista. Sus fichas no se borran: quedan guardadas y dejan
 * de verse; si el área vuelve a la lista, aparecen de nuevo.
 */
export async function quitarAreaPrioritaria(unidadId: string): Promise<Resultado> {
  const sinPermiso = await soloPlanificacion();
  if (sinPermiso) return { success: false, error: sinPermiso };
  const sb = await getSupabaseServer();
  const { data, error } = await sb.from("area_prioritaria").delete().eq("unidad_id", unidadId).select("unidad_id");
  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) return { success: false, error: "Esa área no estaba en la lista" };
  refrescarAreas();
  return { success: true };
}
