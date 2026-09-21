/**
 * Reporte trimestral de cumplimiento — capa de datos (etapa 2).
 *
 * Armá el bloque 2 (estado general) y el bloque 4 (desempeño por área) de la
 * plantilla que mandó Planificación, a partir de una foto de corte.
 *
 * DOS ORÍGENES:
 *   'corte' → lee una foto guardada. Es el modo oficial: el número no cambia
 *             nunca más, así que un informe firmado sigue coincidiendo.
 *   'vivo'  → calcula con los datos de hoy, sin guardar nada. Sirve para
 *             previsualizar antes de que exista la foto del cierre, que es
 *             justo la situación de hoy (0 cortes al 07.09).
 *
 * UN SOLO UNIVERSO DE PROYECTOS. Los totales de la tabla suman exactamente el
 * total del encabezado porque los dos salen de las mismas filas. En PlanIA
 * conviven tres universos posibles según se filtre por proyecto activo, meta
 * viva o indicador vivo (441 / 789 / 1404, y 1896 indicadores en total), y si
 * el reporte mezclara dos, la tabla no cerraría con el total de arriba y el
 * documento perdería credibilidad en la primera lectura. Acá el universo es el
 * de la foto: proyectos del período, activos y no borrados.
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { calcularFotoCorte } from "@/lib/corte-trimestral";
import { promedioDeProyectos } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ConteoEstados {
  proyectos: number;
  finalizados: number;
  en_ejecucion: number;
  no_iniciados: number;
  sin_datos: number;
  /** Promedio de avance de los proyectos de la fila. null si ninguno tiene dato. */
  pct: number | null;
  /**
   * Proporción de proyectos con datos cargados, 0-100.
   *
   * OJO: es una interpretación nuestra, no la definición del cliente. La
   * plantilla trae una columna "Índice de Carga" sin definirla en ningún lado.
   * Nuestra lectura es "qué parte del área tiene información en el sistema",
   * o sea el complemento de Sin Datos. Mientras `indiceCargaProvisorio` del
   * reporte sea true, esto no se puede publicar como dato.
   */
  indice_carga: number | null;
  /**
   * Metas e indicadores del área, y cuántos tienen información cargada.
   *
   * 15.09: los dos modelos nuevos piden "Completitud de metas" y "Completitud
   * de indicadores", definidas en su Anexo como "la proporción de componentes
   * que cuentan con información registrada respecto del total definido".
   */
  metas: number;
  metas_con_datos: number;
  indicadores: number;
  indicadores_con_datos: number;
  /** metas_con_datos / metas × 100. null si no hay metas. */
  completitud_metas: number | null;
  /** indicadores_con_datos / indicadores × 100. null si no hay indicadores. */
  completitud_indicadores: number | null;
}

export type TipoFila = "subsecretaria" | "direccion" | "departamento" | "propios_secretaria";

/** Un proyecto en el reporte de una dirección. */
export interface FilaProyecto {
  nombre: string;
  codigo: string | null;
  unidad_nombre: string | null;
  estado: "verde" | "amarillo" | "rojo" | "sin_datos";
  pct: number | null;
  metas: number;
  metas_con_datos: number;
  indicadores: number;
  indicadores_con_datos: number;
}

export interface FilaReporte extends ConteoEstados {
  tipo: TipoFila;
  nombre: string;
  unidad_id: string | null;
  hijos: FilaReporte[];
}

export interface ReporteUnidad {
  origen: "corte" | "vivo";
  /** Datos del corte, cuando el origen es 'corte'. */
  corte: {
    id: string;
    anio: number;
    trimestre: number;
    fecha_corte: string;
    tomado_at: string;
  } | null;
  /** El área que reporta. null = solo los totales del municipio. */
  unidad: { id: string; nombre: string; nivel: number; tipo: string } | null;
  /** Bloque 2 de la plantilla: el estado general del área. */
  totalUnidad: ConteoEstados;
  /** Bloque 4 para secretaría y subsecretaría: el árbol de la estructura. */
  filas: FilaReporte[];
  /** Bloque 4 para dirección y departamento: la lista de proyectos. */
  proyectos: FilaProyecto[];
  /** Totales del municipio, para el bloque 1. */
  totalMunicipio: ConteoEstados;
  /** true mientras el cliente no defina el Índice de Carga. */
  indiceCargaProvisorio: boolean;
  /**
   * El área de la que depende esta, con su avance, para la comparación del
   * punto 1 del informe de Direcciones (15.09, párrafo 914: "en comparación con
   * el conjunto de su Secretaría / Subsecretaría, cuyo avance promedio alcanza
   * el [X]%, la Dirección presenta una diferencia de [+/- X] puntos").
   *
   * Sale de las MISMAS filas de la foto, que traen la jerarquía denormalizada
   * del día del corte: no hace falta otra consulta, y un informe viejo sigue
   * comparando contra el área que correspondía entonces aunque después hayan
   * movido la dirección de lugar.
   */
  superior: { nombre: string; rotulo: string; pct: number | null } | null;
  /** La ruta del área, para el encabezado del informe de Direcciones. */
  ruta: { secretaria: string | null; subsecretaria: string | null };
}

const VACIO = (): ConteoEstados => ({
  proyectos: 0, finalizados: 0, en_ejecucion: 0, no_iniciados: 0, sin_datos: 0,
  pct: null, indice_carga: null,
  metas: 0, metas_con_datos: 0, indicadores: 0, indicadores_con_datos: 0,
  completitud_metas: null, completitud_indicadores: null,
});

/** Acumula una fila de la foto en un conteo, y junta los pct para promediar. */
function sumar(acc: ConteoEstados, fila: any, pcts: (number | null)[]) {
  acc.proyectos++;
  if (fila.estado === "verde") acc.finalizados++;
  else if (fila.estado === "amarillo") acc.en_ejecucion++;
  else if (fila.estado === "rojo") acc.no_iniciados++;
  else acc.sin_datos++;
  acc.metas += fila.metas ?? 0;
  acc.metas_con_datos += fila.metas_con_datos ?? 0;
  acc.indicadores += fila.indicadores ?? 0;
  acc.indicadores_con_datos += fila.indicadores_con_datos ?? 0;
  pcts.push(fila.pct ?? null);
}

/**
 * Cierra un conteo: promedio de avance, cobertura y completitud.
 *
 * EL PROMEDIO CAMBIÓ EL 15.09. Antes los proyectos sin dato contaban como 0 en
 * el numerador pero seguían en el denominador. Ahora quedan afuera de los dos,
 * porque es lo que dice el Anexo que escribió Planificación para los modelos
 * nuevos:
 *
 *   "Avance promedio = Σ avance de proyectos evaluables / cantidad de proyectos
 *    evaluables. Los proyectos clasificados como Sin Datos no intervienen en
 *    este cálculo."
 *
 * Y es más defendible: promediar ceros mezcla "no avanzó" con "no cargó", que
 * es justo lo que su propio Anexo advierte que no se puede inferir. Un área con
 * 10 proyectos, 5 al 60 % y 5 sin datos, daba 30 % y ahora da 60 %.
 *
 * Medido el 16.09, el cambio se nota: el promedio del municipio pasa de 40 % a
 * 48 %, y Contaduría de 36 a 65. Un área sin NINGÚN proyecto evaluable ya no da
 * 0 sino null — no se puede promediar lo que no se midió.
 */
function cerrar(acc: ConteoEstados, pcts: (number | null)[]): ConteoEstados {
  acc.pct = promedioDeProyectos(pcts).pct;
  acc.completitud_metas = acc.metas === 0
    ? null
    : Math.round((acc.metas_con_datos / acc.metas) * 100);
  acc.completitud_indicadores = acc.indicadores === 0
    ? null
    : Math.round((acc.indicadores_con_datos / acc.indicadores) * 100);
  acc.indice_carga = acc.proyectos === 0
    ? null
    : Math.round(((acc.proyectos - acc.sin_datos) / acc.proyectos) * 100);
  return acc;
}

/**
 * La "fase institucional" del anexo metodológico que escribió Planificación:
 * Consolidación 80-100, Desarrollo 50-79, Inicio 1-49, Pendiente de Registro 0
 * o sin carga.
 *
 * Ojo: son umbrales de ROTULADO del promedio de un área, y no tienen nada que
 * ver con los del estado de un proyecto (verde a 100 en la cascada). Son dos
 * escalas distintas sobre cosas distintas, las dos definidas por el cliente.
 */
/**
 * Las cuatro fases institucionales, con el texto tal como lo escribió
 * Planificación en su plantilla.
 *
 * Viven acá y no en el anexo porque desde el 09.09 se usan en dos lugares: el
 * anexo, que las lista todas, y el pie del bloque 2, que muestra la definición
 * de la fase que le tocó a esta área (párrafo 761: "un asterisco en la fase con
 * su definición al pie, para no tener que ir al anexo"). Un solo texto para los
 * dos, o se van a desincronizar.
 */
export const FASES = [
  {
    icono: "🎯",
    nombre: "Fase de Consolidación",
    rango: "80 % al 100 %",
    texto:
      "El área alcanzó el objetivo central o está muy cerca de la meta prevista para este trimestre, sosteniendo el ritmo del plan anual.",
  },
  {
    icono: "📋",
    nombre: "Fase de Desarrollo",
    rango: "50 % al 79 %",
    texto:
      "El área se encuentra trabajando con una dinámica intermedia; los proyectos están en agenda activa y avanzando en territorio.",
  },
  {
    icono: "📌",
    nombre: "Fase de Inicio",
    rango: "1 % al 49 %",
    texto:
      "El área fijó sus prioridades y tiene las primeras acciones registradas, requiriendo un espacio de acompañamiento técnico para acelerar el ritmo.",
  },
  {
    icono: "🔎",
    nombre: "Pendiente de Registro",
    rango: "0 % o áreas sin carga",
    texto:
      "El sistema registra la hoja en blanco al momento del corte, señalando la necesidad de iniciar el proceso de carga digital junto a la Dirección de Planificación.",
  },
] as const;

export type Fase = (typeof FASES)[number];

export function faseInstitucional(pct: number | null): Fase {
  if (pct == null || pct === 0) return FASES[3];
  if (pct >= 80) return FASES[0];
  if (pct >= 50) return FASES[1];
  return FASES[2];
}

export interface AnalisisReporte {
  balance: string | null;
  desvios: string | null;
  oportunidades: string | null;
  estado: "borrador" | "publicado";
  publicado_at: string | null;
  actualizado_at: string | null;
  actualizado_por_email: string | null;
}

/**
 * El análisis (bloque 3) de un área para un trimestre, o null si nadie lo
 * escribió todavía.
 *
 * Va con el cliente de sesión y NO con el admin, a propósito: la RLS de la
 * migración 047 es la que decide que un borrador lo vea solo Planificación.
 * Leerlo con el admin saltearía eso y un secretario podría ver un texto sobre
 * su gestión a medio redactar.
 */
export async function getAnalisisReporte(opciones: {
  anio: number;
  trimestre: number;
  unidadId: string;
}): Promise<AnalisisReporte | null> {
  const { getSupabaseServer } = await import("@/lib/supabase/server");
  const sb = await getSupabaseServer();
  const { data, error } = await sb
    .from("reporte_analisis")
    .select("balance, desvios, oportunidades, estado, publicado_at, updated_at, actualizado_por_email")
    .eq("anio", opciones.anio)
    .eq("trimestre", opciones.trimestre)
    .eq("unidad_id", opciones.unidadId)
    .maybeSingle();

  // Si la 047 no está aplicada todavía, el reporte se muestra sin el bloque 3
  // en vez de romperse: el código se despliega solo y las migraciones las
  // aplica una persona.
  if (error) {
    const e = error as { code?: string; message?: string };
    if (e.code === "42P01" || e.code === "PGRST205" ||
        /relation .* does not exist|could not find the table/i.test(e.message ?? "")) {
      return null;
    }
    throw error;
  }
  if (!data) return null;

  const d = data as any;
  return {
    balance: d.balance,
    desvios: d.desvios,
    oportunidades: d.oportunidades,
    estado: d.estado,
    publicado_at: d.publicado_at,
    actualizado_at: d.updated_at,
    actualizado_por_email: d.actualizado_por_email,
  };
}

/** Cortes disponibles para elegir en la pantalla. */
export async function getCortesParaReporte() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("corte_trimestral")
    .select("id, anio, trimestre, fecha_corte, origen, tomado_at, proyectos, completo")
    .order("fecha_corte", { ascending: false })
    .limit(24);
  if (error) throw error;
  // Una foto a medias no se ofrece: el reporte saldría con menos proyectos de
  // los que hay y nada lo delataría.
  return (data ?? []).filter((c: any) => c.completo !== false);
}

export interface UnidadReporte {
  id: string;
  nombre: string;
  nombre_largo: string;
  nivel: number;
  tipo: string;
  parent_id: string | null;
  codigo: string | null;
}

/**
 * Todas las unidades activas, para el selector del reporte.
 *
 * El mismo informe se emite para secretaría, subsecretaría y dirección: son 9,
 * 7 y 46 unidades con proyectos (66 reportes con contenido sobre 79 unidades).
 */
export async function getUnidadesParaReporte(): Promise<UnidadReporte[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("unidad_organizacional")
    .select("id, nombre, nombre_corto, nivel, tipo, parent_id, codigo")
    .eq("activa", true)
    .order("nivel")
    .order("orden");
  if (error) throw error;
  return (data ?? []).map((u: any) => ({
    id: u.id,
    nombre: u.nombre_corto ?? u.nombre,
    nombre_largo: u.nombre,
    nivel: u.nivel,
    tipo: u.tipo,
    parent_id: u.parent_id,
    codigo: u.codigo,
  }));
}

/**
 * Las filas de la foto que le corresponden a una unidad.
 *
 * Cada nivel se filtra por su propia columna denormalizada, que es justo para
 * lo que están: no hay que recorrer el árbol vivo, así que un informe viejo
 * sigue diciendo lo mismo aunque después muevan la unidad.
 */
function filasDeUnidad(filas: any[], unidad: { id: string; nivel: number }): any[] {
  if (unidad.nivel === 0) return filas.filter((f) => f.secretaria_id === unidad.id);
  if (unidad.nivel === 1) return filas.filter((f) => f.subsecretaria_id === unidad.id);
  if (unidad.nivel === 2) return filas.filter((f) => f.direccion_id === unidad.id);
  return filas.filter((f) => f.unidad_id === unidad.id);
}

/** Trae las filas de la foto: de un corte guardado, o calculadas al vuelo. */
async function traerFilas(opciones: {
  corteId?: string;
  fechaCorte?: string;
}): Promise<{ filas: any[]; corte: ReporteUnidad["corte"]; origen: "corte" | "vivo" }> {
  if (!opciones.corteId) {
    const foto = await calcularFotoCorte(opciones.fechaCorte);
    return { filas: foto.filas, corte: null, origen: "vivo" };
  }

  const sb = getSupabaseAdmin();
  const { data: cab, error: eCab } = await sb
    .from("corte_trimestral")
    .select("id, anio, trimestre, fecha_corte, tomado_at, proyectos, completo")
    .eq("id", opciones.corteId)
    .single();
  if (eCab || !cab) throw eCab ?? new Error("Ese corte no existe");

  // Una foto a medias da un informe con menos proyectos de los que hay, y los
  // totales cierran igual entre sí porque salen de las mismas filas: nada la
  // delata. Mejor no servirla.
  const c = cab as any;
  if (c.completo === false) {
    throw new Error(
      `La foto del ${c.fecha_corte} quedó incompleta (se escribieron algunas de ` +
        `las ${c.proyectos} filas). Volvé a tomarla antes de emitir el reporte.`
    );
  }

  const filas: any[] = [];
  const TAM = 1000;
  for (let desde = 0; ; desde += TAM) {
    const { data, error } = await sb
      .from("corte_trimestral_proyecto")
      .select(
        "id, proyecto_nombre, proyecto_codigo, unidad_id, unidad_nombre, unidad_nivel, " +
          "secretaria_id, secretaria_nombre, subsecretaria_id, subsecretaria_nombre, " +
          "direccion_id, direccion_nombre, es_propio_de_secretaria, estado, pct, " +
          "metas, metas_con_datos, indicadores, indicadores_con_datos"
      )
      .eq("corte_id", opciones.corteId)
      // Sin orden estable, dos páginas con OFFSET distinto pueden repetir o
      // perder filas: un proyecto contado dos veces o ninguna, en silencio.
      .order("id")
      .range(desde, desde + TAM - 1);
    if (error) throw error;
    const lote = data ?? [];
    filas.push(...lote);
    if (lote.length < TAM) break;
  }

  return { filas, corte: cab as any, origen: "corte" };
}

/**
 * El reporte de una unidad: secretaría, subsecretaría o dirección.
 *
 * @param unidadId  null = solo los totales del municipio.
 * @param corteId   null = calcular con los datos de hoy, sin guardar.
 */
export async function getReporteUnidad(opciones: {
  unidadId: string | null;
  corteId?: string;
  fechaCorte?: string;
}): Promise<ReporteUnidad> {
  // La puerta va acá y no en la pantalla. El detalle del corte se lee con el
  // cliente admin —hace falta para que el total del municipio sea el mismo
  // número para todos los lectores—, y eso saltea la RLS. Sin este control,
  // cualquier pantalla que consuma esta capa con `?u=<uuid>` dejaría que un
  // director pida el id de otra área y reciba sus proyectos.
  const { getPerfilActual, getScopeReporte } = await import("@/lib/auth");
  const perfil = await getPerfilActual();
  if (!perfil) throw new Error("No autenticado");

  // El alcance es el de LECTURA de reportes (solo hacia abajo), no el de carga.
  // Antes usaba `getScopeUnidades`, que al director le da también sus ancestros,
  // y por eso pasaba el control para el reporte de toda su secretaría (09.09,
  // párrafo 732). `getScopeReporte` ya resuelve solo el caso "ve todas", así que
  // acá no hace falta el atajo de `perfilVeTodo`.
  if (opciones.unidadId) {
    const scope = await getScopeReporte(perfil);
    if (!scope.includes(opciones.unidadId)) {
      throw new Error("No tenés acceso al reporte de esa área");
    }
  }

  const unidades = await getUnidadesParaReporte();
  const unidad = opciones.unidadId
    ? unidades.find((u) => u.id === opciones.unidadId) ?? null
    : null;
  if (opciones.unidadId && !unidad) throw new Error("Esa área no existe o está inactiva");

  const { filas, corte, origen } = await traerFilas(opciones);
  return armarReporte(filas, corte, origen, unidad, unidades);
}

/**
 * Arma el reporte a partir de las filas de una foto. PURO: no lee la base ni
 * pregunta permisos.
 *
 * Va separado de `getReporteUnidad` para poder verificarlo. La puerta de
 * permisos que esa función tiene —correcta y necesaria— usa `getPerfilActual()`,
 * que lee cookies y por lo tanto solo funciona dentro de un request: un script
 * de verificación no puede llamarla. Con el armado aparte se controla contra los
 * datos de producción que los cuadres cierren, que no haya filas fantasma y que
 * el árbol quede bien, sin sesión y sin escribir nada.
 */
export function armarReporte(
  filas: any[],
  corte: ReporteUnidad["corte"],
  origen: "corte" | "vivo",
  unidad: UnidadReporte | null,
  /** El organigrama, para resolver la ruta de un area que no tiene proyectos. */
  unidades: UnidadReporte[] = []
): ReporteUnidad {
  // ---- Totales del municipio ----
  const accMun = VACIO();
  const pctsMun: (number | null)[] = [];
  for (const f of filas) sumar(accMun, f, pctsMun);
  cerrar(accMun, pctsMun);

  if (!unidad) {
    return {
      origen,
      corte,
      unidad: null,
      totalUnidad: VACIO(),
      filas: [],
      proyectos: [],
      totalMunicipio: accMun,
      indiceCargaProvisorio: true,
      superior: null,
      ruta: { secretaria: null, subsecretaria: null },
    };
  }

  const propias = filasDeUnidad(filas, unidad);

  // ---- Totales de la unidad (bloque 2) ----
  const accU = VACIO();
  const pctsU: (number | null)[] = [];
  for (const f of propias) sumar(accU, f, pctsU);
  cerrar(accU, pctsU);

  // ---- El área de la que depende, para la comparación del informe de Dirección ----
  // Se toma de las mismas filas, que traen la jerarquía del día del corte: así un
  // informe viejo sigue diciendo lo mismo aunque después muevan el área de lugar.
  // Cuando el área no tiene ni un proyecto no hay fila de dónde sacarla, y ahí se
  // cae al organigrama de hoy — son 10 direcciones, que si no salían con el
  // encabezado en blanco y sin comparación.
  const unaPropia = propias[0];
  const porId = new Map(unidades.map((u) => [u.id, u]));
  const ancestros: UnidadReporte[] = [];
  let subiendo = unidad.parent_id ? porId.get(unidad.parent_id) : undefined;
  for (let i = 0; subiendo && i < 10; i++) {
    ancestros.push(subiendo);
    subiendo = subiendo.parent_id ? porId.get(subiendo.parent_id) : undefined;
  }
  const delArbol = (nivel: number) => ancestros.find((a) => a.nivel === nivel) ?? null;

  const ruta = {
    secretaria: (unaPropia?.secretaria_nombre ?? delArbol(0)?.nombre ?? null) as string | null,
    subsecretaria: (unaPropia?.subsecretaria_nombre ?? delArbol(1)?.nombre ?? null) as string | null,
  };

  // El conjunto inmediato con el que se compara: para un departamento —los cuatro
  // museos— su dirección; para una dirección, su subsecretaría, y si cuelga
  // directo de la secretaría, esa. Comparar un museo contra toda la subsecretaría
  // saltearía justo al que lo tiene a cargo.
  let superior: ReporteUnidad["superior"] = null;
  if (unidad.nivel >= 2) {
    const opciones: { id: string | null; nombre: string | null; rotulo: string; campo: string }[] =
      unidad.nivel >= 3
        ? [
            {
              id: unaPropia?.direccion_id ?? delArbol(2)?.id ?? null,
              nombre: unaPropia?.direccion_nombre ?? delArbol(2)?.nombre ?? null,
              rotulo: "Dirección",
              campo: "direccion_id",
            },
          ]
        : [];
    opciones.push(
      {
        id: unaPropia?.subsecretaria_id ?? delArbol(1)?.id ?? null,
        nombre: unaPropia?.subsecretaria_nombre ?? delArbol(1)?.nombre ?? null,
        rotulo: "Subsecretaría",
        campo: "subsecretaria_id",
      },
      {
        id: unaPropia?.secretaria_id ?? delArbol(0)?.id ?? null,
        nombre: unaPropia?.secretaria_nombre ?? delArbol(0)?.nombre ?? null,
        rotulo: "Secretaría",
        campo: "secretaria_id",
      }
    );

    const elegida = opciones.find((o) => o.id && o.nombre);
    if (elegida) {
      const delSuperior = filas.filter((f) => f[elegida.campo] === elegida.id);
      const accSup = VACIO();
      const pctsSup: (number | null)[] = [];
      for (const f of delSuperior) sumar(accSup, f, pctsSup);
      cerrar(accSup, pctsSup);
      superior = { nombre: elegida.nombre!, rotulo: elegida.rotulo, pct: accSup.pct };
    }
  }

  const base = {
    origen,
    corte,
    unidad: { id: unidad.id, nombre: unidad.nombre, nivel: unidad.nivel, tipo: unidad.tipo },
    totalUnidad: accU,
    totalMunicipio: accMun,
    indiceCargaProvisorio: true,
    superior,
    ruta,
  };

  // ---- La lista de proyectos ----
  // Desde el 15.09 se arma para TODOS los niveles, no solo de dirección para
  // abajo: el modelo nuevo de Secretarías y Subsecretarías pide un "Detalle de
  // proyectos" con la dirección responsable de cada uno, que es el cuadro de
  // respaldo de los indicadores consolidados del informe.
  const proyectos: FilaProyecto[] = propias
    .map((f) => ({
      nombre: f.proyecto_nombre as string,
      codigo: (f.proyecto_codigo ?? null) as string | null,
      unidad_nombre: (f.unidad_nombre ?? null) as string | null,
      estado: f.estado as FilaProyecto["estado"],
      pct: (f.pct ?? null) as number | null,
      metas: Number(f.metas ?? 0),
      metas_con_datos: Number(f.metas_con_datos ?? 0),
      indicadores: Number(f.indicadores ?? 0),
      indicadores_con_datos: Number(f.indicadores_con_datos ?? 0),
    }))
    // Primero lo que tiene datos y más avance, después por nombre: lo que hay
    // que mirar queda arriba.
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || a.nombre.localeCompare(b.nombre, "es"));

  // Para una dirección un árbol de unidades no dice nada: 55 de las 56 no
  // tienen sub-unidades, así que la tabla tendría una sola fila igual al total.
  if (unidad.nivel >= 2) {
    return { ...base, filas: [], proyectos };
  }

  // ---- Nivel 0 y 1: el árbol de la estructura ----
  type Nodo = { fila: FilaReporte; pcts: (number | null)[]; hijos: Map<string, Nodo> };
  const nuevoNodo = (tipo: TipoFila, nombre: string, unidad_id: string | null): Nodo => ({
    fila: { ...VACIO(), tipo, nombre, unidad_id, hijos: [] },
    pcts: [],
    hijos: new Map(),
  });

  const raiz = new Map<string, Nodo>();
  let propios: Nodo | null = null;

  for (const f of propias) {
    // La fila de "proyectos propios" solo aplica en el reporte de secretaría:
    // es la que pidió Planificación para los proyectos cargados en la
    // secretaría misma en vez de en una dirección (19 en Ambiente, 9 en
    // Contaduría). En el de subsecretaría no hay equivalente: no hay ni un
    // proyecto cargado a nivel 1.
    if (unidad.nivel === 0 && f.es_propio_de_secretaria) {
      propios ??= nuevoNodo(
        "propios_secretaria",
        "Proyectos propios de la Secretaría",
        unidad.id
      );
      sumar(propios.fila, f, propios.pcts);
      continue;
    }

    // El primer nivel de la tabla depende de qué unidad se reporta.
    //   secretaría    → su subsecretaría si la hay, si no la dirección
    //                   (6 de 10 secretarías no tienen ninguna subsecretaría,
    //                    así que la dirección directa es la mayoría)
    //   subsecretaría → la dirección
    const claveTope =
      unidad.nivel === 0
        ? f.subsecretaria_id ?? f.direccion_id ?? f.unidad_id ?? "sin-unidad"
        : f.direccion_id ?? f.unidad_id ?? "sin-unidad";
    const nombreTope =
      unidad.nivel === 0 && f.subsecretaria_id
        ? f.subsecretaria_nombre
        : f.direccion_nombre ?? f.unidad_nombre;
    const tipoTope: TipoFila =
      unidad.nivel === 0 && f.subsecretaria_id ? "subsecretaria" : "direccion";

    if (!raiz.has(claveTope)) raiz.set(claveTope, nuevoNodo(tipoTope, nombreTope, claveTope));
    const tope = raiz.get(claveTope)!;
    sumar(tope.fila, f, tope.pcts);

    // Segundo nivel: la dirección, solo cuando arriba hay una subsecretaría.
    let padre = tope;
    if (unidad.nivel === 0 && f.subsecretaria_id && f.direccion_id) {
      if (!padre.hijos.has(f.direccion_id)) {
        padre.hijos.set(
          f.direccion_id,
          nuevoNodo("direccion", f.direccion_nombre ?? f.unidad_nombre, f.direccion_id)
        );
      }
      const dir = padre.hijos.get(f.direccion_id)!;
      sumar(dir.fila, f, dir.pcts);
      padre = dir;
    }

    // Tercer nivel: el departamento, cuando el proyecto no está en la dirección
    // misma. El !== va contra el padre y no contra direccion_id: con
    // direccion_id en NULL la unidad ya es el tope y se estaría colgando de sí
    // misma, contándose dos veces.
    if (f.unidad_nivel === 3 && f.unidad_id && padre.fila.unidad_id !== f.unidad_id) {
      if (!padre.hijos.has(f.unidad_id)) {
        padre.hijos.set(f.unidad_id, nuevoNodo("departamento", f.unidad_nombre, f.unidad_id));
      }
      const dep = padre.hijos.get(f.unidad_id)!;
      sumar(dep.fila, f, dep.pcts);
    }
  }

  const materializar = (n: Nodo): FilaReporte => {
    cerrar(n.fila, n.pcts);
    n.fila.hijos = [...n.hijos.values()]
      .map(materializar)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return n.fila;
  };

  const filasTabla = [...raiz.values()]
    .map(materializar)
    .sort((a, b) => {
      // Las subsecretarías primero, después las direcciones directas, y dentro
      // de cada grupo por nombre. Es el orden de la plantilla.
      if (a.tipo !== b.tipo) return a.tipo === "subsecretaria" ? -1 : 1;
      return a.nombre.localeCompare(b.nombre, "es");
    });

  // La fila de proyectos propios va al final, antes del TOTAL, porque es un
  // agregado y no una parte de la estructura.
  if (propios) filasTabla.push(materializar(propios));

  return { ...base, filas: filasTabla, proyectos };
}
