/**
 * Foto del corte trimestral (etapa 1 del reporte trimestral).
 *
 * Guarda, una vez por corte, cómo estaba cada proyecto del POA: su estado, su
 * avance y la posición que tenía en la estructura ese día. Sin esto no se puede
 * emitir un reporte "del tercer trimestre" después del trimestre: el historial
 * de carga arranca el 31.07.2026 y cubre 229 de 1896 indicadores, así que sirve
 * para ver la evolución de un indicador puntual pero no para reconstruir el
 * estado del municipio a una fecha.
 *
 * DOS DECISIONES QUE IMPORTAN:
 *
 * 1. Lee con el cliente admin, no con el de sesión. La foto es municipal: si se
 *    tomara con la RLS del que la dispara, un director tomaría una foto de su
 *    dirección y el reporte del municipio saldría incompleto sin avisar.
 *
 * 2. Calca la cascada del Panel Ejecutivo exactamente, incluidos sus defectos.
 *    En particular NO trae `fecha_inicio` / `fecha_fin` del indicador, igual que
 *    `getIndicadoresAvance`, así que la regla de plazo a nivel indicador queda
 *    inerte. Está mal, y está documentado en PLAN_RECTOR.md §7.2 como cambio
 *    aparte. Pero si la foto lo corrigiera por su cuenta, el reporte diría un
 *    número distinto al que el secretario ve en su panel, y esa discusión se
 *    gana o se pierde en la primera reunión. Cuando se arregle, se arregla en
 *    los dos lados a la vez.
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  calcularPorcentajeMeta,
  avanceMetaEnPlazo,
  avanceAgregado,
  estadoDeAvance,
} from "@/lib/utils";
import type { EstadoSemaforo } from "@/types/database";

const TAMANO_PAGINA = 1000;

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Trae todas las filas paginando. PostgREST corta en 1000 y hay 1404
 * indicadores bajo proyectos activos (1896 en total), así que sin esto la foto
 * saldría recortada y nadie se daría cuenta.
 */
async function traerTodo<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: any; count: number | null }>
): Promise<T[]> {
  const primera = await pagina(0, TAMANO_PAGINA - 1);
  if (primera.error) throw primera.error;
  const filas = (primera.data ?? []) as T[];
  const total = primera.count ?? filas.length;
  if (filas.length >= total) return filas;

  for (let desde = filas.length; desde < total; desde += TAMANO_PAGINA) {
    const r = await pagina(desde, desde + TAMANO_PAGINA - 1);
    if (r.error) throw r.error;
    filas.push(...((r.data ?? []) as T[]));
  }
  return filas;
}

export interface ResultadoCorte {
  corte_id: string;
  anio: number;
  trimestre: number;
  fecha_corte: string;
  reemplazo: boolean;
  proyectos: number;
  finalizados: number;
  en_ejecucion: number;
  no_iniciados: number;
  sin_datos: number;
  pct_promedio: number | null;
}

/** Trimestre (1-4) al que pertenece una fecha ISO. */
export function trimestreDe(fechaIso: string): number {
  const mes = Number(fechaIso.slice(5, 7));
  return Math.floor((mes - 1) / 3) + 1;
}

/** Último día del trimestre que contiene a esa fecha, en ISO. */
export function finDeTrimestre(fechaIso: string): string {
  const anio = Number(fechaIso.slice(0, 4));
  const t = trimestreDe(fechaIso);
  const ultimoMes = t * 3;
  // Día 0 del mes siguiente = último día de `ultimoMes`.
  const d = new Date(Date.UTC(anio, ultimoMes, 0));
  return d.toISOString().slice(0, 10);
}

/**
 * Toma la foto y la guarda.
 *
 * @param fechaCorte  Día al que corresponde la foto (ISO). Por defecto, hoy.
 * @param origen      'automatico' para el proceso programado, 'manual' si la
 *                    dispara una persona.
 * @param quien       Quién la tomó, cuando es manual.
 *
 * Idempotente por fecha: volver a tomarla el mismo día reemplaza la de ese día.
 * Tomarla otro día crea una nueva y NO pisa la anterior, porque el reporte se
 * emite y se firma y un informe ya entregado no puede dejar de coincidir con el
 * sistema.
 */
export async function tomarCorteTrimestral(opciones?: {
  fechaCorte?: string;
  origen?: "automatico" | "manual";
  quien?: { user_id: string; email: string | null };
}): Promise<ResultadoCorte> {
  const fechaCorte = opciones?.fechaCorte ?? new Date().toISOString().slice(0, 10);
  const origen = opciones?.origen ?? "manual";
  const anio = Number(fechaCorte.slice(0, 4));
  const trimestre = trimestreDe(fechaCorte);

  const sb = getSupabaseAdmin();
  const foto = await calcularFotoCorte(fechaCorte);
  return guardarFotoCorte(sb, foto, { fechaCorte, anio, trimestre, origen, quien: opciones?.quien });
}

export interface FotoCorte {
  periodoId: string;
  periodoNombre: string | null;
  /** Una fila por proyecto, lista para insertar (sin corte_id). */
  filas: any[];
  totales: { verde: number; amarillo: number; rojo: number; sin_datos: number };
  pctPromedio: number | null;
}

/**
 * Calcula la foto SIN escribir nada.
 *
 * Va separado de la escritura a propósito: así el cálculo se puede verificar
 * contra la base de producción en seco, que es donde puede esconderse un error
 * caro (un proyecto que no resuelve su secretaría, la cascada dando distinto
 * que el panel, el paginado recortando filas). Escribir 441 filas para
 * descubrir que la columna de secretaría vino en blanco es un mal orden.
 */
export async function calcularFotoCorte(
  fechaCorteEntrada?: string
): Promise<FotoCorte> {
  const sb = getSupabaseAdmin();
  const fechaCorte = fechaCorteEntrada ?? new Date().toISOString().slice(0, 10);

  // ---- Período activo ----
  const { data: periodo, error: ePeriodo } = await sb
    .from("periodo")
    .select("id, nombre")
    .eq("activo", true)
    .single();
  if (ePeriodo || !periodo) throw ePeriodo ?? new Error("No hay período activo");
  const periodoId = (periodo as { id: string }).id;

  // ---- Datos, todos con el cliente admin y paginados ----
  const [unidades, proyectos, metas, indicadores] = await Promise.all([
    traerTodo<any>((d, h) =>
      sb.from("unidad_organizacional")
        .select("id, parent_id, nombre, nombre_corto, nivel", { count: "exact" })
        .range(d, h) as any
    ),
    traerTodo<any>((d, h) =>
      sb.from("proyecto")
        .select("id, codigo, nombre, unidad_id", { count: "exact" })
        .eq("periodo_id", periodoId)
        .eq("estado", "activo")
        .is("deleted_at", null)
        .order("id")
        .range(d, h) as any
    ),
    traerTodo<any>((d, h) =>
      sb.from("meta")
        .select(
          "id, proyecto_id, tipo_medicion, valor_actual, valor_meta, valor_linea_base, nivel_actual, escala_cualitativa, fecha_inicio, fecha_limite",
          { count: "exact" }
        )
        .is("deleted_at", null)
        .order("id")
        .range(d, h) as any
    ),
    // Mismas columnas que getIndicadoresAvance: sin fecha_inicio/fecha_fin a
    // propósito, para que el número coincida con el del panel. Ver la nota de
    // arriba.
    traerTodo<any>((d, h) =>
      sb.from("indicador")
        .select(
          "id, meta_id, valor_actual, valor_objetivo, valor_actual_texto, estado_semaforo, metadata",
          { count: "exact" }
        )
        .is("deleted_at", null)
        .order("id")
        .range(d, h) as any
    ),
  ]);

  // ---- Índices ----
  const unidadPorId = new Map<string, any>(unidades.map((u) => [u.id, u]));
  const proyectoIds = new Set<string>(proyectos.map((p) => p.id));

  const metasPorProyecto = new Map<string, any[]>();
  for (const m of metas) {
    if (!proyectoIds.has(m.proyecto_id)) continue; // metas de proyectos fuera del universo
    if (!metasPorProyecto.has(m.proyecto_id)) metasPorProyecto.set(m.proyecto_id, []);
    metasPorProyecto.get(m.proyecto_id)!.push(m);
  }
  const metaIdsVivas = new Set<string>(
    [...metasPorProyecto.values()].flat().map((m) => m.id)
  );

  const indPorMeta = new Map<string, any[]>();
  for (const i of indicadores) {
    if (!i.meta_id || !metaIdsVivas.has(i.meta_id)) continue;
    if (!indPorMeta.has(i.meta_id)) indPorMeta.set(i.meta_id, []);
    indPorMeta.get(i.meta_id)!.push(i);
  }

  /** Sube por parent_id hasta encontrar la secretaría (nivel 0) y la subsecretaría (nivel 1). */
  function ubicar(unidadId: string) {
    const propia = unidadPorId.get(unidadId);
    if (!propia) {
      return { secretaria: null, subsecretaria: null, esPropioDeSecretaria: false, propia: null };
    }
    if (propia.nivel === 0) {
      // El proyecto está cargado en la secretaría misma: es la "fila de
      // proyectos propios" que pidió Planificación.
      return { secretaria: propia, subsecretaria: null, esPropioDeSecretaria: true, propia };
    }
    let secretaria: any = null;
    let subsecretaria: any = null;
    let cur: any = propia;
    const vistos = new Set<string>([propia.id]);
    while (cur) {
      if (cur.nivel === 1) subsecretaria = cur;
      if (cur.nivel === 0) { secretaria = cur; break; }
      if (!cur.parent_id || vistos.has(cur.parent_id)) break;
      vistos.add(cur.parent_id);
      cur = unidadPorId.get(cur.parent_id) ?? null;
    }
    return { secretaria, subsecretaria, esPropioDeSecretaria: false, propia };
  }

  // ---- La cascada, igual que /avance-direcciones y el panel ----
  const filas: any[] = [];
  const totales = { verde: 0, amarillo: 0, rojo: 0, sin_datos: 0 };
  const pctsMunicipio: (number | null)[] = [];

  for (const py of proyectos) {
    const metasPy = metasPorProyecto.get(py.id) ?? [];
    let metasConDatos = 0;
    let indTotal = 0;
    let indConDatos = 0;

    const pctsMetas = metasPy.map((m) => {
      const inds = indPorMeta.get(m.id) ?? [];
      indTotal += inds.length;
      const av = avanceMetaEnPlazo(
        inds,
        calcularPorcentajeMeta(m),
        { fecha_inicio: m.fecha_inicio, fecha_limite: m.fecha_limite },
        fechaCorte
      );
      // conDatos de avanceAgregado ya cuenta los indicadores con dato.
      if (inds.length > 0) indConDatos += av.conDatos;
      if (av.pct != null) metasConDatos++;
      return av.pct;
    });

    const agg = avanceAgregado(pctsMetas);
    const estado = estadoDeAvance(agg.pct) as EstadoSemaforo;
    totales[estado as keyof typeof totales]++;
    pctsMunicipio.push(agg.pct);

    const pos = ubicar(py.unidad_id);
    filas.push({
      proyecto_id: py.id,
      proyecto_codigo: py.codigo,
      proyecto_nombre: py.nombre,
      unidad_id: py.unidad_id,
      unidad_nombre: pos.propia?.nombre_corto ?? pos.propia?.nombre ?? "(unidad desconocida)",
      unidad_nivel: pos.propia?.nivel ?? 99,
      secretaria_id: pos.secretaria?.id ?? null,
      secretaria_nombre: pos.secretaria?.nombre_corto ?? pos.secretaria?.nombre ?? null,
      subsecretaria_id: pos.subsecretaria?.id ?? null,
      subsecretaria_nombre: pos.subsecretaria?.nombre_corto ?? pos.subsecretaria?.nombre ?? null,
      es_propio_de_secretaria: pos.esPropioDeSecretaria,
      estado,
      pct: agg.pct,
      metas: metasPy.length,
      metas_con_datos: metasConDatos,
      indicadores: indTotal,
      indicadores_con_datos: indConDatos,
    });
  }

  const pctPromedio = avanceAgregado(pctsMunicipio).pct;

  return {
    periodoId,
    periodoNombre: (periodo as any).nombre ?? null,
    filas,
    totales,
    pctPromedio,
  };
}

/**
 * Guarda una foto ya calculada. Reemplaza la de esa misma fecha si existe.
 */
async function guardarFotoCorte(
  sb: ReturnType<typeof getSupabaseAdmin>,
  foto: FotoCorte,
  ctx: {
    fechaCorte: string;
    anio: number;
    trimestre: number;
    origen: "automatico" | "manual";
    quien?: { user_id: string; email: string | null };
  }
): Promise<ResultadoCorte> {
  const { fechaCorte, anio, trimestre, origen, quien } = ctx;
  const { periodoId, filas, totales, pctPromedio } = foto;

  const { data: previo } = await sb
    .from("corte_trimestral")
    .select("id")
    .eq("periodo_id", periodoId)
    .eq("anio", anio)
    .eq("trimestre", trimestre)
    .eq("fecha_corte", fechaCorte)
    .maybeSingle();

  const reemplazo = !!previo;
  if (previo) {
    // El detalle se va por CASCADE.
    const { error } = await sb.from("corte_trimestral").delete().eq("id", (previo as any).id);
    if (error) throw error;
  }

  const { data: corte, error: eCorte } = await sb
    .from("corte_trimestral")
    .insert({
      periodo_id: periodoId,
      anio,
      trimestre,
      fecha_corte: fechaCorte,
      origen,
      tomado_por: quien?.user_id ?? null,
      tomado_por_email: quien?.email ?? null,
      proyectos: filas.length,
      finalizados: totales.verde,
      en_ejecucion: totales.amarillo,
      no_iniciados: totales.rojo,
      sin_datos: totales.sin_datos,
      pct_promedio: pctPromedio,
      metadata: {
        periodo: foto.periodoNombre,
        // Queda anotado con qué se tomó, para poder explicar diferencias entre
        // dos fotos si algún día el cálculo cambia.
        cascada: "avanceMetaEnPlazo -> avanceAgregado -> estadoDeAvance",
        plazo_indicador_activo: false,
        reemplazo,
      },
    })
    .select("id")
    .single();
  if (eCorte || !corte) throw eCorte ?? new Error("No se pudo crear el corte");
  const corteId = (corte as { id: string }).id;

  // Inserta el detalle por lotes: 441 filas de una sola vez es un payload
  // grande y PostgREST se pone quisquilloso.
  const LOTE = 200;
  for (let i = 0; i < filas.length; i += LOTE) {
    const { error } = await sb
      .from("corte_trimestral_proyecto")
      .insert(filas.slice(i, i + LOTE).map((f) => ({ ...f, corte_id: corteId })));
    if (error) {
      // Si el detalle falla, la cabecera sin detalle es peor que nada: se borra.
      await sb.from("corte_trimestral").delete().eq("id", corteId);
      throw error;
    }
  }

  return {
    corte_id: corteId,
    anio,
    trimestre,
    fecha_corte: fechaCorte,
    reemplazo,
    proyectos: filas.length,
    finalizados: totales.verde,
    en_ejecucion: totales.amarillo,
    no_iniciados: totales.rojo,
    sin_datos: totales.sin_datos,
    pct_promedio: pctPromedio,
  };
}

/** Cortes ya tomados, el más reciente primero. */
export async function listarCortes(limite = 20) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("corte_trimestral")
    .select(
      "id, anio, trimestre, fecha_corte, origen, tomado_at, tomado_por_email, proyectos, finalizados, en_ejecucion, no_iniciados, sin_datos, pct_promedio"
    )
    .order("fecha_corte", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data ?? [];
}
