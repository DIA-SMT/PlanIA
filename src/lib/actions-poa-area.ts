"use server";

import { revalidatePath } from "next/cache";
import { getPerfilActual, getScopeUnidades } from "./auth";
import { getSupabaseServer } from "./supabase/server";
import { ANIO_POA } from "./poa-2027";

/**
 * Enviar el POA de un área hacia arriba, y observar una ficha ajena — 25.09.
 *
 * El envío es del POA del área entero, no de cada ficha: "las direcciones mandan
 * sus POAs a las subsecretarías; después las subsecretarías mandan su POA a la
 * secretaría".
 */

export interface ResultadoPoa {
  success: boolean;
  error?: string;
}

async function puedeSobre(unidadId: string) {
  const perfil = await getPerfilActual();
  if (!perfil) return { error: "No autenticado" as const };
  const alcance = await getScopeUnidades(perfil);
  if (!alcance.includes(unidadId)) return { error: "Esa área no es tuya" as const };
  return { perfil };
}

/**
 * Marca el POA del área como enviado.
 *
 * No congela nada: pidieron que la ficha siga editable después. Lo que queda es
 * la fecha, que es lo que después le permite a quien recibe ver si algo se tocó
 * más tarde.
 */
export async function enviarPoaDelArea(unidadId: string): Promise<ResultadoPoa> {
  const control = await puedeSobre(unidadId);
  if ("error" in control) return { success: false, error: control.error };

  const sb = await getSupabaseServer();

  // Sin fichas no hay nada que mandar, y mandar un POA vacío haría que el de
  // arriba lo dé por terminado.
  const { count } = await sb
    .from("ficha_prisma")
    .select("id", { count: "exact", head: true })
    .eq("unidad_id", unidadId)
    .is("deleted_at", null);
  if (!count) {
    return { success: false, error: "No hay ninguna ficha cargada para enviar." };
  }

  const { error } = await sb.from("poa_area").upsert(
    {
      unidad_id: unidadId,
      anio: ANIO_POA,
      estado: "enviado",
      enviado_at: new Date().toISOString(),
      enviado_por: control.perfil.user_id,
    },
    { onConflict: "unidad_id,anio" }
  );
  if (error) return { success: false, error: error.message };

  revalidatePath("/poa-2027");
  return { success: true };
}

/** Vuelve el POA a borrador: se manda de nuevo cuando esté listo. */
export async function reabrirPoaDelArea(unidadId: string): Promise<ResultadoPoa> {
  const control = await puedeSobre(unidadId);
  if ("error" in control) return { success: false, error: control.error };

  const sb = await getSupabaseServer();
  const { error } = await sb
    .from("poa_area")
    .update({ estado: "borrador", enviado_at: null, enviado_por: null })
    .eq("unidad_id", unidadId)
    .eq("anio", ANIO_POA);
  if (error) return { success: false, error: error.message };

  revalidatePath("/poa-2027");
  return { success: true };
}

/**
 * Deja una observación sobre una ficha.
 *
 * "La secretaría no puede corregir, pero puede hacer observaciones". Por eso
 * esto no toca la ficha: solo le cuelga un comentario, y el área dueña la
 * corrige si está de acuerdo.
 *
 * Quién puede observar lo decide la RLS: cualquiera que pueda VER la ficha, que
 * en la práctica son el área dueña y las de arriba.
 */
export async function observarFicha(fichaId: string, texto: string): Promise<ResultadoPoa> {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, error: "No autenticado" };
  if (!texto?.trim()) return { success: false, error: "Escribí la observación" };

  const sb = await getSupabaseServer();
  const { error } = await sb.from("ficha_observacion").insert({
    ficha_id: fichaId,
    texto: texto.trim(),
    autor_id: perfil.user_id,
    autor_email: perfil.email,
  });
  if (error) return { success: false, error: error.message };

  revalidatePath("/poa-2027");
  return { success: true };
}

/** La marca como saldada. Solo el que la escribió, por la RLS. */
export async function resolverObservacion(id: string): Promise<ResultadoPoa> {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, error: "No autenticado" };

  const sb = await getSupabaseServer();
  const { error } = await sb
    .from("ficha_observacion")
    .update({ resuelta_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/poa-2027");
  return { success: true };
}
