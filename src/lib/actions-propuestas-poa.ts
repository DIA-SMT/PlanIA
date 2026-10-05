"use server";

import { revalidatePath } from "next/cache";
import { getPerfilActual, getScopeUnidades } from "./auth";
import { getSupabaseServer } from "./supabase/server";
import { ANIO_POA } from "./poa-2027";

/**
 * Traer los proyectos del POA 2026 como propuestas para el 2027 — 28.09.
 *
 * "No podemos hacer que se reconozcan automáticamente mis proyectos y en la
 * parte mis fichas yo lo termine de completar con la info y acepte para que vaya
 * a mi poa?"
 *
 * Es el pedido del 09.09: "una POA a medias, ya avanzada, para que sea menos
 * trabajo cargar la POA". Cada proyecto activo del área se convierte en una
 * ficha PROPUESTA con lo que ya sabemos de él, y el área la completa y la
 * acepta. Hasta que no la acepten, no entra en el documento.
 *
 * ES UN BOTÓN Y NO PASA SOLO al abrir la pantalla. Abrir una pantalla no debería
 * escribir en la base: si el día que alguien entra por error se le crean
 * cuarenta fichas, después hay que explicar de dónde salieron.
 */

export interface ResultadoPropuestas {
  success: boolean;
  error?: string;
  creadas?: number;
  yaEstaban?: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function traerProyectosDe2026(unidadId: string): Promise<ResultadoPropuestas> {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, error: "No autenticado" };

  const alcance = await getScopeUnidades(perfil);
  if (!alcance.includes(unidadId)) {
    return { success: false, error: "Esa área no es tuya" };
  }

  const sb = await getSupabaseServer();

  const { data: proyectos, error: eProy } = await sb
    .from("proyecto")
    .select("id, codigo, nombre, descripcion, objetivo, fecha_inicio, fecha_fin, metadata")
    .eq("unidad_id", unidadId)
    .eq("estado", "activo")
    .is("deleted_at", null)
    .order("nombre");
  if (eProy) return { success: false, error: eProy.message };
  if (!proyectos?.length) {
    return { success: false, error: "Tu área no tiene proyectos cargados en el POA 2026." };
  }

  // Las que ya se trajeron antes: el índice único las rechazaría igual, pero así
  // se puede decir cuántas se crearon de verdad.
  const { data: yaHay } = await sb
    .from("ficha_prisma")
    .select("proyecto_origen_id")
    .eq("anio", ANIO_POA)
    .is("deleted_at", null)
    .not("proyecto_origen_id", "is", null);
  const traidos = new Set(((yaHay ?? []) as any[]).map((f) => f.proyecto_origen_id));

  const nuevas = (proyectos as any[]).filter((p) => !traidos.has(p.id));
  if (nuevas.length === 0) {
    return { success: true, creadas: 0, yaEstaban: proyectos.length };
  }

  const filas = nuevas.map((p) => fichaPropuestaDe(p, unidadId, perfil.user_id));

  const { error } = await sb.from("ficha_prisma").insert(filas);
  if (error) return { success: false, error: error.message };

  revalidatePath("/poa-2027");
  revalidatePath("/poa-2027/mis-fichas");
  return { success: true, creadas: filas.length, yaEstaban: proyectos.length - filas.length };
}

/**
 * La ficha propuesta que sale de un proyecto del 2026.
 *
 * Vive aparte porque la usan dos botones —el de cada área y el de Planificación,
 * que trae las de todas— y tienen que armar exactamente lo mismo. Si cada uno
 * tuviera su copia, el día que se agregue un campo una de las dos lo olvida.
 */
function fichaPropuestaDe(p: any, unidadId: string, userId: string) {
  // Lo que el libro del POA trajo de cada proyecto, importado en septiembre.
  const libro = p.metadata?.libro_poa ?? {};
  return {
    unidad_id: unidadId,
    anio: ANIO_POA,
    estado: "propuesta",
    proyecto_origen_id: p.id,
    codigo: p.codigo ?? null,
    programa: p.nombre,
    relevancia: p.descripcion || p.objetivo || null,
    // La meta y la línea de base del libro son texto redactado, que es
    // exactamente lo que el POA pide.
    meta_anual: libro.meta ?? null,
    ancla: libro.linea_base ?? null,
    periodo: libro.periodo ?? periodoDeFechas(p.fecha_inicio, p.fecha_fin),
    hito: libro.hito ?? null,
    indicador: null,
    created_by: userId,
  };
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "de marzo a diciembre de 2027", armado con las fechas del proyecto. */
function periodoDeFechas(inicio: string | null, fin: string | null): string | null {
  if (!inicio) return null;
  const mes = (f: string) => MESES[Number(f.slice(5, 7)) - 1] ?? "";
  // El período que se propone es el del AÑO QUE VIENE: se copia la forma del
  // proyecto de 2026, no sus fechas, que ya pasaron.
  return fin
    ? `de ${mes(inicio)} a ${mes(fin)} de ${ANIO_POA}`
    : `desde ${mes(inicio)} de ${ANIO_POA}`;
}

export interface ResultadoTodas {
  success: boolean;
  error?: string;
  creadas?: number;
  areas?: number;
  yaEstaban?: number;
}

/**
 * Traer los proyectos 2026 de TODAS las áreas como propuestas — 05.10.
 *
 * "La idea es que ustedes carguen y nosotros editamos." Es el mismo botón que
 * tiene cada área, pero para las que todavía no lo apretaron: medido el 05.10,
 * 407 proyectos de 49 áreas. Solo Planificación Estratégica.
 *
 * Lo que NO hace, y por qué es seguro apretarlo:
 *   - No acepta nada. Son propuestas: no entran en el documento de ningún área
 *     hasta que alguien las revise y las acepte.
 *   - No toca lo que ya existe: ni las fichas ya traídas ni las cargadas a mano.
 *   - Apretarlo dos veces no duplica, por el índice único de la 054.
 *
 * Cada ficha queda en el área de su proyecto, no en Planificación.
 *
 * Copia lo que hay en el 2026, errores incluidos. El 05.10 se encontraron dos:
 * BAM (PRY348) traía pegada la presentación del programa EDUCÁ —ya limpiado— y
 * "Mes de la mujer" (PRY134) tiene la descripción del Tráiler de Salud.
 */
export async function traerProyectosDe2026ParaTodas(): Promise<ResultadoTodas> {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, error: "No autenticado" };
  if (perfil.rol !== "admin_funcional") {
    return { success: false, error: "Solo Planificación Estratégica puede traer los proyectos de todas las áreas." };
  }

  const sb = await getSupabaseServer();

  // Paginado: PostgREST corta en 1000 filas y hoy son 495, pero no va a ser
  // siempre así, y cortar en silencio es justo lo que no puede pasar acá.
  const proyectos: any[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb
      .from("proyecto")
      .select("id, codigo, nombre, descripcion, objetivo, fecha_inicio, fecha_fin, metadata, unidad_id")
      .eq("estado", "activo")
      .is("deleted_at", null)
      .order("nombre")
      .range(desde, desde + 999);
    if (error) return { success: false, error: error.message };
    proyectos.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const { data: yaHay, error: eYa } = await sb
    .from("ficha_prisma")
    .select("proyecto_origen_id")
    .eq("anio", ANIO_POA)
    .is("deleted_at", null)
    .not("proyecto_origen_id", "is", null);
  if (eYa) return { success: false, error: eYa.message };
  const traidos = new Set(((yaHay ?? []) as any[]).map((f) => f.proyecto_origen_id));

  const nuevas = proyectos.filter((p) => p.unidad_id && !traidos.has(p.id));
  if (nuevas.length === 0) {
    return { success: true, creadas: 0, areas: 0, yaEstaban: proyectos.length };
  }

  const filas = nuevas.map((p) => fichaPropuestaDe(p, p.unidad_id, perfil.user_id));

  // De a 200: un solo insert de 400 filas anda, pero si falla a la mitad no se
  // sabe hasta dónde llegó. Por tandas, lo que entró queda contado.
  let creadas = 0;
  for (let i = 0; i < filas.length; i += 200) {
    const tanda = filas.slice(i, i + 200);
    const { error } = await sb.from("ficha_prisma").insert(tanda);
    if (error) {
      return {
        success: false,
        error: `Se cortó después de crear ${creadas} de ${filas.length}: ${error.message}. Volver a apretar sigue desde donde quedó.`,
        creadas,
      };
    }
    creadas += tanda.length;
  }

  revalidatePath("/poa-2027");
  revalidatePath("/poa-2027/mis-fichas");
  return {
    success: true,
    creadas,
    areas: new Set(nuevas.map((p) => p.unidad_id)).size,
    yaEstaban: proyectos.length - nuevas.length,
  };
}

/** El área hace suya la propuesta: recién ahí entra en el documento. */
export async function aceptarFicha(id: string): Promise<{ success: boolean; error?: string }> {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, error: "No autenticado" };

  const sb = await getSupabaseServer();
  const { data: ficha } = await sb
    .from("ficha_prisma")
    .select("unidad_id, programa")
    .eq("id", id)
    .single();
  if (!ficha) return { success: false, error: "No se encontró la ficha" };

  const alcance = await getScopeUnidades(perfil);
  if (!alcance.includes((ficha as any).unidad_id)) {
    return { success: false, error: "Esa ficha es de otra área" };
  }

  const { error } = await sb.from("ficha_prisma").update({ estado: "aceptada" }).eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/poa-2027");
  revalidatePath("/poa-2027/mis-fichas");
  return { success: true };
}

/** Vuelve la ficha a propuesta: sale del documento hasta que la acepten de nuevo. */
export async function volverAPropuesta(id: string): Promise<{ success: boolean; error?: string }> {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, error: "No autenticado" };

  const sb = await getSupabaseServer();
  const { data: ficha } = await sb.from("ficha_prisma").select("unidad_id").eq("id", id).single();
  if (!ficha) return { success: false, error: "No se encontró la ficha" };

  const alcance = await getScopeUnidades(perfil);
  if (!alcance.includes((ficha as any).unidad_id)) {
    return { success: false, error: "Esa ficha es de otra área" };
  }

  const { error } = await sb.from("ficha_prisma").update({ estado: "propuesta" }).eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/poa-2027");
  revalidatePath("/poa-2027/mis-fichas");
  return { success: true };
}
