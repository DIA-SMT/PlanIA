import { getSupabaseServer } from "./supabase/server";
import { ANIO_POA } from "./poa-2027";
import {
  proyeccionPrioritario,
  tienePrioritarios,
  type FilaHistorial,
  type ProyeccionPrioritario,
  type ProyectoPrioritario,
} from "./proyectos-prioritarios-comun";

/**
 * Proyectos prioritarios del POA 2027 — corrección del 28.10, migración 059.
 *
 * Una ficha aparte de la del POA 2027, solo para las áreas de
 * AREAS_CON_PRIORITARIOS. Las lecturas pasan por la RLS: cada uno ve las de su
 * alcance.
 */

const COLUMNAS =
  "id, unidad_id, anio, proyecto_id, nombre, diagnostico, unidad_medida, linea_base_total, linea_base_pendiente, linea_base_anio, linea_base_fuente, historial, meta_anual, indicador, medio_verificacion, enlace_territorial, presupuesto_area, presupuesto_proyecto, periodicidad, updated_at";

/** PostgREST devuelve numeric como texto cuando no entra en un double: se pasa a número igual. */
function aNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizar(fila: Record<string, unknown>): ProyectoPrioritario {
  const historial = Array.isArray(fila.historial)
    ? (fila.historial as { anio: unknown; valor: unknown }[]).map(
        (h): FilaHistorial => ({ anio: Number(h.anio), valor: aNumero(h.valor) })
      )
    : [];
  return {
    ...(fila as unknown as ProyectoPrioritario),
    historial,
    linea_base_total: aNumero(fila.linea_base_total),
    linea_base_pendiente: aNumero(fila.linea_base_pendiente),
    linea_base_anio: aNumero(fila.linea_base_anio),
    meta_anual: aNumero(fila.meta_anual),
    presupuesto_area: aNumero(fila.presupuesto_area),
    presupuesto_proyecto: aNumero(fila.presupuesto_proyecto),
  };
}

export interface AreaConPrioritarios {
  id: string;
  nombre: string;
  codigo: string | null;
  habilitada: boolean;
}

export async function getAreaPrioritarios(unidadId: string): Promise<AreaConPrioritarios | null> {
  const sb = await getSupabaseServer();
  const { data } = await sb
    .from("unidad_organizacional")
    .select("id, nombre, codigo")
    .eq("id", unidadId)
    .maybeSingle();
  if (!data) return null;
  const u = data as { id: string; nombre: string; codigo: string | null };
  return { ...u, habilitada: tienePrioritarios(u.codigo) };
}

export async function getPrioritariosDelArea(unidadId: string): Promise<ProyectoPrioritario[]> {
  const sb = await getSupabaseServer();
  const { data, error } = await sb
    .from("proyecto_prioritario")
    .select(COLUMNAS)
    .eq("unidad_id", unidadId)
    .eq("anio", ANIO_POA)
    .is("deleted_at", null)
    .order("created_at");
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(normalizar);
}

export async function getPrioritario(id: string): Promise<ProyectoPrioritario | null> {
  const sb = await getSupabaseServer();
  const { data, error } = await sb
    .from("proyecto_prioritario")
    .select(COLUMNAS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizar(data as Record<string, unknown>) : null;
}

/**
 * Para el Plan Rector: la proyección de cada proyecto del POA que tiene ficha de
 * proyecto prioritario, por id de proyecto. Si un proyecto tiene más de una
 * ficha, cuenta la primera que se cargó. Sin la migración 059, vacío.
 */
export async function getProyeccionesPorProyecto(): Promise<Map<string, ProyeccionPrioritario>> {
  const sb = await getSupabaseServer();
  const { data, error } = await sb
    .from("proyecto_prioritario")
    .select(COLUMNAS)
    .eq("anio", ANIO_POA)
    .not("proyecto_id", "is", null)
    .is("deleted_at", null)
    .order("created_at");
  const porProyecto = new Map<string, ProyeccionPrioritario>();
  if (error) return porProyecto;
  for (const fila of (data ?? []) as Record<string, unknown>[]) {
    const f = normalizar(fila);
    if (f.proyecto_id && !porProyecto.has(f.proyecto_id)) {
      porProyecto.set(f.proyecto_id, proyeccionPrioritario(f, ANIO_POA));
    }
  }
  return porProyecto;
}

/** Los proyectos del POA vigente (2026) del área, para elegir a cuál corresponde la ficha. */
export async function getProyectosDelArea(unidadId: string): Promise<{ id: string; nombre: string }[]> {
  const sb = await getSupabaseServer();
  const { data: per } = await sb.from("periodo").select("id").eq("activo", true).maybeSingle();
  if (!per) return [];
  const { data } = await sb
    .from("proyecto")
    .select("id, nombre")
    .eq("unidad_id", unidadId)
    .eq("periodo_id", (per as { id: string }).id)
    .is("deleted_at", null)
    .order("nombre");
  return (data ?? []) as { id: string; nombre: string }[];
}

/**
 * El eje del Plan Rector de la ficha: el del proyecto del POA 2026 al que
 * corresponde, por su imputación confirmada (la principal, si hay varias).
 * Sin proyecto o sin imputación, no hay eje: no se adivina.
 */
export async function getEjeDeProyecto(
  proyectoId: string | null
): Promise<{ eje: string; ambito: string | null } | null> {
  if (!proyectoId) return null;
  const sb = await getSupabaseServer();
  const { data: vinculos } = await sb
    .from("proyecto_plan_rector")
    .select("nodo_id, principal")
    .eq("proyecto_id", proyectoId)
    .eq("estado", "confirmado")
    .order("principal", { ascending: false })
    .limit(1);
  let nodoId = (vinculos?.[0] as { nodo_id: string } | undefined)?.nodo_id ?? null;

  // Se sube desde el nodo imputado (eje, objetivo o línea) hasta el eje.
  type Nodo = { id: string; parent_id: string | null; tipo: string; nombre: string };
  let eje: Nodo | null = null;
  for (let i = 0; nodoId && i < 4; i++) {
    const { data } = await sb
      .from("plan_rector_nodo")
      .select("id, parent_id, tipo, nombre")
      .eq("id", nodoId)
      .maybeSingle();
    const n = data as Nodo | null;
    if (!n) break;
    if (n.tipo === "eje") {
      eje = n;
      break;
    }
    nodoId = n.parent_id;
  }
  if (!eje) return null;

  const { data: amb } = eje.parent_id
    ? await sb.from("plan_rector_nodo").select("nombre").eq("id", eje.parent_id).maybeSingle()
    : { data: null };
  return { eje: eje.nombre, ambito: (amb as { nombre: string } | null)?.nombre ?? null };
}
