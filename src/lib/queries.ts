import { cache } from "react";
import { getSupabaseServer } from "./supabase/server";
import { avanceIndicador, indicadorCumplido } from "./utils";
import type { Periodo, UnidadOrganizacional, Proyecto, Meta, Hito, Avance, Indicador, IndicadorHistorial, AgendaSemana, AgendaActividad, Alerta, AlertaConLectura, IndicadorPorVencer } from "@/types/database";

// Devuelve el lunes ISO (YYYY-MM-DD) de la semana de una fecha dada
export function lunesDeSemana(fecha: Date = new Date()): string {
  const d = new Date(fecha);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export async function getAgendaSemana(
  unidadId: string,
  fechaLunes: string
): Promise<(AgendaSemana & { actividades: AgendaActividad[] }) | null> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("agenda_semana")
    .select("*, actividades:agenda_actividad(*)")
    .eq("unidad_id", unidadId)
    .eq("fecha_lunes", fechaLunes)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const sem = data as AgendaSemana & { actividades: AgendaActividad[] };
  sem.actividades = (sem.actividades ?? []).sort((a, b) =>
    a.dia_semana === b.dia_semana ? a.orden - b.orden : a.dia_semana - b.dia_semana
  );
  return sem;
}

// Suma días a una fecha ISO (YYYY-MM-DD) sin tocar zonas horarias.
export function sumarDias(fechaIso: string, dias: number): string {
  const d = new Date(fechaIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Lunes de la semana de una fecha ISO. Trabaja en UTC a propósito: con la fecha
// como string no hay corrimiento por zona horaria.
export function lunesIso(fechaIso: string): string {
  const day = new Date(fechaIso + "T00:00:00Z").getUTCDay(); // 0=domingo
  return sumarDias(fechaIso, day === 0 ? -6 : 1 - day);
}

// Un evento del calendario: una actividad de la agenda ya resuelta a su fecha
// concreta (fecha_lunes + dia_semana), con la unidad que la cargó.
export interface EventoAgenda {
  id: string;
  fecha: string; // YYYY-MM-DD
  unidad_id: string;
  unidad_nombre: string;
  fecha_lunes: string;
  dia_semana: number;
  orden: number;
  horario: string | null;
  actividad: string;
  lugar: string | null;
  observacion: string | null;
  es_feriado: boolean;
  /** Clave de color propia de la actividad (06.08); null ⇒ color de la unidad. */
  color: string | null;
}

/**
 * Eventos del calendario (30.07) entre dos fechas inclusive. La agenda se
 * guarda por semana (lunes) + día de la semana, así que se traen las semanas
 * que solapan el rango y después se expande cada actividad a su fecha real.
 */
export async function getEventosAgenda(desde: string, hasta: string): Promise<EventoAgenda[]> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("agenda_semana")
    .select("*, unidad:unidad_organizacional(*), actividades:agenda_actividad(*)")
    .gte("fecha_lunes", lunesIso(desde))
    .lte("fecha_lunes", hasta);
  if (error) throw error;

  const eventos: EventoAgenda[] = [];
  for (const sem of (data ?? []) as (AgendaSemana & {
    unidad?: UnidadOrganizacional;
    actividades?: AgendaActividad[];
  })[]) {
    for (const act of sem.actividades ?? []) {
      const fecha = sumarDias(sem.fecha_lunes, act.dia_semana - 1);
      if (fecha < desde || fecha > hasta) continue;
      eventos.push({
        id: act.id,
        fecha,
        unidad_id: sem.unidad_id,
        unidad_nombre: sem.unidad?.nombre_corto ?? sem.unidad?.nombre ?? "—",
        fecha_lunes: sem.fecha_lunes,
        dia_semana: act.dia_semana,
        orden: act.orden,
        horario: act.horario,
        actividad: act.actividad,
        lugar: act.lugar,
        observacion: act.observacion,
        es_feriado: act.es_feriado,
        color: act.color ?? null,
      });
    }
  }

  // El horario es texto libre ("09:00", "Mañana"), así que ordena como texto y
  // deja el `orden` de carga como desempate.
  return eventos.sort((a, b) =>
    a.fecha !== b.fecha
      ? a.fecha.localeCompare(b.fecha)
      : (a.horario ?? "~").localeCompare(b.horario ?? "~") || a.orden - b.orden
  );
}

export async function getAgendasSemana(fechaLunes: string): Promise<AgendaSemana[]> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("agenda_semana")
    .select("*, unidad:unidad_organizacional(*), actividades:agenda_actividad(*)")
    .eq("fecha_lunes", fechaLunes);
  if (error) throw error;
  return (data ?? []) as AgendaSemana[];
}

// -------------------------------------------------------
// Queries server-side para alimentar las vistas.
// Se usan desde Server Components.
// -------------------------------------------------------

// ---------------------------------------------------------------------------
// Paginado (15.08)
// ---------------------------------------------------------------------------
// PostgREST corta en 1000 filas. Antes se paginaba con un while que pedía las
// páginas UNA DETRÁS DE OTRA; con ~1900 indicadores eran dos viajes encadenados
// de ~1 s cada uno. Ahora la primera página trae el count exacto y las que
// faltan salen todas juntas.
const TAMANO_PAGINA = 1000;

type Pagina<T> = { data: T[] | null; error: unknown; count: number | null };

async function traerPaginado<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<Pagina<T>>
): Promise<T[]> {
  const primera = await pagina(0, TAMANO_PAGINA - 1);
  if (primera.error) throw primera.error;
  const filas = (primera.data ?? []) as T[];
  const total = primera.count ?? filas.length;
  if (filas.length >= total) return filas;

  const pendientes: PromiseLike<Pagina<T>>[] = [];
  for (let desde = filas.length; desde < total; desde += TAMANO_PAGINA) {
    pendientes.push(pagina(desde, desde + TAMANO_PAGINA - 1));
  }
  for (const r of await Promise.all(pendientes)) {
    if (r.error) throw r.error;
    filas.push(...((r.data ?? []) as T[]));
  }
  return filas;
}

// Varias lecturas van envueltas en cache() de React: dedupe POR REQUEST (no
// entre usuarios, así que la RLS sigue mandando). Sirve porque el layout y la
// página piden lo mismo, y algunas pantallas piden el período dos veces.

export const getPeriodoActivo = cache(async function getPeriodoActivo(): Promise<Periodo> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("periodo")
    .select("*")
    .eq("activo", true)
    .single();
  if (error) throw error;
  return data as Periodo;
});

export const getUnidades = cache(async function getUnidades(): Promise<UnidadOrganizacional[]> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("unidad_organizacional")
    .select("*")
    .eq("activa", true)
    .order("nivel")
    .order("orden");
  if (error) throw error;
  return (data ?? []) as UnidadOrganizacional[];
});

// Lo que las pantallas usan de la unidad de un proyecto. El embed traía la fila
// completa repetida en cada uno de los ~450 proyectos (449 KB → 229 KB).
export type UnidadResumen = Pick<
  UnidadOrganizacional,
  "id" | "nombre" | "nombre_corto" | "nivel" | "parent_id"
>;

export type ProyectoConUnidad = Proyecto & { unidad: UnidadResumen };

/**
 * Los proyectos del período: activos y no borrados. UN SOLO UNIVERSO.
 *
 * El filtro por `estado` se agregó el 09.09. Antes esta función traía también
 * los pausados, y el filtro quedaba a criterio de cada pantalla: el Panel
 * Ejecutivo y la TV filtraban (`dashboard/page.tsx:72`, `tv-panel.tsx:43`) y las
 * otras cinco no, así que el Panel contaba 441 proyectos y /proyectos, /metas,
 * /indicadores, /estructura y /avance-direcciones contaban 448. Al hacer clic en
 * el KPI "Proyectos 441" del Panel se aterrizaba en una pantalla que encabezaba
 * "448 de 448".
 *
 * Los 7 de diferencia son de la Dirección de Inteligencia Artificial, pausados
 * directamente en la base a fines de junio: hoy la app no tiene ninguna pantalla
 * para pausar ni reactivar un proyecto (`estado` solo se escribe como "activo" al
 * crearlo, `actions.ts:1228`), y ninguno de los 7 tuvo nunca una carga de avance.
 *
 * "Activos y no borrados" es el criterio que ya usaban las fotos de corte
 * (`corte-trimestral.ts:235`), el Plan Rector (`plan-rector.ts:233`), el
 * asistente y el reporte trimestral, o sea el que produce los números oficiales
 * que el cliente ya vio. Ahora lo usa todo el sistema desde un solo lugar.
 */
export const getProyectos = cache(async function getProyectos(
  periodoId: string
): Promise<ProyectoConUnidad[]> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("proyecto")
    .select("*, unidad:unidad_organizacional(id, nombre, nombre_corto, nivel, parent_id)")
    .eq("periodo_id", periodoId)
    .eq("estado", "activo")
    .is("deleted_at", null)
    .order("orden");
  if (error) throw error;
  return (data ?? []) as ProyectoConUnidad[];
});

export async function getProyecto(id: string): Promise<Proyecto & { unidad: UnidadOrganizacional }> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("proyecto")
    .select("*, unidad:unidad_organizacional(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as Proyecto & { unidad: UnidadOrganizacional };
}

export async function getMetasPorProyecto(proyectoId: string): Promise<Meta[]> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("meta")
    .select("*")
    .eq("proyecto_id", proyectoId)
    .is("deleted_at", null)
    .order("orden");
  if (error) throw error;
  return (data ?? []) as Meta[];
}

export async function getHitosPorProyecto(proyectoId: string): Promise<Hito[]> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("hito")
    .select("*")
    .eq("proyecto_id", proyectoId)
    .is("deleted_at", null)
    .order("orden");
  if (error) throw error;
  return (data ?? []) as Hito[];
}

export async function getAvancesPorProyecto(proyectoId: string): Promise<Avance[]> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("avance")
    .select("*")
    .eq("proyecto_id", proyectoId)
    .order("fecha_reporte", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as Avance[];
}

export async function getTodosLosHitos(periodoId: string) {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("hito")
    .select("*, proyecto:proyecto!inner(id, nombre, codigo, periodo_id)")
    .eq("proyecto.periodo_id", periodoId)
    .is("deleted_at", null)
    .order("fecha_esperada");
  if (error) throw error;
  return data ?? [];
}

// Indicador con lo mínimo de su meta y su proyecto para poder listarlo y
// agruparlo (/indicadores). Antes el embed traía la meta ENTERA por cada uno de
// los ~1900 indicadores.
export type IndicadorConMeta = Indicador & {
  meta?: {
    id: string;
    nombre: string;
    proyecto?: { id: string; nombre: string; codigo: string | null; unidad_id: string };
  };
};

// Indicadores con su meta y su proyecto: solo para la pantalla que los muestra.
// Para calcular avances está getIndicadoresAvance, que es más liviana todavía.
export const getIndicadores = cache(async function getIndicadores(): Promise<IndicadorConMeta[]> {
  const supabase = await getSupabaseServer();
  return traerPaginado<IndicadorConMeta>((desde, hasta) =>
    supabase
      .from("indicador")
      .select("*, meta:meta(id, nombre, proyecto:proyecto(id, nombre, codigo, unidad_id))", {
        count: "exact",
      })
      .is("deleted_at", null)
      .order("orden")
      .order("id") // desempate: "orden" no es único y el paginado se correría
      .range(desde, hasta) as unknown as PromiseLike<Pagina<IndicadorConMeta>>
  );
});

export type IndicadorAvance = Pick<
  Indicador,
  | "id"
  | "meta_id"
  | "codigo"
  | "nombre"
  | "unidad_medida"
  | "valor_actual"
  | "valor_objetivo"
  | "valor_actual_texto"
  | "valor_objetivo_texto"
  | "estado_semaforo"
  | "ultima_actualizacion"
  | "orden"
  | "metadata"
> & {
  // Solo lo necesario para ubicar el indicador en el árbol (ámbito del panel).
  meta?: { id: string; proyecto?: { id: string; periodo_id: string; unidad_id: string } };
};

/**
 * Indicadores para el cálculo de avance (15.08). Contra getIndicadores():
 * sin la meta ni el proyecto anidados, sin columnas de texto largas y acotado
 * al período. Baja el payload de ~3 MB a ~0,6 MB por pantalla.
 */
export const getIndicadoresAvance = cache(async function getIndicadoresAvance(
  periodoId: string
): Promise<IndicadorAvance[]> {
  const supabase = await getSupabaseServer();
  // El cast es por supabase-js: tipa los embeds como array aunque `meta` sea
  // una relación uno-a-uno y PostgREST devuelva un objeto.
  return traerPaginado<IndicadorAvance>((desde, hasta) =>
    supabase
      .from("indicador")
      .select(
        "id, meta_id, codigo, nombre, unidad_medida, valor_actual, valor_objetivo, valor_actual_texto, valor_objetivo_texto, estado_semaforo, ultima_actualizacion, orden, metadata, meta:meta!inner(id, proyecto:proyecto!inner(id, periodo_id, unidad_id))",
        { count: "exact" }
      )
      .eq("meta.proyecto.periodo_id", periodoId)
      .is("deleted_at", null)
      .order("orden")
      .order("id") // ídem: desempate para que el paginado no se corra
      .range(desde, hasta) as unknown as PromiseLike<Pagina<IndicadorAvance>>
  );
});

// Devuelve totales de indicadores (count + semáforo) filtrados por periodo y
// opcionalmente por un set de unidad_ids (scope). Se ejecuta server-side para
// evitar el límite de 1000 rows y para que pueda respetar el scope del usuario.
export async function getIndicadoresStats(
  periodoId: string,
  unidadIds?: string[] | null
) {
  const supabase = await getSupabaseServer();
  const estados = ["verde", "amarillo", "rojo", "sin_datos"] as const;
  const baseQuery = () => {
    let q = supabase
      .from("indicador")
      .select(
        "id, meta:meta!inner(id, proyecto:proyecto!inner(id, periodo_id, unidad_id))",
        { count: "exact", head: true }
      )
      .eq("meta.proyecto.periodo_id", periodoId)
      .is("deleted_at", null);
    if (unidadIds && unidadIds.length > 0) {
      q = q.in("meta.proyecto.unidad_id", unidadIds);
    }
    return q;
  };

  const [{ count: total }, ...porEstado] = await Promise.all([
    baseQuery(),
    ...estados.map((e) => baseQuery().eq("estado_semaforo", e)),
  ]);
  const semaforo = { verde: 0, amarillo: 0, rojo: 0, sin_datos: 0 };
  estados.forEach((e, i) => {
    semaforo[e] = porEstado[i].count ?? 0;
  });
  return { total: total ?? 0, semaforo };
}

export async function getIndicadoresPorMeta(metaId: string): Promise<Indicador[]> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("indicador")
    .select("*")
    .eq("meta_id", metaId)
    .is("deleted_at", null)
    .order("orden");
  if (error) throw error;
  return (data ?? []) as Indicador[];
}

// Historial de Carga de un indicador (30.07): últimas cargas/actualizaciones,
// de la más reciente a la más vieja. Si la tabla todavía no existe (migración
// 028 sin aplicar) devuelve vacío en vez de romper la página.
export async function getHistorialIndicador(
  indicadorId: string,
  limite = 50
): Promise<IndicadorHistorial[]> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("indicador_historial")
    .select("*")
    .eq("indicador_id", indicadorId)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) return [];
  return (data ?? []) as IndicadorHistorial[];
}

// Todas las metas (no borradas) de un período. Filtra vía join inverso a
// proyecto en vez de mandar cientos de UUIDs en la URL (que dispara
// HeadersOverflowError cuando hay muchos proyectos). Paginado para no truncar.
export const getMetasDelPeriodo = cache(async function getMetasDelPeriodo(
  periodoId: string
): Promise<Meta[]> {
  const supabase = await getSupabaseServer();
  return traerPaginado<Meta>((desde, hasta) =>
    supabase
      .from("meta")
      .select("*, proyecto:proyecto!inner(id, periodo_id)", { count: "exact" })
      .eq("proyecto.periodo_id", periodoId)
      .is("deleted_at", null)
      .order("id")
      .range(desde, hasta)
  );
});

export const getResumenDashboard = cache(async function getResumenDashboard(periodoId: string) {
  const supabase = await getSupabaseServer();

  // 15.08: las tres lecturas iban una atrás de la otra (~2,5 s encadenados).
  // No dependen entre sí, así que van juntas. Los counts de indicadores por
  // semáforo que había acá se sacaron: nadie los usaba y eran 5 requests más.
  const [proyectos, metas, hitos] = await Promise.all([
    getProyectos(periodoId),
    getMetasDelPeriodo(periodoId),
    // Hitos del período vía join inverso (mismo motivo que metas).
    traerPaginado<Hito>((desde, hasta) =>
      supabase
        .from("hito")
        .select("*, proyecto:proyecto!inner(id, periodo_id)", { count: "exact" })
        .eq("proyecto.periodo_id", periodoId)
        .is("deleted_at", null)
        .order("id")
        .range(desde, hasta)
    ),
  ]);

  const metasPorProyecto = new Map<string, Meta[]>();
  for (const m of metas) {
    const arr = metasPorProyecto.get(m.proyecto_id) ?? [];
    arr.push(m);
    metasPorProyecto.set(m.proyecto_id, arr);
  }

  const totalMetas = metas.length;
  const metasSemaforo = {
    verde: metas.filter((m) => m.estado_semaforo === "verde").length,
    amarillo: metas.filter((m) => m.estado_semaforo === "amarillo").length,
    rojo: metas.filter((m) => m.estado_semaforo === "rojo").length,
    sin_datos: metas.filter(
      (m) => m.estado_semaforo === "sin_datos" || m.estado_semaforo === "gris"
    ).length,
  };

  // Solo metas que tienen avance reportado cuentan para el porcentaje global
  const metasConAvance = metas.filter(
    (m) => m.ultima_actualizacion != null && m.valor_actual != null
  );

  let porcentajeGlobal: number | null = null;
  if (metasConAvance.length > 0) {
    const cuantiConAvance = metasConAvance.filter(
      (m) => m.tipo_medicion === "cuantitativo" && m.valor_meta != null
    );
    if (cuantiConAvance.length > 0) {
      const suma = cuantiConAvance.reduce((acc, m) => {
        const base = m.valor_linea_base ?? 0;
        const actual = m.valor_actual ?? base;
        const meta = m.valor_meta!;
        const rango = meta - base;
        if (rango === 0) return acc + (actual >= meta ? 100 : 0);
        const invertida = (m.metadata as Record<string, unknown>)?.invertida === true;
        if (invertida) {
          return acc + Math.max(0, Math.min(100, ((base - actual) / (base - meta)) * 100));
        }
        return acc + Math.max(0, Math.min(100, ((actual - base) / rango) * 100));
      }, 0);
      porcentajeGlobal = Math.round(suma / cuantiConAvance.length);
    } else {
      porcentajeGlobal = 0;
    }
  }

  const tieneSeguimiento = metasConAvance.length > 0;

  const hitosCompletados = hitos.filter((h) => h.completado).length;
  const hitosTotal = hitos.length;

  // Proximo hito: solo los que tienen fecha FUTURA (no pasada sin completar)
  const ahora = new Date().toISOString().slice(0, 10);
  const proximoHito = hitos
    .filter((h) => !h.completado && h.fecha_esperada && h.fecha_esperada >= ahora)
    .sort((a, b) => a.fecha_esperada!.localeCompare(b.fecha_esperada!))[0] ?? null;

  // Hitos vencidos: fecha pasada y no completados
  const hitosVencidos = hitos.filter(
    (h) => !h.completado && h.fecha_esperada && h.fecha_esperada < ahora
  ).length;

  return {
    proyectos,
    metas,
    metasPorProyecto,
    hitos,
    totalMetas,
    metasSemaforo,
    porcentajeGlobal,
    tieneSeguimiento,
    hitosCompletados,
    hitosTotal,
    hitosVencidos,
    proximoHito,
  };
});

// ---------------------------------------------------------------------------
// Alertas dentro del sistema (26.08)
// ---------------------------------------------------------------------------

/**
 * Las alertas manuales que le llegaron al usuario y todavía están vigentes.
 * Ordenadas por fecha, las más nuevas primero. RLS ya acota a las propias.
 */
export const getAlertasDelUsuario = cache(async function getAlertasDelUsuario(): Promise<
  AlertaConLectura[]
> {
  const supabase = await getSupabaseServer();
  const hoy = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("alerta_destinatario")
    .select("leida_at, alerta:alerta(*)")
    .order("created_at", { referencedTable: "alerta", ascending: false })
    .limit(50);
  if (error) throw error;

  return ((data ?? []) as unknown as { leida_at: string | null; alerta: Alerta | null }[])
    .flatMap((d) => (d.alerta ? [{ ...d.alerta, leida_at: d.leida_at }] : []))
    // Vigencia: se filtra acá y no en la query porque `vigente_hasta` nulo
    // significa "sin vencimiento" y con un .or() encadenado queda ilegible.
    .filter((a) => !a.vigente_hasta || a.vigente_hasta >= hoy)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
});

/**
 * Indicadores del ámbito del usuario que vencen dentro de `dias` y todavía no
 * llegaron a su objetivo. Es la alerta automática, y NO se guarda en ninguna
 * tabla: se calcula cada vez, así aparece cuando el indicador está por vencer y
 * desaparece sola cuando lo cargan.
 *
 * Los vencidos quedan afuera a propósito: esto avisa de lo que se puede llegar
 * a cargar todavía. Lo vencido ya lo muestra el semáforo en rojo.
 */
export const getIndicadoresPorVencer = cache(async function getIndicadoresPorVencer(
  dias = 15
): Promise<IndicadorPorVencer[]> {
  const supabase = await getSupabaseServer();

  const hoy = new Date();
  const desde = hoy.toISOString().slice(0, 10);
  const hasta = new Date(hoy.getTime() + dias * 86400000).toISOString().slice(0, 10);

  // Los `!inner` con sus filtros son para no avisar por indicadores que cuelgan
  // de una meta o un proyecto ya borrado: hoy 485 de los 1896 indicadores vivos
  // pertenecen a metas con deleted_at, y sin esto aparecerían en la campanita
  // como pendientes de algo que ya no existe.
  const { data, error } = await supabase
    .from("indicador")
    .select(
      `id, nombre, fecha_fin, valor_actual, valor_actual_texto, valor_objetivo,
       valor_objetivo_texto, estado_semaforo, metadata,
       meta:meta!inner(deleted_at,
         proyecto:proyecto!inner(id, nombre, deleted_at,
           unidad:unidad_organizacional(nombre_corto, nombre)))`
    )
    .is("deleted_at", null)
    .is("meta.deleted_at", null)
    .is("meta.proyecto.deleted_at", null)
    .not("fecha_fin", "is", null)
    .gte("fecha_fin", desde)
    .lte("fecha_fin", hasta)
    .order("fecha_fin")
    .limit(200);
  if (error) throw error;

  const unDia = 86400000;
  const hoyMs = Date.parse(desde);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  return ((data ?? []) as any[])
    // Si ya alcanzó el objetivo no hay nada que avisar.
    .filter((i) => !indicadorCumplido(i))
    .map((i) => {
      const proyecto = i.meta?.proyecto ?? null;
      return {
        indicador_id: i.id as string,
        indicador_nombre: i.nombre as string,
        proyecto_id: (proyecto?.id as string) ?? "",
        proyecto_nombre: (proyecto?.nombre as string) ?? "(proyecto sin nombre)",
        unidad_nombre:
          proyecto?.unidad?.nombre_corto ?? proyecto?.unidad?.nombre ?? null,
        fecha_fin: i.fecha_fin as string,
        dias_restantes: Math.round((Date.parse(i.fecha_fin) - hoyMs) / unDia),
        avance: avanceIndicador(i),
      };
    });
  /* eslint-enable @typescript-eslint/no-explicit-any */
});
