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
  hoyLocal,
  calcularPorcentajeMeta,
  avanceMetaEnPlazo,
  avanceAgregado,
  estadoDeAvance,
} from "@/lib/utils";
import type { EstadoSemaforo } from "@/types/database";

const TAMANO_PAGINA = 1000;

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * true si el error es "esa columna no existe".
 *
 * Pasa cuando el código ya está desplegado y la migración todavía no se aplicó:
 * el código sale solo por Vercel y las migraciones las aplica una persona. En
 * vez de tirar un error de PostgREST en inglés sobre el schema cache, se
 * degrada donde se puede.
 *
 * 42703 es `undefined_column` de Postgres; PGRST204 es lo que devuelve
 * PostgREST cuando la columna no está en su cache.
 */
function esColumnaInexistente(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  if (!err) return false;
  return (
    err.code === "42703" ||
    err.code === "PGRST204" ||
    /column .* does not exist|could not find the '.*' column/i.test(err.message ?? "")
  );
}

const FALTA_046 =
  "Falta aplicar la migración 046_corte_direccion.sql: la tabla del corte no " +
  "tiene todavía las columnas que el código escribe.";

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
 * El último cierre de trimestre que YA pasó (o hoy, si hoy es el cierre).
 *
 * Es la fecha que hay que usar para rescatar un corte que no se tomó. No
 * confundir con `finDeTrimestre(hoy)`, que del 1 al 30 de octubre devuelve el
 * 31 de diciembre: una fecha futura, que no sirve ni para tomar la foto ni para
 * mostrarla en pantalla.
 */
export function ultimoCierrePasado(fechaIso: string): string {
  const fin = finDeTrimestre(fechaIso);
  if (fin <= fechaIso) return fin;
  // Estamos en la mitad del trimestre: el cierre anterior es el fin del
  // trimestre previo, o sea el día antes de que empiece este.
  const anio = Number(fechaIso.slice(0, 4));
  const t = trimestreDe(fechaIso);
  const primerMesDeEste = (t - 1) * 3; // índice de mes base 0
  const d = new Date(Date.UTC(anio, primerMesDeEste, 0)); // día 0 = último del mes anterior
  return d.toISOString().slice(0, 10);
}

/**
 * ¿Falta la foto de un cierre que ya pasó?
 *
 * Devuelve la fecha del cierre pendiente, o null si ya está tomada. Es lo que
 * usa el proceso programado: en vez de exigir que HOY sea el último día del
 * trimestre —lo que hacía que un atraso en la cola de GitHub Actions perdiera
 * el cierre para siempre, informando éxito— el cron pregunta si quedó algún
 * cierre sin foto y lo rescata. Como corre todos los días, el reintento sale
 * gratis.
 */
export async function cierrePendiente(fechaIso: string): Promise<string | null> {
  const cierre = ultimoCierrePasado(fechaIso);
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("corte_trimestral")
    .select("id, completo")
    .eq("fecha_corte", cierre)
    .limit(5);
  if (error) throw error;
  const filas = (data ?? []) as { completo?: boolean }[];
  // `completo` no existe hasta la 046: si viene undefined, la foto cuenta.
  const hayCompleta = filas.some((f) => f.completo !== false);
  return hayCompleta ? null : cierre;
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
  const fechaCorte = opciones?.fechaCorte ?? hoyLocal();
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
  const fechaCorte = fechaCorteEntrada ?? hoyLocal();

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
        .order("id") // desempate: sin orden estable el paginado se corre
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
      return {
        secretaria: null, subsecretaria: null, direccion: null,
        esPropioDeSecretaria: false, propia: null,
      };
    }
    if (propia.nivel === 0) {
      // El proyecto está cargado en la secretaría misma: es la "fila de
      // proyectos propios" que pidió Planificación.
      return {
        secretaria: propia, subsecretaria: null, direccion: null,
        esPropioDeSecretaria: true, propia,
      };
    }
    let secretaria: any = null;
    let subsecretaria: any = null;
    // La dirección es el ancestro de nivel 2, o la unidad misma si ya es de
    // nivel 2. Hace falta para los 9 proyectos que cuelgan de departamentos
    // (nivel 3, los cuatro museos): sin esto no se pueden anidar en la tabla
    // del reporte, que va subsecretaría > dirección.
    let direccion: any = propia.nivel === 2 ? propia : null;
    let cur: any = propia;
    const vistos = new Set<string>([propia.id]);
    while (cur) {
      if (cur.nivel === 2 && !direccion) direccion = cur;
      if (cur.nivel === 1) subsecretaria = cur;
      if (cur.nivel === 0) { secretaria = cur; break; }
      if (!cur.parent_id || vistos.has(cur.parent_id)) break;
      vistos.add(cur.parent_id);
      cur = unidadPorId.get(cur.parent_id) ?? null;
    }
    return { secretaria, subsecretaria, direccion, esPropioDeSecretaria: false, propia };
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
      direccion_id: pos.direccion?.id ?? null,
      direccion_nombre: pos.direccion?.nombre_corto ?? pos.direccion?.nombre ?? null,
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

  // La foto anterior de esta misma fecha, si existe. NO se borra todavía.
  const { data: previo } = await sb
    .from("corte_trimestral")
    .select("id")
    .eq("periodo_id", periodoId)
    .eq("anio", anio)
    .eq("trimestre", trimestre)
    .eq("fecha_corte", fechaCorte)
    .eq("completo", true)
    .maybeSingle();
  const reemplazo = !!previo;

  // Antes se borraba la anterior acá, antes de escribir la nueva. Si el detalle
  // fallaba a mitad de camino quedaba sin ninguna foto, y es el único dato del
  // sistema que no se puede reconstruir. Ahora se escribe primero la nueva como
  // incompleta —los lectores la ignoran—, se llena, se marca completa y recién
  // entonces se borra la vieja. El índice único de la 046 es parcial sobre las
  // completas justamente para que las dos puedan convivir ese rato.
  const cabecera = {
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
    completo: false,
    metadata: {
      periodo: foto.periodoNombre,
      // Queda anotado con qué se tomó, para poder explicar diferencias entre
      // dos fotos si algún día el cálculo cambia.
      cascada: "avanceMetaEnPlazo -> avanceAgregado -> estadoDeAvance",
      plazo_indicador_activo: false,
      reemplazo,
    } as Record<string, unknown>,
  };

  const { data: corte, error: eCorte } = await sb
    .from("corte_trimestral")
    .insert(cabecera)
    .select("id")
    .single();
  if (eCorte || !corte) {
    if (esColumnaInexistente(eCorte)) throw new Error(FALTA_046);
    throw eCorte ?? new Error("No se pudo crear el corte");
  }
  const corteId = (corte as { id: string }).id;

  // Inserta el detalle por lotes: 441 filas de una sola vez es un payload
  // grande y PostgREST se pone quisquilloso.
  const LOTE = 200;
  // Si la 046 no está aplicada, las columnas direccion_* no existen. Antes eso
  // hacía fallar la foto entera con un error de PostgREST en inglés sobre el
  // schema cache. Una foto sin la dirección intermedia es infinitamente mejor
  // que ninguna: se reintenta sin esas claves y queda anotado en metadata.
  let sinDireccion = false;
  const lote = (desde: number) =>
    filas.slice(desde, desde + LOTE).map((f) => {
      const fila: Record<string, unknown> = { ...f, corte_id: corteId };
      if (sinDireccion) {
        delete fila.direccion_id;
        delete fila.direccion_nombre;
      }
      return fila;
    });

  for (let i = 0; i < filas.length; i += LOTE) {
    let { error } = await sb.from("corte_trimestral_proyecto").insert(lote(i));
    if (error && esColumnaInexistente(error) && !sinDireccion) {
      sinDireccion = true;
      ({ error } = await sb.from("corte_trimestral_proyecto").insert(lote(i)));
    }
    if (error) {
      // La cabecera quedó incompleta: los lectores ya la ignoran, pero se borra
      // igual para no dejar basura. Si este borrado falla, no se tapa: se suma
      // al mensaje, porque quedaría una fila incompleta suelta.
      const { error: eLimpieza } = await sb.from("corte_trimestral").delete().eq("id", corteId);
      const detalle = eLimpieza ? ` (además quedó una cabecera incompleta sin borrar: ${eLimpieza.message})` : "";
      throw new Error(`${error.message}${detalle}`);
    }
  }

  if (sinDireccion) {
    await sb
      .from("corte_trimestral")
      .update({ metadata: { ...cabecera.metadata, sin_direccion: true, motivo: "falta aplicar la migración 046" } })
      .eq("id", corteId);
  }

  // El detalle ya está entero. Faltan dos pasos y el ORDEN IMPORTA: primero se
  // borra la vieja, después se marca completa la nueva.
  //
  // Al revés no funciona, y el test de la 046 lo agarró: `uq_corte_completo` es
  // un índice único sobre las fotos COMPLETAS de una misma fecha, así que
  // marcar la nueva mientras la vieja sigue completa choca con el índice. No es
  // un detalle del índice: son dos fotos completas del mismo cierre, que es
  // justamente lo que no puede existir.
  //
  // Queda una ventana de un statement en la que ninguna está marcada completa.
  // Es la mejor de las opciones malas sin una transacción: el detalle de la
  // nueva ya está escrito entero, así que si falla acá no se perdió nada — la
  // fila queda sin marcar, los lectores la ignoran, y volver a tomar la foto
  // (o un UPDATE a mano) la recupera. La ventana anterior era mucho peor:
  // se borraba la vieja antes de escribir el detalle de la nueva.
  if (previo) {
    const { error } = await sb.from("corte_trimestral").delete().eq("id", (previo as any).id);
    if (error) {
      // Si no se puede borrar la vieja, no se marca la nueva: dos fotos
      // completas del mismo cierre son peores que una nueva sin marcar.
      throw new Error(
        `No se pudo reemplazar la foto anterior del ${fechaCorte}: ${error.message}. ` +
          "La foto nueva quedó guardada sin marcar como completa; volvé a tomarla."
      );
    }
  }

  // Recién ahora la foto es válida para los lectores.
  const { error: eCompleto } = await sb
    .from("corte_trimestral")
    .update({ completo: true })
    .eq("id", corteId);
  if (eCompleto) {
    if (esColumnaInexistente(eCompleto)) {
      // Sin la columna `completo` (046 sin aplicar) no se puede marcar, pero la
      // foto está entera. Se sigue: el lector viejo no filtra por completo.
      console.warn("corte-trimestral: falta la columna `completo` (migración 046)");
    } else {
      // No se borra la nueva: el detalle está completo y perderlo sería peor
      // que dejarla sin marcar. Los lectores la ignoran hasta que se marque.
      throw new Error(
        `La foto del ${fechaCorte} se escribió entera pero no se pudo marcar como ` +
          `completa: ${eCompleto.message}. Volvé a tomarla.`
      );
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
