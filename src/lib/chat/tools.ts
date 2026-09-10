import { supabase } from "@/lib/supabase";
import { getSupabaseServer } from "@/lib/supabase/server";
// La carga de indicadores por chat delega en el Server Action de la pantalla:
// un solo camino de escritura, con historial y propagación a la meta. (24.08)
import { actualizarIndicador as actualizarIndicadorAction } from "@/lib/actions";
import { coincideBusqueda, normalizarBusqueda } from "@/lib/utils";
/* eslint-disable @typescript-eslint/no-explicit-any */

// -------------------------------------------------------
// Chat Tools: funciones de lectura que el modelo puede invocar.
// Solo lectura. Sin escritura. Datos reales.
// -------------------------------------------------------

/**
 * Los ids de un área y de TODO lo que cuelga de ella.
 *
 * Corrige un bug del 10.09 que estaba en las cinco herramientas que filtran por
 * área: todas hacían `.eq("parent_id", unidad_id)`, o sea la unidad más sus
 * hijos DIRECTOS. Pero en el municipio los proyectos cuelgan de las
 * direcciones, que están a dos niveles de la secretaría
 * (Secretaría → Subsecretaría → Dirección). Con un solo nivel la lista de
 * proyectos quedaba vacía y todo lo que se filtraba después también.
 *
 * Medido sobre las 80 unidades, 4 daban mal, y son las peores posibles: el
 * asistente contestaba **0 proyectos** para Secretaría General (tiene 217), 0
 * para Gobierno (60) y 0 para Servicios Públicos (40) — las tres más grandes —,
 * y 29 en vez de 38 para la Subsecretaría de Cultura, que además es una de las
 * preguntas sugeridas del propio asistente.
 *
 * `unidades_descendientes` es recursiva, incluye la unidad propia y es la misma
 * que usan la RLS y `getScopeReporte`.
 */
async function idsDelArbol(
  sb: Awaited<ReturnType<typeof getSupabaseServer>>,
  unidadId: string
): Promise<string[]> {
  const { data } = await sb.rpc("unidades_descendientes", { p_unidad_id: unidadId });
  const ids = ((data ?? []) as { id: string }[]).map((u) => u.id);
  // Si la RPC fallara, al menos filtrar por la unidad propia en vez de por nada:
  // devolver [] dejaría un `.in()` vacío y la herramienta contestaría "no hay
  // nada" en lugar de fallar.
  return ids.length > 0 ? ids : [unidadId];
}

export async function buscarProyectos(params: {
  unidad_id?: string;
  texto?: string;
  solo_sin_seguimiento?: boolean;
}) {
  const supabase = await getSupabaseServer();
  const periodo = await getPeriodoActivoId();

  let query = supabase
    .from("proyecto")
    .select("id, codigo, nombre, estado, unidad_id, fecha_inicio, fecha_fin, unidad:unidad_organizacional(nombre_corto, nombre)")
    .eq("periodo_id", periodo)
    .is("deleted_at", null)
    .eq("estado", "activo")
    .order("orden");

  if (params.unidad_id) {
    // Include child units
    const ids = await idsDelArbol(supabase, params.unidad_id);
    query = query.in("unidad_id", ids);
  }

  const { data: proyectos } = await query;
  let results = (proyectos ?? []) as any[];

  if (params.texto) {
    // Sin distinguir mayúsculas, tildes ni puntuación (28.07)
    const t = normalizarBusqueda(params.texto);
    results = results.filter(
      (p) => coincideBusqueda(p.nombre, t) || coincideBusqueda(p.codigo, t)
    );
  }

  if (params.solo_sin_seguimiento) {
    // Filter to projects where all metas have no updates
    const ids = results.map((r) => r.id);
    const { data: metas } = await supabase
      .from("meta")
      .select("proyecto_id, ultima_actualizacion")
      .in("proyecto_id", ids)
      .is("deleted_at", null);

    const pyConSeg = new Set<string>();
    for (const m of metas ?? []) {
      if ((m as any).ultima_actualizacion) {
        pyConSeg.add(m.proyecto_id as string);
      }
    }
    results = results.filter((p) => !pyConSeg.has(p.id));
  }

  return results.slice(0, 20).map((p) => ({
    id: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    unidad: (p.unidad as any)?.nombre_corto ?? "—",
  }));
}

export async function obtenerDetalleProyecto(params: { proyecto_id: string }) {
  const supabase = await getSupabaseServer();
  const { data: py } = await supabase
    .from("proyecto")
    .select("*, unidad:unidad_organizacional(nombre_corto, nombre)")
    .eq("id", params.proyecto_id)
    .single();

  const { data: metas } = await supabase
    .from("meta")
    .select("id, codigo, nombre, tipo_medicion, unidad_medida, valor_linea_base, valor_meta, valor_actual, nivel_actual, estado_semaforo, ultima_actualizacion, fecha_limite")
    .eq("proyecto_id", params.proyecto_id)
    .is("deleted_at", null)
    .order("orden");

  const { data: hitos } = await supabase
    .from("hito")
    .select("id, nombre, fecha_esperada, completado, fecha_completado, obligatorio")
    .eq("proyecto_id", params.proyecto_id)
    .is("deleted_at", null)
    .order("orden");

  return {
    proyecto: py ? {
      codigo: (py as any).codigo,
      nombre: (py as any).nombre,
      objetivo: (py as any).objetivo,
      estado: (py as any).estado,
      unidad: ((py as any).unidad)?.nombre_corto,
      fecha_inicio: (py as any).fecha_inicio,
      fecha_fin: (py as any).fecha_fin,
    } : null,
    metas: (metas ?? []).map((m) => ({
      id: (m as any).id,
      nombre: (m as any).nombre,
      tipo: (m as any).tipo_medicion,
      valor_actual: (m as any).valor_actual,
      valor_meta: (m as any).valor_meta,
      unidad_medida: (m as any).unidad_medida,
      nivel_actual: (m as any).nivel_actual,
      semaforo: (m as any).estado_semaforo,
      ultima_actualizacion: (m as any).ultima_actualizacion,
      fecha_limite: (m as any).fecha_limite,
    })),
    hitos: (hitos ?? []).map((h) => ({
      nombre: (h as any).nombre,
      fecha_esperada: (h as any).fecha_esperada,
      completado: (h as any).completado,
      obligatorio: (h as any).obligatorio,
    })),
  };
}

export async function listarMetasPendientes(params: {
  unidad_id?: string;
  dias_sin_actualizar?: number;
}) {
  const supabase = await getSupabaseServer();
  const periodo = await getPeriodoActivoId();
  const dias = params.dias_sin_actualizar ?? 14;
  const corte = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  // Get projects for this unit
  let pyQuery = supabase
    .from("proyecto")
    .select("id, nombre, codigo, unidad_id")
    .eq("periodo_id", periodo)
    .eq("estado", "activo")
    .is("deleted_at", null);

  if (params.unidad_id) {
    const ids = await idsDelArbol(supabase, params.unidad_id);
    pyQuery = pyQuery.in("unidad_id", ids);
  }

  const { data: proyectos } = await pyQuery;
  const pyIds = (proyectos ?? []).map((p) => (p as any).id);
  if (pyIds.length === 0) return [];

  const { data: metas } = await supabase
    .from("meta")
    .select("id, nombre, tipo_medicion, valor_actual, valor_meta, unidad_medida, estado_semaforo, ultima_actualizacion, fecha_limite, proyecto_id")
    .in("proyecto_id", pyIds)
    .is("deleted_at", null);

  const pyMap = new Map((proyectos ?? []).map((p) => [(p as any).id, p]));

  const pendientes = (metas ?? [])
    .filter((m) => {
      const ua = (m as any).ultima_actualizacion;
      return !ua || ua < corte;
    })
    .map((m) => {
      const py = pyMap.get((m as any).proyecto_id) as any;
      return {
        meta_nombre: (m as any).nombre,
        proyecto_nombre: py?.nombre ?? "—",
        proyecto_codigo: py?.codigo ?? "—",
        tipo: (m as any).tipo_medicion,
        valor_actual: (m as any).valor_actual,
        valor_meta: (m as any).valor_meta,
        semaforo: (m as any).estado_semaforo,
        dias_sin_reporte: (m as any).ultima_actualizacion
          ? Math.floor((Date.now() - new Date((m as any).ultima_actualizacion!).getTime()) / 86400000)
          : null,
        sin_primer_reporte: !(m as any).ultima_actualizacion,
      };
    })
    .sort((a, b) => {
      if (a.sin_primer_reporte && !b.sin_primer_reporte) return -1;
      if (!a.sin_primer_reporte && b.sin_primer_reporte) return 1;
      return (b.dias_sin_reporte ?? 999) - (a.dias_sin_reporte ?? 999);
    });

  return pendientes.slice(0, 15);
}

export async function listarHitosProximos(params: {
  dias?: number;
  unidad_id?: string;
  incluir_vencidos?: boolean;
}) {
  const supabase = await getSupabaseServer();
  const periodo = await getPeriodoActivoId();
  const dias = params.dias ?? 30;
  const ahora = new Date();
  const limite = new Date(ahora.getTime() + dias * 86400000).toISOString().slice(0, 10);
  const hoyStr = ahora.toISOString().slice(0, 10);

  let pyQuery = supabase
    .from("proyecto")
    .select("id, nombre, codigo, unidad_id")
    .eq("periodo_id", periodo)
    .eq("estado", "activo")
    .is("deleted_at", null);

  if (params.unidad_id) {
    const ids = await idsDelArbol(supabase, params.unidad_id);
    pyQuery = pyQuery.in("unidad_id", ids);
  }

  const { data: proyectos } = await pyQuery;
  const pyIds = (proyectos ?? []).map((p) => (p as any).id);
  if (pyIds.length === 0) return { proximos: [], vencidos: [] };

  const { data: hitos } = await supabase
    .from("hito")
    .select("id, nombre, fecha_esperada, completado, obligatorio, proyecto_id")
    .in("proyecto_id", pyIds)
    .eq("completado", false)
    .is("deleted_at", null)
    .order("fecha_esperada");

  const pyMap = new Map((proyectos ?? []).map((p) => [(p as any).id, p]));

  const all = (hitos ?? []).map((h) => {
    const py = pyMap.get((h as any).proyecto_id) as any;
    return {
      nombre: (h as any).nombre,
      fecha: (h as any).fecha_esperada,
      obligatorio: (h as any).obligatorio,
      proyecto: py?.nombre ?? "—",
      proyecto_codigo: py?.codigo ?? "—",
    };
  });

  const vencidos = all.filter((h) => h.fecha && h.fecha < hoyStr);
  const proximos = all.filter((h) => h.fecha && h.fecha >= hoyStr && h.fecha <= limite);

  return {
    vencidos: params.incluir_vencidos ? vencidos.slice(0, 10) : [],
    proximos: proximos.slice(0, 10),
  };
}

export async function obtenerResumenArea(params: { unidad_id: string }) {
  const supabase = await getSupabaseServer();
  const periodo = await getPeriodoActivoId();

  const { data: unidad } = await supabase
    .from("unidad_organizacional")
    .select("nombre, nombre_corto, tipo, responsable_nombre")
    .eq("id", params.unidad_id)
    .single();

  // Para CONTAR, el árbol completo (ver `idsDelArbol`: con un solo nivel esta
  // herramienta contestaba 0 proyectos para las tres secretarías más grandes).
  const allIds = await idsDelArbol(supabase, params.unidad_id);

  // Para LISTAR las áreas que dependen de ella, los hijos directos, que es lo
  // que el campo `direcciones` quiere decir.
  const { data: hijos } = await supabase
    .from("unidad_organizacional")
    .select("id, nombre_corto")
    .eq("parent_id", params.unidad_id);

  const { data: proyectos } = await supabase
    .from("proyecto")
    .select("id")
    .eq("periodo_id", periodo)
    .in("unidad_id", allIds)
    .eq("estado", "activo")
    .is("deleted_at", null);

  const pyIds = (proyectos ?? []).map((p) => (p as any).id);

  const { data: metas } = await supabase
    .from("meta")
    .select("estado_semaforo, ultima_actualizacion")
    .in("proyecto_id", pyIds)
    .is("deleted_at", null);

  const { data: hitosData } = await supabase
    .from("hito")
    .select("completado")
    .in("proyecto_id", pyIds)
    .is("deleted_at", null);

  const semaforoCount = { verde: 0, amarillo: 0, rojo: 0, sin_datos: 0 };
  let sinPrimerReporte = 0;
  for (const m of metas ?? []) {
    const s = (m as any).estado_semaforo;
    if (s === "verde") semaforoCount.verde++;
    else if (s === "amarillo") semaforoCount.amarillo++;
    else if (s === "rojo") semaforoCount.rojo++;
    else semaforoCount.sin_datos++;
    if (!(m as any).ultima_actualizacion) sinPrimerReporte++;
  }

  return {
    area: (unidad as any)?.nombre_corto ?? (unidad as any)?.nombre ?? "—",
    responsable: (unidad as any)?.responsable_nombre,
    direcciones: (hijos ?? []).map((h) => (h as any).nombre_corto),
    total_proyectos: pyIds.length,
    total_metas: (metas ?? []).length,
    semaforo: semaforoCount,
    metas_sin_primer_reporte: sinPrimerReporte,
    total_hitos: (hitosData ?? []).length,
    hitos_completados: (hitosData ?? []).filter((h) => (h as any).completado).length,
  };
}

export async function listarUnidades() {
  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from("unidad_organizacional")
    .select("id, nombre, nombre_corto, tipo, nivel, responsable_nombre")
    .eq("activa", true)
    .order("nivel")
    .order("orden");

  return (data ?? []).map((u) => ({
    id: (u as any).id,
    nombre: (u as any).nombre_corto ?? (u as any).nombre,
    tipo: (u as any).tipo,
    nivel: (u as any).nivel,
  }));
}

// =============================================================
// Tools de ACCION (V1.1): propuestas de carga con confirmación
// =============================================================

export async function proponerCargaAvance(params: {
  meta_id: string;
  valor_numerico?: number;
  valor_cualitativo?: string;
  observacion?: string;
}) {
  // Obtener meta con su proyecto
  const { data: meta } = await supabase
    .from("meta")
    .select("id, nombre, tipo_medicion, valor_actual, valor_meta, unidad_medida, proyecto_id, proyecto:proyecto(id, nombre, codigo)")
    .eq("id", params.meta_id)
    .single();

  if (!meta) return { error: "Meta no encontrada" };

  const py = (meta as any).proyecto;

  // Insertar propuesta en estado pendiente
  const { data: propuesta, error } = await supabase
    .from("propuesta_carga")
    .insert({
      tipo: "avance",
      proyecto_id: py.id,
      meta_id: params.meta_id,
      valor_numerico: params.valor_numerico ?? null,
      valor_cualitativo: params.valor_cualitativo ?? null,
      observacion: params.observacion ?? null,
      texto_usuario: `Carga de avance: ${params.valor_numerico ?? params.valor_cualitativo ?? ""} en ${(meta as any).nombre}`,
      estado: "pendiente",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  return {
    propuesta_id: (propuesta as any).id,
    tipo: "avance",
    proyecto: py.nombre,
    proyecto_codigo: py.codigo,
    meta: (meta as any).nombre,
    tipo_medicion: (meta as any).tipo_medicion,
    valor_actual: (meta as any).valor_actual,
    valor_meta: (meta as any).valor_meta,
    unidad_medida: (meta as any).unidad_medida,
    valor_propuesto: params.valor_numerico ?? params.valor_cualitativo ?? null,
    observacion: params.observacion ?? null,
    mensaje: "Propuesta armada. Esperando confirmación del usuario.",
  };
}

export async function confirmarCargaAvance(params: { propuesta_id: string }) {
  // Obtener propuesta pendiente
  const { data: prop } = await supabase
    .from("propuesta_carga")
    .select("*")
    .eq("id", params.propuesta_id)
    .eq("estado", "pendiente")
    .single();

  if (!prop) return { error: "Propuesta no encontrada o ya procesada" };

  const p = prop as any;

  // Obtener meta para saber tipo_medicion
  const { data: meta } = await supabase
    .from("meta")
    .select("tipo_medicion")
    .eq("id", p.meta_id)
    .single();

  if (!meta) return { error: "Meta no encontrada" };

  // Importar y ejecutar la server action existente
  // Como estamos en server-side, usamos supabase directamente replicando la lógica de cargarAvance
  const tipo = (meta as any).tipo_medicion as string;
  const ahora = new Date().toISOString();

  // 1. Insertar avance
  const { data: avance, error: avErr } = await supabase
    .from("avance")
    .insert({
      proyecto_id: p.proyecto_id,
      meta_id: p.meta_id,
      fuente: "chatbot",
      valor_numerico: p.valor_numerico,
      valor_cualitativo: p.valor_cualitativo,
      observacion: p.observacion,
      payload_original: { propuesta_id: p.id },
    })
    .select("id")
    .single();

  if (avErr) return { error: avErr.message };

  // 2. Actualizar meta materializada
  if (tipo === "cuantitativo" && p.valor_numerico != null) {
    const { data: metaFull } = await supabase
      .from("meta")
      .select("valor_meta, valor_linea_base, metadata")
      .eq("id", p.meta_id)
      .single();

    let estado_semaforo = "sin_datos";
    if (metaFull && (metaFull as any).valor_meta != null) {
      const base = ((metaFull as any).valor_linea_base as number) ?? 0;
      const objetivo = (metaFull as any).valor_meta as number;
      const invertida = ((metaFull as any).metadata as Record<string, unknown>)?.invertida === true;
      let pct: number;
      if (invertida) {
        pct = objetivo !== base ? ((base - p.valor_numerico) / (base - objetivo)) * 100 : 0;
      } else {
        pct = objetivo !== base ? ((p.valor_numerico - base) / (objetivo - base)) * 100 : 0;
      }
      pct = Math.max(0, Math.min(100, pct));
      estado_semaforo = pct >= 80 ? "verde" : pct >= 50 ? "amarillo" : "rojo";
    }

    await supabase
      .from("meta")
      .update({ valor_actual: p.valor_numerico, estado_semaforo, ultima_actualizacion: ahora })
      .eq("id", p.meta_id);
  }

  if (tipo === "cualitativo" && p.valor_cualitativo) {
    const { data: metaFull } = await supabase
      .from("meta")
      .select("escala_cualitativa")
      .eq("id", p.meta_id)
      .single();

    let estado_semaforo = "sin_datos";
    if (metaFull?.escala_cualitativa) {
      const escala = (metaFull as any).escala_cualitativa as { niveles: { clave: string; valor_numerico: number }[] };
      const nivel = escala.niveles.find((n) => n.clave === p.valor_cualitativo);
      if (nivel) {
        const pct = nivel.valor_numerico;
        estado_semaforo = pct >= 80 ? "verde" : pct >= 50 ? "amarillo" : pct > 0 ? "rojo" : "sin_datos";
      }
    }

    await supabase
      .from("meta")
      .update({ nivel_actual: p.valor_cualitativo, estado_semaforo, ultima_actualizacion: ahora })
      .eq("id", p.meta_id);
  }

  if (tipo === "hito_unico") {
    await supabase
      .from("meta")
      .update({ valor_actual: 1, estado_semaforo: "verde", ultima_actualizacion: ahora })
      .eq("id", p.meta_id);
  }

  // 3. Actualizar propuesta como confirmada
  await supabase
    .from("propuesta_carga")
    .update({
      estado: "confirmada",
      avance_generado_id: (avance as any).id,
      confirmada_at: ahora,
    })
    .eq("id", p.id);

  return {
    success: true,
    avance_id: (avance as any).id,
    mensaje: "Avance cargado correctamente.",
  };
}

export async function proponerCompletarHito(params: {
  hito_id: string;
  observacion?: string;
}) {
  const { data: hito } = await supabase
    .from("hito")
    .select("id, nombre, fecha_esperada, completado, obligatorio, proyecto_id, proyecto:proyecto(id, nombre, codigo)")
    .eq("id", params.hito_id)
    .single();

  if (!hito) return { error: "Hito no encontrado" };
  if ((hito as any).completado) return { error: "Este hito ya está marcado como completado" };

  const py = (hito as any).proyecto;

  const { data: propuesta, error } = await supabase
    .from("propuesta_carga")
    .insert({
      tipo: "hito",
      proyecto_id: py.id,
      hito_id: params.hito_id,
      observacion: params.observacion ?? null,
      texto_usuario: `Completar hito: ${(hito as any).nombre}`,
      estado: "pendiente",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  return {
    propuesta_id: (propuesta as any).id,
    tipo: "hito",
    proyecto: py.nombre,
    proyecto_codigo: py.codigo,
    hito: (hito as any).nombre,
    fecha_esperada: (hito as any).fecha_esperada,
    obligatorio: (hito as any).obligatorio,
    observacion: params.observacion ?? null,
    mensaje: "Propuesta armada. Esperando confirmación del usuario.",
  };
}

export async function confirmarCompletarHito(params: { propuesta_id: string }) {
  const { data: prop } = await supabase
    .from("propuesta_carga")
    .select("*")
    .eq("id", params.propuesta_id)
    .eq("estado", "pendiente")
    .single();

  if (!prop) return { error: "Propuesta no encontrada o ya procesada" };

  const p = prop as any;
  const hoy = new Date().toISOString().slice(0, 10);
  const ahora = new Date().toISOString();

  // 1. Insertar avance
  const { data: avance, error: avErr } = await supabase
    .from("avance")
    .insert({
      proyecto_id: p.proyecto_id,
      hito_id: p.hito_id,
      fuente: "chatbot",
      observacion: p.observacion,
      payload_original: { propuesta_id: p.id },
    })
    .select("id")
    .single();

  if (avErr) return { error: avErr.message };

  // 2. Marcar hito como completado
  await supabase
    .from("hito")
    .update({ completado: true, fecha_completado: hoy })
    .eq("id", p.hito_id);

  // 3. Actualizar propuesta
  await supabase
    .from("propuesta_carga")
    .update({
      estado: "confirmada",
      avance_generado_id: (avance as any).id,
      confirmada_at: ahora,
    })
    .eq("id", p.id);

  return {
    success: true,
    avance_id: (avance as any).id,
    mensaje: "Hito marcado como completado.",
  };
}

export async function cancelarPropuesta(params: { propuesta_id: string }) {
  const { error } = await supabase
    .from("propuesta_carga")
    .update({ estado: "cancelada" })
    .eq("id", params.propuesta_id)
    .eq("estado", "pendiente");

  if (error) return { error: error.message };
  return { success: true, mensaje: "Propuesta cancelada." };
}

// Helper
async function getPeriodoActivoId(): Promise<string> {
  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from("periodo")
    .select("id")
    .eq("activo", true)
    .single();
  return (data as any).id;
}

// =============================================================
// Tools NUEVAS: Indicadores
// =============================================================

export async function obtenerIndicadoresDeMeta(params: { meta_id: string }) {
  const supabase = await getSupabaseServer();
  const { data: meta } = await supabase
    .from("meta")
    .select("id, nombre")
    .eq("id", params.meta_id)
    .single();
  if (!meta) return { error: "Meta no encontrada" };

  const { data: indicadores } = await supabase
    .from("indicador")
    .select("id, codigo, nombre, valor_actual, valor_objetivo, unidad_medida, estado_semaforo, ultima_actualizacion")
    .eq("meta_id", params.meta_id)
    .is("deleted_at", null)
    .order("orden")
    .limit(50);

  return {
    meta: (meta as any).nombre,
    indicadores: (indicadores ?? []).map((i: any) => ({
      id: i.id,
      codigo: i.codigo,
      nombre: i.nombre,
      valor_actual: i.valor_actual,
      valor_objetivo: i.valor_objetivo,
      unidad_medida: i.unidad_medida,
      semaforo: i.estado_semaforo,
      ultima_actualizacion: i.ultima_actualizacion,
    })),
  };
}

/**
 * Carga el valor de un indicador desde el chat (24.08).
 *
 * No reimplementa la carga: delega en el Server Action `actualizarIndicador`
 * de lib/actions.ts, el mismo que usa el formulario de la pantalla. Así hay un
 * solo camino de escritura, con una sola forma de calcular el semáforo, una
 * sola normalización texto→número, el historial de carga y la propagación a la
 * meta. Antes esta tool tenía su propia copia de la fórmula, escribía con el
 * cliente anónimo sin sesión (RLS la dejaba en cero filas y Supabase no
 * devuelve error, así que informaba éxito sin haber guardado) y no dejaba
 * rastro en indicador_historial.
 *
 * El permiso lo sigue resolviendo RLS con la sesión real del usuario: acá no
 * hay ningún chequeo de rol propio que pueda quedar desalineado con la base.
 */
export async function actualizarIndicador(params: {
  indicador_id: string;
  valor_actual?: number;
  valor_actual_texto?: string;
  estado_semaforo?: "verde" | "amarillo" | "rojo";
  observacion?: string;
}) {
  const tieneNumero = params.valor_actual != null;
  const tieneTexto =
    params.valor_actual_texto != null && params.valor_actual_texto.trim() !== "";
  if (!tieneNumero && !tieneTexto) {
    return { error: "Falta el valor a cargar: pasá valor_actual o valor_actual_texto." };
  }
  if (tieneNumero && tieneTexto) {
    return { error: "Pasá solo uno de los dos: valor_actual (número) o valor_actual_texto." };
  }
  // Un valor numérico se mide contra el objetivo, así que el semáforo se
  // calcula solo. Uno cualitativo ("Realizado", "Sí") no se puede medir, así
  // que el estado lo tiene que elegir la persona: es exactamente lo que pide el
  // formulario de la pantalla, y acá no se adivina.
  if (tieneTexto && !params.estado_semaforo) {
    return {
      error:
        "Para un valor cualitativo hace falta el estado. Preguntale al usuario si el indicador queda como Finalizado (verde), En ejecución (amarillo) o No iniciado (rojo), y volvé a invocar con estado_semaforo.",
    };
  }

  const supabase = await getSupabaseServer();

  // Se lee con la sesión del usuario a propósito: si el indicador está fuera de
  // su ámbito, RLS no lo devuelve y no hay nada que cargar. Es también de dónde
  // sale el "antes" para poder informar el cambio.
  const { data: antes } = await supabase
    .from("indicador")
    .select(
      "id, nombre, unidad_medida, valor_actual, valor_actual_texto, valor_objetivo, valor_objetivo_texto, estado_semaforo, meta_id"
    )
    .eq("id", params.indicador_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!antes) {
    return { error: "No encontré ese indicador, o está fuera de tu ámbito de visibilidad." };
  }

  const r = await actualizarIndicadorAction({
    indicador_id: params.indicador_id,
    // Se manda el par completo para que el valor quede sin ambigüedad: si se
    // carga un número se limpia el texto viejo y al revés, igual que hace el
    // formulario de la pantalla.
    valor_actual: tieneNumero ? params.valor_actual! : null,
    valor_actual_texto: tieneTexto ? params.valor_actual_texto!.trim() : null,
    // Solo pesa en el caso cualitativo. Con un número va sin override para que
    // el estado salga de medir el valor contra el objetivo.
    estado_semaforo_override: tieneTexto ? params.estado_semaforo! : undefined,
    observacion: params.observacion ?? undefined,
  });

  if (!r.success) return { error: r.error ?? "No se pudo guardar el indicador." };

  // Se relee para informar lo que quedó guardado de verdad, no lo que se pidió
  // guardar: el Server Action puede haber convertido un texto numérico a número
  // y el semáforo lo recalcula la base.
  const { data: despues } = await supabase
    .from("indicador")
    .select(
      "valor_actual, valor_actual_texto, valor_objetivo, valor_objetivo_texto, unidad_medida, estado_semaforo, ultima_actualizacion"
    )
    .eq("id", params.indicador_id)
    .maybeSingle();

  const valorLegible = (v: { valor_actual: unknown; valor_actual_texto: unknown } | null) =>
    v == null ? null : (v.valor_actual ?? v.valor_actual_texto ?? null);

  return {
    success: true,
    indicador: (antes as any).nombre,
    unidad_medida: (despues as any)?.unidad_medida ?? (antes as any).unidad_medida,
    valor_anterior: valorLegible(antes as any),
    valor_cargado: valorLegible(despues as any),
    valor_objetivo: (despues as any)?.valor_objetivo ?? (antes as any).valor_objetivo,
    semaforo_anterior: (antes as any).estado_semaforo,
    semaforo: (despues as any)?.estado_semaforo ?? null,
    mensaje:
      "Indicador actualizado. Quedó registrado en el Historial de Carga con tu nombre y la fecha.",
  };
}

// =============================================================
// Tools NUEVAS: Validación de avances
// =============================================================

export async function listarAvancesPendientesValidacion(params: {
  unidad_id?: string;
}) {
  const supabase = await getSupabaseServer();
  let pyQuery = supabase
    .from("proyecto")
    .select("id, nombre, codigo, unidad_id")
    .is("deleted_at", null);

  if (params.unidad_id) {
    const ids = await idsDelArbol(supabase, params.unidad_id);
    pyQuery = pyQuery.in("unidad_id", ids);
  }

  const { data: proyectos } = await pyQuery;
  const pyIds = (proyectos ?? []).map((p) => (p as any).id);
  if (pyIds.length === 0) return [];
  const pyMap = new Map((proyectos ?? []).map((p) => [(p as any).id, p]));

  const { data: avances } = await supabase
    .from("avance")
    .select("id, fecha_reporte, valor_numerico, valor_cualitativo, observacion, proyecto_id, meta:meta(id, nombre)")
    .eq("estado_validacion", "pendiente")
    .in("proyecto_id", pyIds)
    .order("fecha_reporte", { ascending: false })
    .limit(20);

  return (avances ?? []).map((a: any) => {
    const py = pyMap.get(a.proyecto_id) as any;
    return {
      avance_id: a.id,
      fecha: a.fecha_reporte,
      proyecto: py?.nombre,
      proyecto_codigo: py?.codigo,
      meta: a.meta?.nombre ?? null,
      valor: a.valor_numerico ?? a.valor_cualitativo ?? null,
      observacion: a.observacion,
    };
  });
}

export async function validarAvanceChat(params: { avance_id: string }) {
  const { error } = await supabase
    .from("avance")
    .update({
      estado_validacion: "validado",
      validado_at: new Date().toISOString(),
      observacion_validacion: null,
    })
    .eq("id", params.avance_id);
  if (error) return { error: error.message };
  return { success: true, mensaje: "Avance validado." };
}

export async function observarAvanceChat(params: {
  avance_id: string;
  motivo: string;
}) {
  if (!params.motivo?.trim()) return { error: "El motivo es obligatorio" };
  const { error } = await supabase
    .from("avance")
    .update({
      estado_validacion: "observado",
      validado_at: new Date().toISOString(),
      observacion_validacion: params.motivo.trim(),
    })
    .eq("id", params.avance_id);
  if (error) return { error: error.message };
  return { success: true, mensaje: "Avance devuelto con observación." };
}

// =============================================================
// Tools NUEVAS: Agenda semanal
// =============================================================

function lunesDeSemana(fecha: Date = new Date()): string {
  const d = new Date(fecha);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export async function obtenerAgendaSemana(params: {
  unidad_id: string;
  fecha_lunes?: string;
}) {
  const supabase = await getSupabaseServer();
  const fechaLunes = params.fecha_lunes ?? lunesDeSemana();

  const { data: sem } = await supabase
    .from("agenda_semana")
    .select("id, formato_libre, actividades:agenda_actividad(id, dia_semana, orden, es_feriado, actividad, lugar, horario)")
    .eq("unidad_id", params.unidad_id)
    .eq("fecha_lunes", fechaLunes)
    .maybeSingle();

  if (!sem) return { mensaje: "Sin agenda cargada para esa semana", fecha_lunes: fechaLunes };

  return {
    fecha_lunes: fechaLunes,
    formato_libre: (sem as any).formato_libre,
    actividades: ((sem as any).actividades ?? []).map((a: any) => ({
      dia_semana: a.dia_semana,
      actividad: a.actividad,
      lugar: a.lugar,
      horario: a.horario,
      es_feriado: a.es_feriado,
    })),
  };
}

export async function proponerActividadAgenda(params: {
  unidad_id: string;
  dia_semana: number; // 1=Lunes ... 7=Domingo
  actividad: string;
  lugar?: string;
  horario?: string;
  fecha_lunes?: string;
}) {
  const fechaLunes = params.fecha_lunes ?? lunesDeSemana();
  const { data: propuesta, error } = await supabase
    .from("propuesta_carga")
    .insert({
      tipo: "agenda_actividad",
      observacion: `Día ${params.dia_semana} | ${params.actividad}${params.lugar ? ` | ${params.lugar}` : ""}${params.horario ? ` | ${params.horario}` : ""}`,
      texto_usuario: `Agregar a la agenda: ${params.actividad}`,
      estado: "pendiente",
      payload_original: {
        unidad_id: params.unidad_id,
        dia_semana: params.dia_semana,
        actividad: params.actividad,
        lugar: params.lugar ?? null,
        horario: params.horario ?? null,
        fecha_lunes: fechaLunes,
      },
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  return {
    propuesta_id: (propuesta as any).id,
    tipo: "agenda_actividad",
    dia_semana: params.dia_semana,
    actividad: params.actividad,
    lugar: params.lugar,
    horario: params.horario,
    fecha_lunes: fechaLunes,
    mensaje: "Propuesta de agenda armada. Esperando confirmación del usuario.",
  };
}

export async function confirmarActividadAgenda(params: { propuesta_id: string }) {
  const { data: prop } = await supabase
    .from("propuesta_carga")
    .select("*")
    .eq("id", params.propuesta_id)
    .eq("estado", "pendiente")
    .single();
  if (!prop) return { error: "Propuesta no encontrada o ya procesada" };

  const payload = (prop as any).payload_original as {
    unidad_id: string;
    dia_semana: number;
    actividad: string;
    lugar: string | null;
    horario: string | null;
    fecha_lunes: string;
  };

  // Upsert agenda_semana
  const { data: sem, error: semErr } = await supabase
    .from("agenda_semana")
    .upsert(
      { unidad_id: payload.unidad_id, fecha_lunes: payload.fecha_lunes },
      { onConflict: "unidad_id,fecha_lunes" }
    )
    .select("id")
    .single();
  if (semErr || !sem) return { error: semErr?.message ?? "No se pudo crear semana" };

  // Insertar actividad
  const { error: actErr } = await supabase.from("agenda_actividad").insert({
    agenda_semana_id: (sem as any).id,
    dia_semana: payload.dia_semana,
    orden: 99,
    es_feriado: false,
    actividad: payload.actividad,
    lugar: payload.lugar,
    horario: payload.horario,
  });
  if (actErr) return { error: actErr.message };

  await supabase
    .from("propuesta_carga")
    .update({ estado: "confirmada", confirmada_at: new Date().toISOString() })
    .eq("id", (prop as any).id);

  return { success: true, mensaje: "Actividad agregada a la agenda." };
}
