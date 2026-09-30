"use server";

import { revalidatePath } from "next/cache";
import { getPerfilActual, getScopeUnidades } from "./auth";
import { getSupabaseServer } from "./supabase/server";
import { BUCKET_DOCUMENTOS, TAMANO_MAXIMO_DOCUMENTO } from "./agenda-geo-comun";

/**
 * Los archivos adjuntos de una actividad — etapa 4 del plan del 22.09.
 *
 * Es la primera vez que el proyecto guarda archivos: hasta ahora todo era texto
 * y números en tablas. El archivo vive en el bucket `actividad-documentos` de
 * Supabase Storage y la fila de `actividad_documento` dice de qué actividad es,
 * quién lo subió y cuándo.
 *
 * Todo pasa por el cliente CON sesión, igual que el resto: la RLS de la
 * migración 055 es la que manda, tanto sobre la tabla como sobre el bucket. Las
 * comprobaciones de acá son para dar un error entendible antes de intentarlo.
 */

export interface ResultadoDocumento {
  success: boolean;
  error?: string;
}

/**
 * Un nombre de archivo que sobreviva a una ruta de Storage.
 *
 * Los nombres reales traen tildes, espacios y paréntesis —"Acta Nº 3 (final).pdf"—
 * y eso en una ruta termina en errores raros o en archivos que no se pueden
 * bajar. Se guarda limpio en el bucket y completo en la tabla, que es lo que se
 * muestra.
 */
function rutaSegura(nombre: string): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\w.\- ]/g, "")
    .replace(/\s+/g, "-")
    .slice(-80);
  return `${Date.now()}-${limpio || "archivo"}`;
}

async function puedeSobreActividad(actividadId: string) {
  const perfil = await getPerfilActual();
  if (!perfil) return { error: "No autenticado" as const };
  const sb = await getSupabaseServer();
  const { data } = await sb
    .from("actividad")
    .select("unidad_id")
    .eq("id", actividadId)
    .single();
  if (!data) return { error: "No se encontró la actividad" as const };
  const alcance = await getScopeUnidades(perfil);
  const unidad = (data as { unidad_id: string }).unidad_id;
  if (!alcance.includes(unidad)) {
    return { error: "Esa actividad es de otra área" as const };
  }
  return { perfil };
}

export async function subirDocumento(
  actividadId: string,
  datos: FormData
): Promise<ResultadoDocumento> {
  const control = await puedeSobreActividad(actividadId);
  if ("error" in control) return { success: false, error: control.error };

  const archivo = datos.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { success: false, error: "No llegó ningún archivo" };
  }
  if (archivo.size > TAMANO_MAXIMO_DOCUMENTO) {
    const mb = (archivo.size / 1024 / 1024).toFixed(1);
    return { success: false, error: `El archivo pesa ${mb} MB y el máximo son 10 MB.` };
  }

  const sb = await getSupabaseServer();
  // La primera carpeta ES el id de la actividad: de ahí sacan las políticas del
  // bucket a qué área pertenece el archivo. Cambiar esta forma las deja ciegas.
  const ruta = `${actividadId}/${rutaSegura(archivo.name)}`;

  const subida = await sb.storage.from(BUCKET_DOCUMENTOS).upload(ruta, archivo, {
    contentType: archivo.type || undefined,
    upsert: false,
  });
  if (subida.error) {
    return {
      success: false,
      error: subida.error.message.includes("Bucket not found")
        ? "Falta crear el bucket: aplicá la migración 055."
        : subida.error.message,
    };
  }

  const { error } = await sb.from("actividad_documento").insert({
    actividad_id: actividadId,
    nombre: archivo.name,
    ruta,
    tipo_mime: archivo.type || null,
    tamano_bytes: archivo.size,
    subido_por: control.perfil.user_id,
    subido_por_email: control.perfil.email,
  });
  if (error) {
    // Si la fila no entra, el archivo queda huérfano en el bucket y nadie lo va
    // a encontrar nunca. Se limpia antes de devolver el error.
    await sb.storage.from(BUCKET_DOCUMENTOS).remove([ruta]);
    return { success: false, error: error.message };
  }

  revalidatePath(`/territorio/actividades/${actividadId}`);
  return { success: true };
}

export async function borrarDocumento(
  actividadId: string,
  documentoId: string
): Promise<ResultadoDocumento> {
  const control = await puedeSobreActividad(actividadId);
  if ("error" in control) return { success: false, error: control.error };

  const sb = await getSupabaseServer();
  const { data } = await sb
    .from("actividad_documento")
    .select("ruta")
    .eq("id", documentoId)
    .eq("actividad_id", actividadId)
    .single();
  if (!data) return { success: false, error: "No se encontró el documento" };

  // Primero la fila y después el archivo: si se cae en el medio, queda un
  // archivo sin fila —invisible y sin costo— y no una fila apuntando a un
  // archivo que ya no existe, que es un enlace roto a la vista de todos.
  const { error } = await sb.from("actividad_documento").delete().eq("id", documentoId);
  if (error) return { success: false, error: error.message };
  await sb.storage.from(BUCKET_DOCUMENTOS).remove([(data as { ruta: string }).ruta]);

  revalidatePath(`/territorio/actividades/${actividadId}`);
  return { success: true };
}
