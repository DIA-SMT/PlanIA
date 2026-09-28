"use server";

import { revalidatePath } from "next/cache";
import { getPerfilActual, getScopeUnidades } from "./auth";
import { getSupabaseServer } from "./supabase/server";

/**
 * Editar UN campo de una ficha PRISMA, desde el previsualizador — 28.09.
 *
 * "Sería piola que se vea el pdf que se va a mandar y poder editar ahí en el
 * previsualizador."
 *
 * Se edita la FICHA y no el documento: lo que se corrige queda guardado como
 * dato, el documento se vuelve a armar solo y el año que viene el sistema sabe
 * de qué está hablando. Si se editara el texto del documento, lo escrito ahí
 * dejaría de coincidir con las fichas cargadas y nadie sabría cuál es el bueno.
 *
 * Va campo por campo y no con el formulario entero porque en el previsualizador
 * se toca un párrafo suelto: mandar los seis campos para cambiar uno pisaría lo
 * que otra persona haya guardado mientras tanto.
 */

/** Los campos de la ficha que se pueden tocar desde el documento. */
const CAMPOS = [
  "programa",
  "relevancia",
  "indicador",
  "meta_anual",
  "ancla",
  "codigo",
  // 28.09: los dos que el POA real usa y PRISMA no tenia.
  "periodo",
  "hito",
] as const;
export type CampoFicha = (typeof CAMPOS)[number];

export async function editarCampoFicha(
  id: string,
  campo: string,
  valor: string
): Promise<{ success: boolean; error?: string }> {
  if (!CAMPOS.includes(campo as CampoFicha)) {
    return { success: false, error: "Ese campo no se puede editar desde acá" };
  }
  const limpio = valor.trim();
  if (campo === "programa" && !limpio) {
    return { success: false, error: "El programa no puede quedar vacío" };
  }

  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, error: "No autenticado" };

  const sb = await getSupabaseServer();
  const { data: ficha } = await sb
    .from("ficha_prisma")
    .select("unidad_id")
    .eq("id", id)
    .single();
  if (!ficha) return { success: false, error: "No se encontró la ficha" };

  // La secretaría NO corrige la ficha de una dirección: la observa. Por eso acá
  // va el alcance de CARGA y no el de lectura (25.09).
  const alcance = await getScopeUnidades(perfil);
  if (!alcance.includes((ficha as { unidad_id: string }).unidad_id)) {
    return { success: false, error: "Esa ficha es de otra área: podés observarla, no editarla" };
  }

  const { error } = await sb
    .from("ficha_prisma")
    .update({ [campo]: limpio || null })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/poa-2027");
  revalidatePath("/poa-2027/exportar");
  revalidatePath("/poa-2027/mis-fichas");
  return { success: true };
}
