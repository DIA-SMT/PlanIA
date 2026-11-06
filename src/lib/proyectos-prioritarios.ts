import { getSupabaseServer } from "./supabase/server";
import { getScopeUnidades, puedeCargarArea } from "./auth";
import type { PerfilUsuario } from "@/types/database";
import { ANIO_POA } from "./poa-2027";
import { rotuloCorto, type TipoNodoRector } from "./plan-rector-comun";
import {
  AREAS_CON_PRIORITARIOS,
  leerMetas,
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
  "id, unidad_id, anio, proyecto_id, nombre, diagnostico, unidad_medida, linea_base_total, linea_base_pendiente, linea_base_total_texto, linea_base_pendiente_texto, linea_base_anio, linea_base_fuente, linea_base_observaciones, plan_rector_eje_id, historial, metas, meta_anual, enlace_territorial, presupuesto_area, presupuesto_proyecto, periodicidad, justificacion_tecnica, updated_at";

/** PostgREST devuelve numeric como texto cuando no entra en un double: se pasa a número igual. */
function aNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizar(fila: Record<string, unknown>): ProyectoPrioritario {
  const metas = leerMetas(fila.metas);
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
    linea_base_total_texto: (fila.linea_base_total_texto as string | null) ?? null,
    linea_base_pendiente_texto: (fila.linea_base_pendiente_texto as string | null) ?? null,
    linea_base_observaciones: (fila.linea_base_observaciones as string | null) ?? null,
    plan_rector_eje_id: (fila.plan_rector_eje_id as string | null) ?? null,
    linea_base_anio: aNumero(fila.linea_base_anio),
    metas,
    // La primera meta manda; meta_anual solo si la ficha todavía no tiene lista.
    meta_anual: metas.length > 0 ? metas[0].valor : aNumero(fila.meta_anual),
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

/**
 * Quién edita los proyectos prioritarios de un área: los mismos que cargan su
 * POA 2027 (puedeCargarArea). Antes del 30.10 solo dejaba al director del área.
 */
export async function puedeEditarPrioritarios(perfil: PerfilUsuario, unidadId: string): Promise<boolean> {
  return puedeCargarArea(perfil, unidadId);
}

/**
 * 03.11: las áreas con proyectos prioritarios que el perfil puede cargar. Es
 * lo que ve una secretaría en Proyectos prioritarios: sus direcciones de la
 * lista, además de la suya si está.
 */
export async function getAreasPrioritariosACargo(perfil: PerfilUsuario): Promise<string[]> {
  const resumen = await getResumenPrioritarios();
  if (perfil.rol === "admin_funcional") return resumen.map((a) => a.id);
  const alcance = new Set(await getScopeUnidades(perfil));
  const roles = ["director", "secretario", "subsecretario", "coordinador"];
  if (!roles.includes(perfil.rol)) return [];
  return resumen.filter((a) => alcance.has(a.id)).map((a) => a.id);
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

/**
 * Las áreas con proyectos prioritarios y cuántas fichas cargó cada una, en el
 * orden de la lista. Para Planificación son todas; a una secretaría se le
 * filtra con getAreasPrioritariosACargo.
 */
export async function getResumenPrioritarios(): Promise<
  { id: string; nombre: string; codigo: string; fichas: number }[]
> {
  const sb = await getSupabaseServer();
  const codigos = Object.keys(AREAS_CON_PRIORITARIOS);
  const [{ data: unidades }, { data: fichas }] = await Promise.all([
    sb.from("unidad_organizacional").select("id, nombre, codigo").in("codigo", codigos).eq("activa", true),
    sb.from("proyecto_prioritario").select("unidad_id").eq("anio", ANIO_POA).is("deleted_at", null),
  ]);
  const porUnidad = new Map<string, number>();
  for (const f of (fichas ?? []) as { unidad_id: string }[]) {
    porUnidad.set(f.unidad_id, (porUnidad.get(f.unidad_id) ?? 0) + 1);
  }
  return ((unidades ?? []) as { id: string; nombre: string; codigo: string }[])
    .map((u) => ({ ...u, fichas: porUnidad.get(u.id) ?? 0 }))
    .sort((a, b) => codigos.indexOf(a.codigo) - codigos.indexOf(b.codigo));
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

/**
 * 30.10: qué proyectos del POA son prioritarios, para marcarlos en el Panel
 * Ejecutivo. Es prioritario el proyecto al que está vinculada una ficha de
 * proyecto prioritario. Sin la migración 059, vacío.
 */
export async function getProyectosPrioritariosIds(): Promise<Set<string>> {
  const sb = await getSupabaseServer();
  const { data, error } = await sb
    .from("proyecto_prioritario")
    .select("proyecto_id")
    .eq("anio", ANIO_POA)
    .not("proyecto_id", "is", null)
    .is("deleted_at", null);
  if (error) return new Set();
  return new Set(((data ?? []) as { proyecto_id: string }[]).map((f) => f.proyecto_id));
}

/** 30.10: todas las fichas que el usuario puede ver (la RLS acota), con su área. */
export async function getTodosLosPrioritarios(): Promise<
  (ProyectoPrioritario & { unidad_nombre: string })[]
> {
  const sb = await getSupabaseServer();
  const [{ data, error }, { data: unidades }] = await Promise.all([
    sb
      .from("proyecto_prioritario")
      .select(COLUMNAS)
      .eq("anio", ANIO_POA)
      .is("deleted_at", null)
      .order("created_at"),
    sb.from("unidad_organizacional").select("id, nombre, nombre_corto"),
  ]);
  if (error) throw error;
  const nombre = new Map(
    ((unidades ?? []) as { id: string; nombre: string; nombre_corto: string | null }[]).map((u) => [
      u.id,
      u.nombre_corto ?? u.nombre,
    ])
  );
  return ((data ?? []) as Record<string, unknown>[])
    .map(normalizar)
    .map((f) => ({ ...f, unidad_nombre: nombre.get(f.unidad_id) ?? "—" }));
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

export interface EjeDeFicha {
  eje: string;
  ambito: string | null;
  /** De dónde sale: la imputación del proyecto del POA 2026, o la ficha. */
  origen: "proyecto" | "ficha";
}

/**
 * El eje del Plan Rector de la ficha. Primero, el del proyecto del POA 2026 al
 * que corresponde, por su imputación confirmada (la principal, si hay varias).
 *
 * 05.11: "si no se asocia a la POA 2026, no permite cargar el ámbito y eje".
 * Sin proyecto, o con uno que no está imputado, vale el eje elegido en la
 * ficha (plan_rector_eje_id). Sin ninguno de los dos, no hay eje: no se
 * adivina.
 */
export async function getEjeDeFicha(ficha: {
  proyecto_id: string | null;
  plan_rector_eje_id: string | null;
}): Promise<EjeDeFicha | null> {
  const delProyecto = await getEjeDeProyecto(ficha.proyecto_id);
  if (delProyecto) return { ...delProyecto, origen: "proyecto" };
  const deLaFicha = await ejeYAmbito(ficha.plan_rector_eje_id);
  return deLaFicha ? { ...deLaFicha, origen: "ficha" } : null;
}

/** Los ejes del Plan Rector para elegir en la ficha, con su ámbito, en el orden del documento. */
export async function getEjesPlanRector(): Promise<{ id: string; rotulo: string; ambito: string }[]> {
  const sb = await getSupabaseServer();
  const { data } = await sb
    .from("plan_rector_nodo")
    .select("id, parent_id, tipo, codigo_cliente, nombre, nombre_corto, orden")
    .in("tipo", ["area_intervencion", "eje"])
    .eq("activa", true)
    .order("orden");
  type Nodo = {
    id: string;
    parent_id: string | null;
    tipo: TipoNodoRector;
    codigo_cliente: string | null;
    nombre: string;
    nombre_corto: string | null;
  };
  const nodos = (data ?? []) as Nodo[];
  return nodos
    .filter((n) => n.tipo === "area_intervencion")
    .flatMap((a) =>
      nodos
        .filter((e) => e.tipo === "eje" && e.parent_id === a.id)
        .map((e) => ({ id: e.id, rotulo: rotuloCorto(e), ambito: rotuloCorto(a) }))
    );
}

/** Un eje elegido a mano: tiene que existir, estar activo y ser un eje. */
export async function esEjePlanRector(nodoId: string): Promise<boolean> {
  const sb = await getSupabaseServer();
  const { data } = await sb
    .from("plan_rector_nodo")
    .select("id")
    .eq("id", nodoId)
    .eq("tipo", "eje")
    .eq("activa", true)
    .maybeSingle();
  return !!data;
}

async function getEjeDeProyecto(
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
  return ejeYAmbito((vinculos?.[0] as { nodo_id: string } | undefined)?.nodo_id ?? null);
}

/** El eje y el ámbito de un nodo del Plan Rector (eje, objetivo o línea). */
async function ejeYAmbito(desde: string | null): Promise<{ eje: string; ambito: string | null } | null> {
  const sb = await getSupabaseServer();
  let nodoId = desde;

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
