/**
 * Proyectos prioritarios del POA 2027: tipos y helpers PUROS, compartidos por
 * cliente y servidor (misma regla que plan-rector-comun: nada de base acá).
 *
 * Corrección del 28.10, migración 059.
 */

/**
 * Las áreas que tienen el botón de Proyectos prioritarios, por código de
 * unidad. "Ese botón y la ficha que contiene debe estar SOLAMENTE en estas
 * direcciones"; las demás siguen con la ficha POA 2027 tal cual.
 *
 * "Obras públicas" y "movilidad urbana" no son direcciones en el organigrama:
 * son las secretarías (confirmado el 30.10).
 */
export const AREAS_CON_PRIORITARIOS: Record<string, string> = {
  DIR64: "Obras viales",
  DIR65: "Alumbrado",
  DIR51: "Limpieza urbana",
  SEC11: "Obras públicas",
  DIR50: "Arbolado",
  DIR49: "Espacios verdes",
  DIR62: "Transporte",
  DIR15: "Respuestas rápidas",
  DIR44: "Ambiente",
  DIR02: "Educación",
  SEC10: "Movilidad urbana",
  DIR06: "Asistencia pública",
  DIR01: "Salud",
  DIR08: "Casa Azul",
  DIR09: "Tartamudez",
  DIR42: "Familia",
  // 03.11: "necesitamos agregar las siguientes direcciones al apartado de
  // proyectos prioritarios". Falta "PPC": no hay ninguna área con ese nombre
  // en PlanIA y se está consultando cuál es.
  DIR05: "Población animal",
  DIR66: "Proyectos",
  DIR30: "COMM",
  DIR34: "Deportes",
  DIR16: "Gestión cultural",
  DIR17: "Museos",
  DIR22: "Turismo",
  DIR03: "Niñez y Juventud",
  DIR04: "Adultos mayores",
  DIR41: "Programas sociales",
};

export function tienePrioritarios(codigo: string | null | undefined): boolean {
  return !!codigo && codigo in AREAS_CON_PRIORITARIOS;
}

/** El horizonte del Plan Rector: automático en la ficha. */
export const HORIZONTE_PLAN_RECTOR = 2030;

/** Los años del historial de ejecución: la gestión, hasta el año anterior al POA. */
export const ANIOS_HISTORIAL = [2024, 2025, 2026];

/**
 * 04.11: "¿podrán agregar 2023? Tenemos algunos datos 2023. Que no condicione
 * si no pongo nada." Es anterior a la gestión: se carga como antecedente y no
 * suma al acumulado ni a la proyección del Plan Rector, que cuentan desde 2024.
 * Vacío no cambia nada.
 */
export const ANIOS_ANTECEDENTE = [2023];

/** Todos los años que se pueden cargar en el historial, en orden. */
export const ANIOS_CARGABLES = [...ANIOS_ANTECEDENTE, ...ANIOS_HISTORIAL];

export const PERIODICIDADES = ["Mensual", "Bimestral", "Trimestral", "Semestral", "Anual"];

/** valor null es "sin datos disponibles", que no es cero. */
export interface FilaHistorial {
  anio: number;
  valor: number | null;
}

/**
 * Una meta de la ficha — 04.11: "se debe poder cargar más de un indicador x
 * meta y más de una meta x proyecto". Los id sirven para editar o borrar sin
 * depender de la posición en la lista.
 */
export interface MetaPrioritario {
  id: string;
  valor: number | null;
  descripcion: string | null;
  indicadores: { id: string; texto: string }[];
}

export interface ProyectoPrioritario {
  id: string;
  unidad_id: string;
  anio: number;
  proyecto_id: string | null;
  nombre: string;
  diagnostico: string | null;
  unidad_medida: string | null;
  linea_base_total: number | null;
  linea_base_pendiente: number | null;
  linea_base_anio: number | null;
  linea_base_fuente: string | null;
  historial: FilaHistorial[];
  /** 04.11 (062): las metas del año, cada una con sus indicadores. */
  metas: MetaPrioritario[];
  /**
   * La primera meta: es la que usa el Plan Rector para proyectar. Sale de
   * `metas` al leer la ficha; la columna se mantiene igual al guardar.
   */
  meta_anual: number | null;
  enlace_territorial: string | null;
  presupuesto_area: number | null;
  presupuesto_proyecto: number | null;
  periodicidad: string | null;
  /** 30.10 (060): va en Seguimiento y evolución. */
  justificacion_tecnica: string | null;
  updated_at: string;
}

/**
 * Los campos que se editan uno por uno desde la ficha, y de qué tipo son.
 *
 * 30.10: "eliminar medio de verificación". Sale de la ficha y de esta lista;
 * la columna queda en la base con lo que se haya cargado.
 *
 * 04.11: la meta y el indicador salen de acá; se editan como lista de metas
 * (editarMetaPrioritario y compañía).
 */
export const CAMPOS_PRIORITARIO = {
  nombre: "texto",
  proyecto_id: "proyecto",
  diagnostico: "texto",
  unidad_medida: "texto",
  linea_base_total: "numero",
  linea_base_pendiente: "numero",
  linea_base_anio: "anio",
  linea_base_fuente: "texto",
  enlace_territorial: "enlace",
  presupuesto_area: "numero",
  presupuesto_proyecto: "numero",
  periodicidad: "periodicidad",
  justificacion_tecnica: "texto",
} as const;

export type CampoPrioritario = keyof typeof CAMPOS_PRIORITARIO;

/**
 * Los años del historial con su acumulado. El acumulado se corta en el primer
 * año sin datos: sumar de ahí en adelante sería contar ese año como cero.
 */
export function historialConAcumulado(
  historial: FilaHistorial[]
): { anio: number; valor: number | null; acumulado: number | null }[] {
  let acumulado: number | null = 0;
  return ANIOS_HISTORIAL.map((anio) => {
    const valor = historial.find((h) => h.anio === anio)?.valor ?? null;
    acumulado = acumulado === null || valor === null ? null : acumulado + valor;
    return { anio, valor, acumulado };
  });
}

/** 04.11: los años de antecedente (2023), con su valor y sin acumulado. */
export function historialAntecedente(historial: FilaHistorial[]): { anio: number; valor: number | null }[] {
  return ANIOS_ANTECEDENTE.map((anio) => ({
    anio,
    valor: historial.find((h) => h.anio === anio)?.valor ?? null,
  }));
}

/** El año en que arranca la gestión: el historial y la meta acumulada se cuentan desde acá. */
export const INICIO_GESTION = 2024;

/**
 * "Ver avance del proyecto" en el Plan Rector — corrección del 28.10, punto 3.
 *
 * "El plan rector dice que debemos reparar calles. Tenemos 500 cuadras para
 * reparar, hasta 2030 se deberían reparar x cantidad y a nosotros nos
 * corresponde reparar hasta 2027 (ahí termina el mandato) x cantidad. A su vez,
 * nuestra capacidad operativa es X, por lo tanto nuestra META PLAN RECTOR para
 * 2027 es x."
 *
 * Todo sale de la ficha del proyecto prioritario, con las cuentas del modelo
 * (800 pendientes, 240 ejecutadas, meta 60):
 *   objetivo al 2030      = la línea de base pendiente                     800
 *   objetivo al 2027      = la parte proporcional: 4 de los 6 años
 *                           del plan (2024 a 2030)                         533 (66,7 %)
 *   capacidad operativa   = lo ejecutado hasta 2026 + la meta 2027         300 (37,5 %)
 *   brecha                = objetivo al 2027 − capacidad                   233 (29,2 puntos)
 *   brecha pendiente      = objetivo al 2030 − capacidad                   500
 *
 * Lo que no se puede calcular queda en null y la pantalla dice qué falta: un
 * año sin datos no se cuenta como cero.
 */
export interface ProyeccionPrioritario {
  id: string;
  /** El año del POA: la meta es de este año y lo ejecutado llega hasta el anterior. */
  anio: number;
  nombre: string;
  unidad: string;
  objetivo: number | null;
  ejecutado: number | null;
  pendientes: number | null;
  /** La parte del objetivo que corresponde a la gestión, de 0 a 1. */
  fraccion: number;
  objetivo2027: number | null;
  saldo2030: number | null;
  meta: number | null;
  capacidad: number | null;
  brecha: number | null;
  brechaPendiente: number | null;
}

export function proyeccionPrioritario(f: ProyectoPrioritario, anio: number): ProyeccionPrioritario {
  const fraccion = (anio - INICIO_GESTION + 1) / (HORIZONTE_PLAN_RECTOR - INICIO_GESTION);
  const objetivo = f.linea_base_pendiente;
  const historial = historialConAcumulado(f.historial);
  const ejecutado = historial[historial.length - 1]?.acumulado ?? null;
  const objetivo2027 = objetivo === null ? null : Math.round(objetivo * fraccion);
  const capacidad = ejecutado === null || f.meta_anual === null ? null : ejecutado + f.meta_anual;
  return {
    id: f.id,
    anio,
    nombre: f.nombre,
    unidad: f.unidad_medida?.trim() ?? "",
    objetivo,
    ejecutado,
    pendientes: objetivo === null || ejecutado === null ? null : Math.max(objetivo - ejecutado, 0),
    fraccion,
    objetivo2027,
    saldo2030: objetivo === null || objetivo2027 === null ? null : objetivo - objetivo2027,
    meta: f.meta_anual,
    capacidad,
    brecha: objetivo2027 === null || capacidad === null ? null : objetivo2027 - capacidad,
    brechaPendiente: objetivo === null || capacidad === null ? null : Math.max(objetivo - capacidad, 0),
  };
}

/** Un porcentaje con un decimal, como en el modelo: "66,7 %". */
export function porcentajeArg(parte: number, total: number): string {
  if (!total) return "—";
  return `${((parte / total) * 100).toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

/** Un número como lo escribe alguien en Argentina: "3.000", "1.250,5". */
export function numeroArg(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

/**
 * Lee un número escrito a mano. Acepta "3.000", "3000", "1.250,5" y "$ 12.000".
 *
 * 30.10: "debería poder no completarse las líneas de base porque no en todos
 * los casos tenemos esa info". Vacío ya se podía; lo que trababa era escribir
 * "-" para decir que no hay dato, que daba error. Un guion, "s/d" o "sin
 * datos" cuentan como vacío.
 */
const SIN_DATO = /^(-+|—|–|s\/d|sd|sin\s*datos?|n\/a|no)$/i;

export function leerNumero(texto: string): number | null | "invalido" {
  if (SIN_DATO.test(texto.trim())) return null;
  const limpio = texto.replace(/[$\s]/g, "");
  if (!limpio) return null;
  // Con coma: la coma es el decimal y los puntos, miles. Sin coma, los puntos
  // seguidos de tres cifras son miles ("3.000"); si no, es un decimal ("2.5").
  const normal = limpio.includes(",")
    ? limpio.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(limpio)
      ? limpio.replace(/\./g, "")
      : limpio;
  const n = Number(normal);
  return Number.isFinite(n) && n >= 0 ? n : "invalido";
}

/** Solo enlaces web: es lo que se convierte en QR y se abre desde la ficha. */
export function esEnlaceWeb(texto: string | null | undefined): boolean {
  if (!texto) return false;
  try {
    const u = new URL(texto);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** Lee la lista de metas tal como viene de la base, sin confiar en su forma. */
export function leerMetas(raw: unknown): MetaPrioritario[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .map((m) => {
      const valor = m.valor === null || m.valor === undefined || m.valor === "" ? null : Number(m.valor);
      return {
        id: String(m.id ?? ""),
        valor: valor !== null && Number.isFinite(valor) ? valor : null,
        descripcion: typeof m.descripcion === "string" && m.descripcion.trim() ? m.descripcion : null,
        indicadores: Array.isArray(m.indicadores)
          ? (m.indicadores as Record<string, unknown>[])
              .filter((i) => !!i && typeof i === "object")
              .map((i) => ({ id: String(i.id ?? ""), texto: String(i.texto ?? "") }))
          : [],
      };
    })
    .filter((m) => m.id);
}
