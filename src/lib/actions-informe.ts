"use server";

import { getPerfilActual } from "./auth";
import { getSupabaseAdmin } from "./supabase/admin";
import {
  armarReporte,
  getUnidadesParaReporte,
  type ConteoEstados,
} from "./reporte-trimestral";
import { calcularFotoCorte } from "./corte-trimestral";
import { avanceGlobalPorConteo } from "./utils";

/**
 * Manda el informe de avance por correo a cada responsable de área.
 *
 * 18.09, párrafo 1033: "la idea es que le llegue el informe a cada mail, a cada
 * secretario, subsecretario y director".
 *
 * QUIÉN LO RECIBE: el perfil activo con correo cargado cuyo rol sea secretario,
 * subsecretario o director, y cuya unidad tenga proyectos. Cada uno recibe el
 * informe DE SU ÁREA y solo el de su área — el mismo criterio que la pantalla.
 * Si dos personas comparten unidad, las dos lo reciben.
 *
 * QUIÉN LO DISPARA: Planificación Estratégica, desde la pantalla de cortes, y a
 * mano. No sale solo al cerrar el trimestre a propósito: son 68 correos y el día
 * que el cierre caiga en un feriado o falte cargar la mitad del POA, conviene
 * que alguien decida cuándo se manda.
 *
 * El correo lleva los números del área y el enlace al informe completo, no un
 * PDF adjunto: el PDF lo genera el navegador al imprimir, y armarlo en el
 * servidor obligaría a meter un navegador entero en el despliegue.
 */

export interface ResultadoEnvioInformes {
  success: boolean;
  error?: string;
  /** Cuántas personas recibieron el correo. */
  enviados?: number;
  /** Responsables sin correo cargado, que no pudieron recibirlo. */
  sinCorreo?: number;
  /** Áreas sin ningún responsable cargado: nadie recibió su informe. */
  areasSinResponsable?: number;
  detalle?: string;
}

const ROLES_QUE_RECIBEN = ["secretario", "subsecretario", "director"];

/** Las tres líneas de números que van en el cuerpo. */
function resumen(t: ConteoEstados): string {
  const pct = (n: number) => (t.proyectos === 0 ? 0 : Math.round((n / t.proyectos) * 100));
  return [
    `Avance: ${avanceGlobalPorConteo({ verde: t.finalizados, amarillo: t.en_ejecucion, rojo: t.no_iniciados, sin_datos: t.sin_datos }) ?? 0} % — proyectos finalizados y en ejecución sobre el total (${t.finalizados + t.en_ejecucion} de ${t.proyectos})`,
    `Proyectos registrados en SIPEM: ${t.proyectos}`,
    `  Finalizados: ${t.finalizados} (${pct(t.finalizados)} %)`,
    `  En ejecución: ${t.en_ejecucion} (${pct(t.en_ejecucion)} %)`,
    `  No iniciados: ${t.no_iniciados} (${pct(t.no_iniciados)} %)`,
    `  Sin datos: ${t.sin_datos} (${pct(t.sin_datos)} %)`,
  ].join("\n");
}

export async function enviarInformesPorCorreo(opciones: {
  /** El corte del que salen los números. Sin él, los datos del día. */
  corteId?: string;
  /** Si es true no manda nada: solo cuenta a cuántos les llegaría. */
  ensayo?: boolean;
}): Promise<ResultadoEnvioInformes> {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, error: "No autenticado" };
  if (perfil.rol !== "admin_funcional") {
    return { success: false, error: "Solo Planificación Estratégica puede enviar los informes." };
  }

  const sb = getSupabaseAdmin();

  // ---- Las filas del informe ----
  let filas: unknown[];
  let etiqueta: string;
  if (opciones.corteId) {
    const { data: corte, error } = await sb
      .from("corte_trimestral")
      .select("id, anio, trimestre, fecha_corte")
      .eq("id", opciones.corteId)
      .single();
    if (error || !corte) return { success: false, error: "No se encontró ese corte." };
    const { data, error: eFilas } = await sb
      .from("corte_trimestral_proyecto")
      .select("*")
      .eq("corte_id", opciones.corteId);
    if (eFilas) return { success: false, error: eFilas.message };
    filas = data ?? [];
    const c = corte as { anio: number; trimestre: number };
    etiqueta = `${c.trimestre}° trimestre ${c.anio}`;
  } else {
    const foto = await calcularFotoCorte();
    filas = foto.filas;
    etiqueta = "estado del día";
  }

  // ---- Quién recibe qué ----
  const unidades = await getUnidadesParaReporte();
  const { data: perfiles, error: ePerfiles } = await sb
    .from("perfil_usuario")
    .select("email, nombre, rol, unidad_id, activo")
    .eq("activo", true);
  if (ePerfiles) return { success: false, error: ePerfiles.message };

  const responsables = ((perfiles ?? []) as Array<{
    email: string | null;
    nombre: string | null;
    rol: string;
    unidad_id: string | null;
  }>).filter((p) => ROLES_QUE_RECIBEN.includes(p.rol) && p.unidad_id);

  const sinCorreo = responsables.filter((p) => !p.email?.includes("@")).length;

  const base = process.env.PLANIA_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? null;
  const { enviarCorreoAVarios } = await import("./correo");

  let enviados = 0;
  const errores: string[] = [];
  const areasConInforme = new Set<string>();

  for (const p of responsables) {
    if (!p.email?.includes("@")) continue;
    const unidad = unidades.find((u) => u.id === p.unidad_id);
    if (!unidad) continue;

    const reporte = armarReporte(filas as never[], null, "corte", unidad, unidades);
    // Un área sin un solo proyecto no recibe un informe en blanco.
    if (reporte.totalUnidad.proyectos === 0) continue;
    areasConInforme.add(unidad.id);

    const enlace = base ? `${base.replace(/\/$/, "")}/reportes?u=${unidad.id}&corte=ultimo` : null;
    const texto =
      `Informe de Avance de la Planificación Operativa Anual — ${etiqueta}\n` +
      `${unidad.nombre}\n\n` +
      `${resumen(reporte.totalUnidad)}\n` +
      (enlace ? `\nEl informe completo, con el detalle de cada proyecto:\n${enlace}\n` : "") +
      `\n— Dirección de Planificación Estratégica, Municipalidad de San Miguel de Tucumán.`;

    if (opciones.ensayo) {
      enviados++;
      continue;
    }

    const r = await enviarCorreoAVarios({
      para: [p.email],
      asunto: `SIPEM: Informe de Avance ${etiqueta} — ${unidad.nombre}`,
      texto,
    });
    if (!r.configurado) {
      return {
        success: false,
        error: "El envío de correo no está configurado. Cargá las variables de SMTP y volvé a intentar.",
      };
    }
    enviados += r.enviados;
    if (r.errores[0]) errores.push(r.errores[0]);
  }

  const conProyectos = new Set(
    (filas as Array<{ unidad_id?: string }>).map((f) => f.unidad_id).filter(Boolean) as string[]
  );
  const areasSinResponsable = [...conProyectos].filter(
    (id) => !responsables.some((p) => p.unidad_id === id)
  ).length;

  return {
    success: true,
    enviados,
    sinCorreo,
    areasSinResponsable,
    detalle: errores[0],
  };
}
