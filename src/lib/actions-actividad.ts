"use server";

import { revalidatePath } from "next/cache";
import { getPerfilActual, getScopeUnidades } from "./auth";
import { getSupabaseServer } from "./supabase/server";

/**
 * Alta, edición y baja de actividades de la Agenda Georreferenciada.
 *
 * Todo pasa por el cliente CON sesión: la RLS de la migración 052 es la que
 * manda y necesita saber quién está escribiendo. Las comprobaciones de acá son
 * para dar un error entendible — una fila que la RLS descarta no falla, afecta
 * cero filas y la pantalla diría "guardado" sin haber guardado nada.
 */

export interface ResultadoActividad {
  success: boolean;
  error?: string;
  id?: string;
}

interface DatosActividad {
  fecha: string;
  hora_desde?: string | null;
  hora_hasta?: string | null;
  titulo: string;
  descripcion?: string | null;
  unidad_id: string;
  tipo?: string;
  estado?: string;
  lugar_texto?: string | null;
  lat?: number | null;
  lng?: number | null;
  requiere_confirmacion?: boolean;
  briefing?: string | null;
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

async function puedeSobre(unidadId: string) {
  const perfil = await getPerfilActual();
  if (!perfil) return { error: "No autenticado" as const };
  const alcance = await getScopeUnidades(perfil);
  if (!alcance.includes(unidadId)) {
    return { error: "No podés cargar actividades en esa área" as const };
  }
  return { perfil };
}

export async function crearActividad(datos: DatosActividad): Promise<ResultadoActividad> {
  if (!datos.titulo?.trim()) return { success: false, error: "Falta el título" };
  if (!ES_FECHA.test(datos.fecha ?? "")) return { success: false, error: "Falta la fecha" };
  if (!datos.unidad_id) return { success: false, error: "Falta el área responsable" };

  const control = await puedeSobre(datos.unidad_id);
  if ("error" in control) return { success: false, error: control.error };

  const sb = await getSupabaseServer();
  const { data, error } = await sb
    .from("actividad")
    .insert({
      fecha: datos.fecha,
      hora_desde: datos.hora_desde || null,
      hora_hasta: datos.hora_hasta || null,
      titulo: datos.titulo.trim(),
      descripcion: datos.descripcion?.trim() || null,
      unidad_id: datos.unidad_id,
      tipo: datos.tipo || "otras",
      estado: datos.estado || "programada",
      lugar_texto: datos.lugar_texto?.trim() || null,
      lat: datos.lat ?? null,
      lng: datos.lng ?? null,
      requiere_confirmacion: datos.requiere_confirmacion ?? false,
      briefing: datos.briefing?.trim() || null,
      created_by: control.perfil.user_id,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath("/territorio");
  revalidatePath("/territorio/actividades");
  return { success: true, id: (data as { id: string }).id };
}

export async function editarActividad(
  id: string,
  datos: Partial<DatosActividad>
): Promise<ResultadoActividad> {
  const sb = await getSupabaseServer();
  const { data: actual } = await sb.from("actividad").select("unidad_id").eq("id", id).single();
  if (!actual) return { success: false, error: "No se encontró la actividad" };

  // Se controla el área ACTUAL y, si la están mudando, también la nueva: si no,
  // alguien podría sacar una actividad de un área en la que no puede escribir.
  for (const unidad of [(actual as { unidad_id: string }).unidad_id, datos.unidad_id]) {
    if (!unidad) continue;
    const control = await puedeSobre(unidad);
    if ("error" in control) return { success: false, error: control.error };
  }

  const cambios: Record<string, unknown> = {};
  if (datos.fecha !== undefined) {
    if (!ES_FECHA.test(datos.fecha)) return { success: false, error: "La fecha no es válida" };
    cambios.fecha = datos.fecha;
  }
  if (datos.titulo !== undefined) {
    if (!datos.titulo.trim()) return { success: false, error: "Falta el título" };
    cambios.titulo = datos.titulo.trim();
  }
  for (const campo of ["hora_desde", "hora_hasta", "lugar_texto", "descripcion", "briefing"] as const) {
    if (datos[campo] !== undefined) cambios[campo] = (datos[campo] as string)?.trim() || null;
  }
  for (const campo of ["unidad_id", "tipo", "estado", "lat", "lng", "requiere_confirmacion"] as const) {
    if (datos[campo] !== undefined) cambios[campo] = datos[campo];
  }
  if (Object.keys(cambios).length === 0) return { success: true, id };

  const { error } = await sb.from("actividad").update(cambios).eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/territorio");
  revalidatePath("/territorio/actividades");
  return { success: true, id };
}

/** Confirmar, poner en curso, dar por realizada o suspender. */
export async function cambiarEstadoActividad(
  id: string,
  estado: string
): Promise<ResultadoActividad> {
  const validos = ["programada", "confirmada", "en_curso", "realizada", "suspendida"];
  if (!validos.includes(estado)) return { success: false, error: "Ese estado no existe" };
  return editarActividad(id, { estado });
}

/**
 * Baja lógica. Es para el error de carga: una actividad que se cae de verdad se
 * marca `suspendida` y queda a la vista, que es lo que el pedido llama
 * mantener la trazabilidad.
 */
export async function borrarActividad(id: string): Promise<ResultadoActividad> {
  const sb = await getSupabaseServer();
  const { data: actual } = await sb.from("actividad").select("unidad_id").eq("id", id).single();
  if (!actual) return { success: false, error: "No se encontró la actividad" };
  const control = await puedeSobre((actual as { unidad_id: string }).unidad_id);
  if ("error" in control) return { success: false, error: control.error };

  const { error } = await sb
    .from("actividad")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/territorio");
  revalidatePath("/territorio/actividades");
  return { success: true, id };
}
