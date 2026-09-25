import { getSupabaseServer } from "@/lib/supabase/server";
import type { Actividad } from "@/lib/agenda-geo-comun";

/**
 * Las consultas de la Agenda Georreferenciada.
 *
 * Los tipos, los estados y los colores estan en `agenda-geo-comun.ts`, que no
 * importa nada del server y por eso lo pueden usar los componentes de cliente.
 * Se reexportan desde aca para que las pantallas de servidor traigan todo de un
 * solo lugar.
 */
export * from "@/lib/agenda-geo-comun";

const COLUMNAS =
  "id, fecha, hora_desde, hora_hasta, titulo, descripcion, unidad_id, tipo, estado, " +
  "lugar_texto, lat, lng, requiere_confirmacion, proyecto_id, briefing, created_at, updated_at, " +
  "unidad:unidad_organizacional(nombre, nombre_corto)";

/* eslint-disable @typescript-eslint/no-explicit-any */
const aActividad = (f: any): Actividad => ({
  ...f,
  unidad_nombre: f.unidad?.nombre_corto ?? f.unidad?.nombre ?? null,
});

/** Las actividades de un rango de fechas, ordenadas como se leen: por día y hora. */
export async function getActividades(opciones: {
  desde: string;
  hasta: string;
  unidadId?: string;
  tipo?: string;
  estado?: string;
}): Promise<Actividad[]> {
  const sb = await getSupabaseServer();
  let q = sb
    .from("actividad")
    .select(COLUMNAS)
    .is("deleted_at", null)
    .gte("fecha", opciones.desde)
    .lte("fecha", opciones.hasta);

  if (opciones.unidadId) q = q.eq("unidad_id", opciones.unidadId);
  if (opciones.tipo) q = q.eq("tipo", opciones.tipo);
  if (opciones.estado) q = q.eq("estado", opciones.estado);

  const { data, error } = await q.order("fecha").order("hora_desde", { nullsFirst: true });
  if (error) throw error;
  return (data ?? []).map(aActividad);
}

export async function getActividad(id: string): Promise<Actividad | null> {
  const sb = await getSupabaseServer();
  const { data, error } = await sb.from("actividad").select(COLUMNAS).eq("id", id).single();
  if (error) return null;
  return aActividad(data);
}

export interface CambioActividad {
  id: string;
  campo: string;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  cambiado_por_email: string | null;
  created_at: string;
}

export async function getHistorial(actividadId: string): Promise<CambioActividad[]> {
  const sb = await getSupabaseServer();
  const { data, error } = await sb
    .from("actividad_historial")
    .select("id, campo, valor_anterior, valor_nuevo, cambiado_por_email, created_at")
    .eq("actividad_id", actividadId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? []) as CambioActividad[];
}

/**
 * Los cuatro contadores de la cabecera.
 *
 * Una sola consulta y no cuatro: son cuatro recortes del mismo conjunto —lo que
 * pasa entre hoy y pasado mañana— y pedirlo cuatro veces es cuatro viajes para
 * contar lo mismo.
 */
export async function getResumen(hoy: string): Promise<{
  hoy: number;
  proximas48: number;
  porConfirmar: number;
  modificadas: number;
}> {
  const sb = await getSupabaseServer();
  const enDias = (n: number) => {
    const d = new Date(hoy + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  const { data, error } = await sb
    .from("actividad")
    .select("fecha, estado, requiere_confirmacion, updated_at")
    .is("deleted_at", null)
    .gte("fecha", hoy)
    .lte("fecha", enDias(2));
  if (error) return { hoy: 0, proximas48: 0, porConfirmar: 0, modificadas: 0 };

  const filas = (data ?? []) as any[];
  const vivas = filas.filter((f) => f.estado !== "suspendida");
  return {
    hoy: vivas.filter((f) => f.fecha === hoy).length,
    proximas48: vivas.filter((f) => f.fecha > hoy).length,
    // "Pendientes de confirmación": las que lo piden y todavía no se confirmaron.
    porConfirmar: vivas.filter((f) => f.requiere_confirmacion && f.estado === "programada").length,
    modificadas: vivas.filter((f) => String(f.updated_at).slice(0, 10) === hoy).length,
  };
}
