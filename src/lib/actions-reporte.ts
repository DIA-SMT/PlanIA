"use server";

/**
 * Bloque 3 del reporte trimestral: el análisis que redacta Planificación.
 *
 * Se guarda como borrador mientras se escribe y se publica cuando está listo.
 * Mientras es borrador solo lo ve Planificación: es un texto sobre la gestión
 * de un secretario, y no tiene por qué leerlo a medio escribir.
 */
import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "./supabase/server";
import { getPerfilActual } from "./auth";

type Resultado = { success: boolean; error?: string };

/** Límite por campo. Es un párrafo de informe, no un anexo. */
const MAX_CAMPO = 4000;

async function registrarHistorial(
  analisisId: string,
  accion: string,
  texto: { balance: string | null; desvios: string | null; oportunidades: string | null },
  estadoResultante: "borrador" | "publicado"
) {
  try {
    const sb = await getSupabaseServer();
    const perfil = await getPerfilActual();
    await sb.from("reporte_analisis_historial").insert({
      analisis_id: analisisId,
      accion,
      balance: texto.balance,
      desvios: texto.desvios,
      oportunidades: texto.oportunidades,
      estado_resultante: estadoResultante,
      registrado_por: perfil?.user_id ?? null,
      registrado_por_email: perfil?.email ?? null,
      registrado_por_nombre: perfil?.nombre ?? null,
    });
  } catch {
    // El historial es deseable, no bloqueante.
  }
}

function limpiar(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/**
 * Guarda el análisis de un área para un trimestre. Crea la fila si no existe.
 *
 * `publicar` pasa el estado a publicado, que es lo que lo hace visible para el
 * área. Sin `publicar` queda o vuelve a borrador.
 */
export async function guardarAnalisisReporte(input: {
  anio: number;
  trimestre: number;
  unidad_id: string;
  balance?: string | null;
  desvios?: string | null;
  oportunidades?: string | null;
  publicar?: boolean;
}): Promise<Resultado & { estado?: "borrador" | "publicado" }> {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, error: "No autenticado" };
  if (perfil.rol !== "admin_funcional") {
    return { success: false, error: "Solo Planificación Estratégica redacta el análisis" };
  }
  if (!Number.isInteger(input.trimestre) || input.trimestre < 1 || input.trimestre > 4) {
    return { success: false, error: "El trimestre tiene que ser 1, 2, 3 o 4" };
  }
  if (!input.unidad_id) return { success: false, error: "Falta el área del informe" };

  const balance = limpiar(input.balance);
  const desvios = limpiar(input.desvios);
  const oportunidades = limpiar(input.oportunidades);

  for (const [nombre, valor] of [["Balance", balance], ["Desvíos", desvios], ["Oportunidades", oportunidades]] as const) {
    if (valor && valor.length > MAX_CAMPO) {
      return { success: false, error: `${nombre}: no puede pasar de ${MAX_CAMPO} caracteres` };
    }
  }

  // No se publica una página en blanco con firma. La base también lo impide,
  // pero acá el mensaje es entendible.
  if (input.publicar && !balance && !desvios && !oportunidades) {
    return { success: false, error: "No se puede publicar un análisis con los tres campos vacíos" };
  }

  const sb = await getSupabaseServer();
  const { data: periodo } = await sb.from("periodo").select("id").eq("activo", true).single();
  if (!periodo) return { success: false, error: "No hay período activo" };
  const periodoId = (periodo as { id: string }).id;

  // Guardar NO despublica. Antes, "Guardar borrador" sobre un análisis ya
  // publicado lo bajaba a borrador y avisaba "Borrador guardado": el bloque 3
  // desaparecía de la vista del área sin que nadie lo pidiera, y se perdía la
  // firma de publicación. Despublicar es una acción aparte y explícita.
  const { data: previo } = await sb
    .from("reporte_analisis")
    .select("estado, publicado_at, publicado_por")
    .eq("anio", input.anio)
    .eq("trimestre", input.trimestre)
    .eq("unidad_id", input.unidad_id)
    .maybeSingle();
  const yaPublicado = (previo as { estado?: string } | null)?.estado === "publicado";
  const p = previo as { publicado_at?: string; publicado_por?: string } | null;

  const estado: "borrador" | "publicado" =
    input.publicar || yaPublicado ? "publicado" : "borrador";

  const fila = {
    periodo_id: periodoId,
    anio: input.anio,
    trimestre: input.trimestre,
    unidad_id: input.unidad_id,
    balance,
    desvios,
    oportunidades,
    estado,
    // Si ya estaba publicado y esto es un guardado, se conserva la firma
    // original. Si es una publicación nueva, se firma ahora.
    publicado_at: input.publicar
      ? new Date().toISOString()
      : yaPublicado
      ? p?.publicado_at ?? new Date().toISOString()
      : null,
    publicado_por: input.publicar ? perfil.user_id : yaPublicado ? p?.publicado_por ?? null : null,
    actualizado_por: perfil.user_id,
    actualizado_por_email: perfil.email ?? null,
  };

  const { data, error } = await sb
    .from("reporte_analisis")
    .upsert(fila, { onConflict: "anio,trimestre,unidad_id" })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501") {
      return { success: false, error: "No tenés permiso para escribir el análisis" };
    }
    return { success: false, error: error.message };
  }

  await registrarHistorial(
    (data as { id: string }).id,
    input.publicar ? "publicacion" : yaPublicado ? "guardado-publicado" : "guardado",
    { balance, desvios, oportunidades },
    estado
  );

  revalidatePath("/reportes");
  return { success: true, estado };
}

/** Vuelve un análisis publicado a borrador, para corregirlo. */
export async function despublicarAnalisisReporte(input: {
  anio: number;
  trimestre: number;
  unidad_id: string;
}): Promise<Resultado> {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, error: "No autenticado" };
  if (perfil.rol !== "admin_funcional") {
    return { success: false, error: "Solo Planificación Estratégica puede despublicar" };
  }

  const sb = await getSupabaseServer();
  const { data, error } = await sb
    .from("reporte_analisis")
    .update({
      estado: "borrador",
      publicado_at: null,
      publicado_por: null,
      actualizado_por: perfil.user_id,
      actualizado_por_email: perfil.email ?? null,
    })
    .eq("anio", input.anio)
    .eq("trimestre", input.trimestre)
    .eq("unidad_id", input.unidad_id)
    .select("id, balance, desvios, oportunidades")
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "No hay análisis para ese trimestre y área" };

  const d = data as { id: string; balance: string | null; desvios: string | null; oportunidades: string | null };
  await registrarHistorial(
    d.id,
    "despublicacion",
    { balance: d.balance, desvios: d.desvios, oportunidades: d.oportunidades },
    "borrador"
  );

  revalidatePath("/reportes");
  return { success: true };
}
