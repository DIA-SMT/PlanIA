import type { EstadoSemaforo } from "@/types/database";

// -------------------------------------------------------
// Helpers de presentacion
// -------------------------------------------------------

// El estado "rojo" (No iniciado) usa el token `info`, que desde el 30.07 vuelve
// a valer rojo (ver globals.css). El 28.07 se había probado en celeste.
export function semaforoColor(estado: EstadoSemaforo): string {
  const map: Record<EstadoSemaforo, string> = {
    verde: "bg-success",
    amarillo: "bg-warning",
    rojo: "bg-info",
    gris: "bg-muted/40",
    sin_datos: "bg-primary/20",
  };
  return map[estado] ?? "bg-muted/20";
}

// Etiqueta semantica correcta:
// "sin_datos" NO es "Atrasado". Es "Pendiente" — aun no se cargo seguimiento.
export function semaforoLabel(estado: EstadoSemaforo): string {
  const map: Record<EstadoSemaforo, string> = {
    verde: "Finalizado",
    amarillo: "En ejecución",
    rojo: "No iniciado",
    gris: "Inactivo",
    sin_datos: "Sin datos",
  };
  return map[estado] ?? "Pendiente";
}

export function semaforoTextColor(estado: EstadoSemaforo): string {
  const map: Record<EstadoSemaforo, string> = {
    verde: "text-success",
    amarillo: "text-warning",
    rojo: "text-info",
    gris: "text-muted",
    sin_datos: "text-primary/70",
  };
  return map[estado] ?? "text-muted";
}

// ---------------------------------------------------------------------------
// Normalización para los motores de búsqueda (correcciones 28.07): la búsqueda
// no debe distinguir mayúsculas/minúsculas, ni tildes, ni el punto final y las
// comas. Se aplica tanto al término buscado como al texto donde se busca.
// ---------------------------------------------------------------------------
export function normalizarBusqueda(t: string | null | undefined): string {
  return (t ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // saca tildes y diéresis
    .toLowerCase()
    .replace(/[.,;:!?'"()[\]\-¡¿“”]/g, " ") // puntuación → espacio
    .replace(/\s+/g, " ")
    .trim();
}

// true si `texto` contiene el término buscado, ignorando caso, tildes y puntuación.
export function coincideBusqueda(
  texto: string | null | undefined,
  termino: string
): boolean {
  if (!termino) return true;
  return normalizarBusqueda(texto).includes(termino);
}

// Texto que en realidad representa "sin valor" (placeholders de importación:
// "-", "—", "N/A", "s/d", ".", vacío).
export function textoEsVacio(t: string | null | undefined): boolean {
  const s = (t ?? "").trim();
  return s === "" || /^(-+|—+|–+|n\/?a|s\/?d|\.)$/i.test(s);
}

// Texto que representa un cero ("0", "0%", "0,0").
export function textoEsCero(t: string): boolean {
  return /^0+([.,]0+)?$/.test(t.replace(/[%\s]/g, ""));
}

// Estado del semáforo para mostrar en la UI. La fuente de verdad es
// estado_semaforo (recalculado al cargar), pero acá se blindan las reglas del
// 16.07 por si quedara algún dato viejo desalineado:
//   * valor numérico → lo que tenga guardado (0 ya se guarda como rojo)
//   * texto "No" o "0" → No iniciado (rojo)
//   * sin valor cargado / placeholder → Sin datos (aunque tenga objetivo)
//   * resto → lo que tenga guardado
export function estadoVisualIndicador(ind: {
  estado_semaforo: EstadoSemaforo;
  valor_actual: number | null;
  valor_actual_texto: string | null;
}): EstadoSemaforo {
  if (ind.valor_actual != null) return ind.estado_semaforo;
  const s = (ind.valor_actual_texto ?? "").trim();
  if (textoEsVacio(s)) return "sin_datos";
  if (/^no$/i.test(s) || textoEsCero(s)) return "rojo";
  return ind.estado_semaforo;
}

export function formatFechaRelativa(fecha: string | null): string {
  if (!fecha) return "Sin fecha";
  const ahora = new Date();
  const target = new Date(fecha);
  const diffMs = ahora.getTime() - target.getTime();
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDias < 0) {
    const diasFaltan = Math.abs(diffDias);
    if (diasFaltan === 0) return "Hoy";
    if (diasFaltan === 1) return "Mañana";
    if (diasFaltan < 7) return `En ${diasFaltan} días`;
    if (diasFaltan < 30) return `En ${Math.floor(diasFaltan / 7)} sem.`;
    return `En ${Math.floor(diasFaltan / 30)} mes(es)`;
  }
  if (diffDias === 0) return "Hoy";
  if (diffDias === 1) return "Ayer";
  if (diffDias < 7) return `Hace ${diffDias} días`;
  if (diffDias < 30) return `Hace ${Math.floor(diffDias / 7)} sem.`;
  return `Hace ${Math.floor(diffDias / 30)} mes(es)`;
}

export function formatFecha(fecha: string | null): string {
  if (!fecha) return "—";
  return new Date(fecha).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function calcularPorcentajeMeta(meta: {
  tipo_medicion: string;
  valor_actual: number | null;
  valor_meta: number | null;
  valor_linea_base: number | null;
  nivel_actual: string | null;
  escala_cualitativa: { niveles: { clave: string; valor_numerico: number }[] } | null;
  metadata: Record<string, unknown>;
}): number | null {
  // Si no hay valor actual reportado, no hay porcentaje calculable
  if (meta.valor_actual == null && meta.nivel_actual == null) return null;

  if (meta.tipo_medicion === "cuantitativo") {
    if (meta.valor_meta == null || meta.valor_actual == null) return null;
    const base = meta.valor_linea_base ?? 0;
    const rango = meta.valor_meta - base;
    if (rango === 0) return meta.valor_actual >= meta.valor_meta ? 100 : 0;
    const invertida = meta.metadata?.invertida === true;
    if (invertida) {
      return Math.max(0, Math.min(100, Math.round(((base - meta.valor_actual) / (base - meta.valor_meta)) * 100)));
    }
    return Math.max(0, Math.min(100, Math.round(((meta.valor_actual - base) / rango) * 100)));
  }

  if (meta.tipo_medicion === "cualitativo" && meta.escala_cualitativa && meta.nivel_actual) {
    const nivel = meta.escala_cualitativa.niveles.find(
      (n) => n.clave === meta.nivel_actual
    );
    return nivel?.valor_numerico ?? null;
  }

  if (meta.tipo_medicion === "hito_unico") {
    return meta.valor_actual === 1 ? 100 : 0;
  }

  return null;
}

// Determina si un proyecto tiene algun avance cargado
export function proyectoTieneSeguimiento(metas: { ultima_actualizacion: string | null }[]): boolean {
  return metas.some((m) => m.ultima_actualizacion != null);
}

// Calcula el estado de un proyecto a partir de sus metas
export function calcularEstadoProyecto(metas: {
  estado_semaforo: EstadoSemaforo;
  ultima_actualizacion: string | null;
  tipo_medicion: string;
  valor_actual: number | null;
  valor_meta: number | null;
  valor_linea_base: number | null;
  nivel_actual: string | null;
  escala_cualitativa: { niveles: { clave: string; valor_numerico: number }[] } | null;
  metadata: Record<string, unknown>;
}[]): { porcentaje: number | null; estado: EstadoSemaforo; tieneSeguimiento: boolean } {
  if (metas.length === 0) return { porcentaje: null, estado: "sin_datos", tieneSeguimiento: false };

  const tieneSeguimiento = metas.some((m) => m.ultima_actualizacion != null);

  if (!tieneSeguimiento) {
    return { porcentaje: null, estado: "sin_datos", tieneSeguimiento: false };
  }

  const porcentajes = metas
    .map((m) => calcularPorcentajeMeta(m))
    .filter((p): p is number => p !== null);

  if (porcentajes.length === 0) return { porcentaje: 0, estado: "sin_datos", tieneSeguimiento };

  const avg = Math.round(porcentajes.reduce((a, b) => a + b, 0) / porcentajes.length);
  const rojas = metas.filter((m) => m.estado_semaforo === "rojo").length;

  let estado: EstadoSemaforo;
  if (rojas > 0) estado = "rojo";
  else if (avg >= 70) estado = "verde";
  else if (avg >= 40) estado = "amarillo";
  else estado = "rojo";

  return { porcentaje: avg, estado, tieneSeguimiento };
}

// Calcula el grado de avance de un proyecto a partir de SUS INDICADORES.
// Cada indicador aporta:
//   - numérico con objetivo: min(100, valor/objetivo*100)
//   - texto/cualitativo: según su estado_semaforo (verde=100, amarillo=50, rojo=10)
//   - sin datos: no cuenta
export function calcularAvancePorIndicadores(
  indicadores: {
    valor_actual: number | null;
    valor_objetivo: number | null;
    valor_actual_texto?: string | null;
    estado_semaforo: EstadoSemaforo;
  }[]
): { porcentaje: number | null; conDatos: number; total: number; estado: EstadoSemaforo } {
  const total = indicadores.length;
  if (total === 0) return { porcentaje: null, conDatos: 0, total: 0, estado: "sin_datos" };

  const porEstado = (e: EstadoSemaforo) =>
    e === "verde" ? 100 : e === "rojo" ? 10 : 50; // amarillo/sin_datos → 50 (en ejecución)

  let suma = 0;
  let cnt = 0;
  for (const i of indicadores) {
    if (i.valor_actual != null && i.valor_objetivo != null) {
      // Numérico con objetivo → porcentaje real
      const pct = i.valor_objetivo === 0
        ? (i.valor_actual >= i.valor_objetivo ? 100 : 0)
        : Math.max(0, Math.min(100, (i.valor_actual / i.valor_objetivo) * 100));
      suma += pct;
      cnt++;
    } else if (i.valor_actual != null) {
      // Numérico SIN objetivo cargado: igual cuenta como avance reportado
      suma += porEstado(i.estado_semaforo);
      cnt++;
    } else if (!textoEsVacio(i.valor_actual_texto)) {
      // Texto (Sí/No, Realizado) → según su semáforo. Los placeholders ("-",
      // "N/A", etc.) no cuentan como dato.
      suma += porEstado(i.estado_semaforo);
      cnt++;
    }
  }

  if (cnt === 0) return { porcentaje: null, conDatos: 0, total, estado: "sin_datos" };

  const avg = Math.round(suma / cnt);
  const estado: EstadoSemaforo = avg >= 70 ? "verde" : avg >= 40 ? "amarillo" : "rojo";
  return { porcentaje: avg, conDatos: cnt, total, estado };
}

// ---------------------------------------------------------------------------
// Cascada de avance: indicador → meta → proyecto → dirección (correcciones
// 16.07). El avance se propaga hacia arriba y se pondera contando TODOS los
// hijos (los que no tienen dato cuentan como 0 %), para que un solo hijo al
// 100 % no dispare el total al 100 %.
// ---------------------------------------------------------------------------

export type AvanceNivel = {
  pct: number | null; // 0-100, o null si ningún hijo tiene dato
  estado: EstadoSemaforo;
  conDatos: number; // hijos con dato cargado
  total: number; // total de hijos
};

// Estado (semáforo) derivado de un porcentaje de avance:
//   sin dato → "sin_datos"; 0 → No iniciado (rojo); 100 → Finalizado (verde);
//   intermedio → En ejecución (amarillo).
export function estadoDeAvance(pct: number | null): EstadoSemaforo {
  if (pct == null) return "sin_datos";
  if (pct >= 100) return "verde";
  if (pct <= 0) return "rojo";
  return "amarillo";
}

const porEstadoPct = (e: EstadoSemaforo): number =>
  e === "verde" ? 100 : e === "amarillo" ? 50 : 0;

// % de avance de UN indicador (0-100), o null si no tiene dato cargado.
export function avanceIndicador(ind: {
  valor_actual: number | null;
  valor_objetivo: number | null;
  valor_actual_texto?: string | null;
  estado_semaforo: EstadoSemaforo;
  metadata?: Record<string, unknown> | null;
}): number | null {
  const invertida = (ind.metadata as Record<string, unknown> | undefined)?.invertida === true;
  if (ind.valor_actual != null) {
    if (ind.valor_objetivo != null) {
      const base = 0;
      if (ind.valor_objetivo === base) return ind.valor_actual >= ind.valor_objetivo ? 100 : 0;
      const raw = invertida
        ? ((base - ind.valor_actual) / (base - ind.valor_objetivo)) * 100
        : (ind.valor_actual / ind.valor_objetivo) * 100;
      return Math.max(0, Math.min(100, Math.round(raw)));
    }
    // Numérico sin objetivo: 0 = No iniciado; resto según su estado.
    return ind.valor_actual === 0 && !invertida ? 0 : porEstadoPct(ind.estado_semaforo);
  }
  const texto = (ind.valor_actual_texto ?? "").trim();
  if (!textoEsVacio(texto)) {
    if (/^no$/i.test(texto) || textoEsCero(texto)) return 0;
    return porEstadoPct(ind.estado_semaforo);
  }
  return null; // sin dato
}

// Agrega los % de los hijos (contando todos; los null = 0 %). Si ninguno tiene
// dato → pct null (sin datos).
export function avanceAgregado(pcts: (number | null)[]): AvanceNivel {
  const total = pcts.length;
  const conDatos = pcts.filter((p) => p != null).length;
  if (total === 0 || conDatos === 0) {
    return { pct: null, estado: "sin_datos", conDatos, total };
  }
  const suma = pcts.reduce((a: number, p) => a + (p ?? 0), 0);
  const pct = Math.round(suma / total);
  return { pct, estado: estadoDeAvance(pct), conDatos, total };
}

// % de una meta: se deriva de sus indicadores. Si la meta no tiene indicadores,
// se usa su propio avance (metaPropioPct, calculado con calcularPorcentajeMeta).
export function avanceMeta(
  indicadores: Parameters<typeof avanceIndicador>[0][],
  metaPropioPct: number | null
): AvanceNivel {
  if (indicadores.length > 0) {
    return avanceAgregado(indicadores.map(avanceIndicador));
  }
  return {
    pct: metaPropioPct,
    estado: estadoDeAvance(metaPropioPct),
    conDatos: metaPropioPct != null ? 1 : 0,
    total: 0,
  };
}

// Avance global a partir de la CANTIDAD de proyectos por estado (no del avance
// individual de cada uno): finalizado = 100 %, en ejecución = 50 %, sobre el
// total de proyectos (los "sin datos" cuentan como 0 %). Devuelve null si el
// conjunto está vacío.
export function avanceGlobalPorEstado(dist: {
  verde: number;
  amarillo: number;
  rojo: number;
  sin_datos: number;
}): number | null {
  const total = dist.verde + dist.amarillo + dist.rojo + dist.sin_datos;
  if (total === 0) return null;
  return Math.round((dist.verde * 100 + dist.amarillo * 50) / total);
}

// ---------------------------------------------------------------------------
// Avance global (correcciones 28.07): se mide porcentualmente sumando los
// proyectos FINALIZADOS + los EN EJECUCIÓN sobre el total de proyectos del
// ámbito. No pondera por avance individual ni por peso de metas: es conteo.
// Los "no iniciados" y los "sin datos" quedan fuera del numerador: el 30.07 el
// anillo pasa a pintar solo la porción ejecutada y el resto queda en gris.
// ---------------------------------------------------------------------------

export type DistribucionEstados = {
  verde: number;
  amarillo: number;
  rojo: number;
  sin_datos: number;
};

export function totalDistribucion(d: DistribucionEstados): number {
  return d.verde + d.amarillo + d.rojo + d.sin_datos;
}

export function avanceGlobalPorConteo(d: DistribucionEstados): number | null {
  const total = totalDistribucion(d);
  if (total === 0) return null;
  return Math.round(((d.verde + d.amarillo) / total) * 100);
}

// Porcentaje que representa UN estado sobre el total del ámbito. Se usa cuando
// hay un filtro de estado aplicado: el anillo muestra solo ese color y el
// número del centro pasa a ser el porcentaje de ese color.
export function porcentajeDeEstado(
  d: DistribucionEstados,
  estado: keyof DistribucionEstados
): number | null {
  const total = totalDistribucion(d);
  if (total === 0) return null;
  return Math.round((d[estado] / total) * 100);
}

// ---------------------------------------------------------------------------
// Variable tiempo (correcciones 23.07): el avance considera el PLAZO.
// Regla "cumplió dentro del plazo":
//   * antes de fecha_inicio  → Programado (no cuenta aún)
//   * dentro del plazo       → avance normal según progreso
//   * venció y llegó al 100% → verde (cumplió)
//   * venció sin llegar      → rojo, aunque tenga avance parcial
// El "hoy" (YYYY-MM-DD) se calcula en el servidor y se pasa como argumento;
// no se materializa en BD porque el estado por plazo cambia día a día.
// ---------------------------------------------------------------------------

export type EstadoPlazo = "sin_plazo" | "programado" | "vigente" | "vencido";

// Comparación lexicográfica de fechas ISO "YYYY-MM-DD" (válida para ese formato).
/** Zona del municipio. Vercel corre en UTC y Tucumán es UTC-3. */
export const ZONA_MUNICIPIO = "America/Argentina/Tucuman";

/**
 * La fecha de HOY en Tucumán, en ISO (YYYY-MM-DD).
 *
 * Usar esto y no `new Date().toISOString().slice(0,10)`, que devuelve la fecha
 * UTC: entre las 21:00 y la medianoche de Tucumán el servidor ya está en el día
 * siguiente. Para el corte trimestral eso significaba que apretar "tomar la
 * foto" el 30 de septiembre a las 21:30 guardaba el cierre del tercer trimestre
 * fechado el 1 de octubre, o sea como cuarto trimestre.
 *
 * `en-CA` porque su formato corto ya es YYYY-MM-DD.
 */
export function hoyLocal(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_MUNICIPIO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function estadoPlazo(
  inicio: string | null | undefined,
  fin: string | null | undefined,
  hoy: string
): EstadoPlazo {
  if (!inicio && !fin) return "sin_plazo";
  if (inicio && hoy < inicio) return "programado";
  if (fin && hoy > fin) return "vencido";
  return "vigente";
}

type IndicadorConPlazo = Parameters<typeof avanceIndicador>[0] & {
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
};

// % del indicador para promediar considerando el plazo: null si aún no arrancó
// (Programado); si no, el avance real (que ya vale 100 cuando alcanzó objetivo).
export function avanceIndicadorEnPlazo(ind: IndicadorConPlazo, hoy: string): number | null {
  if (estadoPlazo(ind.fecha_inicio, ind.fecha_fin, hoy) === "programado") return null;
  return avanceIndicador(ind);
}

// Semáforo del indicador (badge) considerando el plazo.
// Correcciones 28.07: si el indicador ya está reportado como FINALIZADO, el
// vencimiento del plazo no lo degrada. Estamos en instancia de corrección y
// muchos finalizados se cargan tarde; no deben salir vencidos/no iniciados.
export function estadoIndicadorEnPlazo(
  ind: IndicadorConPlazo & { valor_actual_texto: string | null },
  hoy: string
): EstadoSemaforo {
  const plazo = estadoPlazo(ind.fecha_inicio, ind.fecha_fin, hoy);
  if (plazo === "programado") return "sin_datos"; // se muestra como "Programado"
  if (plazo === "vencido") {
    if (indicadorCumplido(ind)) return "verde";
    return "rojo"; // venció sin cumplir → rojo (regla 23.07)
  }
  return estadoVisualIndicador(ind); // vigente / sin_plazo → regla actual
}

// true si el indicador ya llegó a su objetivo (o fue marcado como finalizado).
// Se usa para no mostrar "Vencido" sobre algo que ya está cumplido.
export function indicadorCumplido(
  ind: IndicadorConPlazo & { valor_actual_texto?: string | null }
): boolean {
  if (ind.estado_semaforo === "verde") return true;
  const pct = avanceIndicador(ind);
  return pct != null && pct >= 100;
}

// Variante de avanceMeta que considera el plazo. Si la meta tiene indicadores,
// promedia sus avances plazo-aware. Si no, aplica la regla de plazo sobre el
// periodo de la propia meta ([fecha_inicio, fecha_limite]).
export function avanceMetaEnPlazo(
  indicadores: IndicadorConPlazo[],
  metaPropioPct: number | null,
  metaPlazo: { fecha_inicio: string | null; fecha_limite: string | null },
  hoy: string
): AvanceNivel {
  if (indicadores.length > 0) {
    return avanceAgregado(indicadores.map((i) => avanceIndicadorEnPlazo(i, hoy)));
  }
  const plazo = estadoPlazo(metaPlazo.fecha_inicio, metaPlazo.fecha_limite, hoy);
  if (plazo === "programado") {
    return { pct: null, estado: "sin_datos", conDatos: 0, total: 0 };
  }
  const conDatos = metaPropioPct != null ? 1 : 0;
  if (plazo === "vencido") {
    const cumplio = metaPropioPct != null && metaPropioPct >= 100;
    return { pct: metaPropioPct, estado: cumplio ? "verde" : "rojo", conDatos, total: 0 };
  }
  return { pct: metaPropioPct, estado: estadoDeAvance(metaPropioPct), conDatos, total: 0 };
}

// Avance global = promedio del grado de avance de las metas ponderado por su
// "valor particular" (meta.peso). Las metas sin peso pesan 1; las metas sin dato
// (pct null) no cuentan. Devuelve null si ninguna meta tiene dato. (Correcciones
// 23.07 pág. 18: el avance global se mide por las metas, no por cantidad de
// proyectos por estado.)
export function avanceGlobalPonderado(
  metas: { pct: number | null; peso: number | null }[]
): number | null {
  let sumaPond = 0;
  let sumaPesos = 0;
  for (const m of metas) {
    if (m.pct == null) continue;
    const peso = m.peso != null && m.peso > 0 ? m.peso : 1;
    sumaPond += m.pct * peso;
    sumaPesos += peso;
  }
  if (sumaPesos === 0) return null;
  return Math.round(sumaPond / sumaPesos);
}

// Devuelve el subárbol de unidades (raíz + descendientes) a partir de un id.
// Si rootId es null, devuelve todas. Útil para acotar filtros al área del usuario.
export function subtreeUnidades<T extends { id: string; parent_id: string | null }>(
  unidades: T[],
  rootId: string | null
): T[] {
  if (!rootId) return unidades;
  const hijos = (id: string): string[] => {
    const directos = unidades.filter((u) => u.parent_id === id).map((u) => u.id);
    return [id, ...directos.flatMap((d) => hijos(d))];
  };
  const ids = new Set(hijos(rootId));
  return unidades.filter((u) => ids.has(u.id));
}

/**
 * Cadena de unidades por ENCIMA de una: padre, abuelo, etc. No incluye la
 * propia. Espejo de `unidades_ancestras` (SQL).
 */
export function ancestrosUnidades<T extends { id: string; parent_id: string | null }>(
  unidades: T[],
  unidadId: string | null
): T[] {
  if (!unidadId) return [];
  const byId = new Map(unidades.map((u) => [u.id, u]));
  const out: T[] = [];
  const vistos = new Set<string>([unidadId]);
  let actual = byId.get(unidadId);
  // El `vistos` corta la vuelta si algún parent_id quedara ciclado.
  while (actual?.parent_id && !vistos.has(actual.parent_id)) {
    vistos.add(actual.parent_id);
    const padre = byId.get(actual.parent_id);
    if (!padre) break;
    out.push(padre);
    actual = padre;
  }
  return out;
}

/**
 * Unidades sobre las que el perfil puede cargar POA (proyectos, metas,
 * indicadores, avances). Espejo en TypeScript de `usuario_puede_cargar_unidad`
 * (SQL) — la RLS sigue siendo la que manda; esto es solo para no ofrecer en la
 * UI opciones que la base va a rechazar.
 *
 * El director carga en su unidad y en las de arriba (su subsecretaría si tiene,
 * y su secretaría), no en las direcciones hermanas. (26.08)
 *
 * Ojo: `intendenta` y `admin_tecnico` ven todo pero no cargan nada, igual que
 * en la función SQL. Para la agenda semanal la regla es otra: ver
 * `unidadesQueGestionaAgenda`.
 */
export function unidadesQuePuedeCargar<T extends { id: string; parent_id: string | null }>(
  perfil: { rol?: string | null; unidad_id?: string | null } | null | undefined,
  unidades: T[]
): T[] {
  if (!perfil) return [];
  // Copia, no el array de entrada: quien la reciba puede ordenarla in-place.
  if (perfil.rol === "admin_funcional") return [...unidades];
  if (!perfil.unidad_id) return [];
  if (perfil.rol === "director") {
    const propia = unidades.filter((u) => u.id === perfil.unidad_id);
    return [...propia, ...ancestrosUnidades(unidades, perfil.unidad_id)];
  }
  if (perfil.rol === "secretario" || perfil.rol === "subsecretario" || perfil.rol === "coordinador") {
    return subtreeUnidades(unidades, perfil.unidad_id);
  }
  return [];
}

/**
 * Unidades cuya AGENDA SEMANAL puede editar el perfil. Espejo de
 * `usuario_puede_gestionar_agenda_unidad` (SQL).
 *
 * Es la regla que valía para todo hasta el 26.08. Cuando se amplió el permiso
 * de carga del POA a los ancestros del director, la agenda quedó afuera a
 * propósito: un director no edita la agenda de su secretario.
 */
export function unidadesQueGestionaAgenda<T extends { id: string; parent_id: string | null }>(
  perfil: { rol?: string | null; unidad_id?: string | null } | null | undefined,
  unidades: T[]
): T[] {
  if (!perfil) return [];
  if (perfil.rol === "admin_funcional") return [...unidades];
  if (!perfil.unidad_id) return [];
  if (perfil.rol === "director") return unidades.filter((u) => u.id === perfil.unidad_id);
  if (perfil.rol === "secretario" || perfil.rol === "subsecretario" || perfil.rol === "coordinador") {
    return subtreeUnidades(unidades, perfil.unidad_id);
  }
  return [];
}

export function esRolGlobal(rol: string | null | undefined): boolean {
  return rol === "intendenta" || rol === "admin_funcional" || rol === "admin_tecnico" || rol == null;
}

/**
 * true si el perfil VE todas las unidades: por su rol, o porque tiene la marca
 * `acceso_global` (03.08 — el Secretario General ve todas las POAs sin dejar de
 * ser secretario de su área).
 *
 * Ojo: esto es solo VISIBILIDAD. Los permisos de carga siguen saliendo del rol
 * + su unidad (`getScopeUnidades` / `usuario_puede_cargar_unidad`), que a
 * propósito no miran esta marca.
 */
export function perfilVeTodo(
  perfil: { rol?: string | null; acceso_global?: boolean | null } | null | undefined
): boolean {
  if (!perfil) return esRolGlobal(null);
  return esRolGlobal(perfil.rol) || perfil.acceso_global === true;
}

// -------------------------------------------------------
// Teléfono de contacto (24.08)
// -------------------------------------------------------

/** Formato canónico E.164: '+' y entre 8 y 15 dígitos, el primero 1-9. */
const RE_E164 = /^\+[1-9]\d{7,14}$/;

export type TelefonoNormalizado =
  | { ok: true; valor: string | null }
  | { ok: false; error: string };

/**
 * Lleva un teléfono escrito a mano a E.164, el único formato que se guarda
 * (ver migración 041). Vacío => null, que es cómo se borra un teléfono.
 *
 * Se aceptan estas formas de entrada:
 *   +5493814123456   ya canónico
 *   005493814123456  prefijo internacional con 00
 *   5493814123456    con código de país pero sin '+'
 *   3814123456       local: área + abonado, sin 0 y sin 15
 *   03814123456      con el 0 de larga distancia
 *   0381154123456    con el 0 y el 15 de celular
 *
 * A propósito NO adivina más que eso. Un número mal normalizado manda una
 * alerta a la persona equivocada, así que ante la duda rebota y pide el
 * formato internacional en vez de arriesgar.
 *
 * El 9 de los celulares argentinos: en E.164 va +54 9 <área> <abonado>. Cuando
 * la entrada es local se asume celular (es el caso de uso: mandar mensajes), y
 * el 15 —que es la forma local de marcar un celular— se descarta porque en el
 * formato internacional lo reemplaza ese 9.
 */
export function normalizarTelefono(entrada: string | null | undefined): TelefonoNormalizado {
  const crudo = (entrada ?? "").trim();
  if (crudo === "") return { ok: true, valor: null };

  const ERROR =
    "Teléfono inválido. Escribilo como +5493814123456 o como 3814123456 (área + número).";

  // Se descarta todo lo que sea separador: espacios, guiones, puntos, paréntesis.
  const limpio = crudo.replace(/[\s().-]/g, "");
  if (!/^\+?\d+$/.test(limpio)) return { ok: false, error: ERROR };

  // Ya viene con código de país explícito.
  if (limpio.startsWith("+")) {
    return RE_E164.test(limpio) ? { ok: true, valor: limpio } : { ok: false, error: ERROR };
  }
  if (limpio.startsWith("00")) {
    const e164 = "+" + limpio.slice(2);
    return RE_E164.test(e164) ? { ok: true, valor: e164 } : { ok: false, error: ERROR };
  }

  let d = limpio;

  // 0 de larga distancia: en E.164 no va.
  if (d.startsWith("0")) d = d.slice(1);

  // 15 de celular: sobra en E.164, donde el celular lo marca el 9. El área
  // argentina tiene 2, 3 o 4 dígitos, así que el 15 puede caer en esas
  // posiciones; después de sacarlo tienen que quedar los 10 de área + abonado.
  if (d.length === 12) {
    const posiciones = [2, 3, 4].filter((i) => d.slice(i, i + 2) === "15");
    // Con más de un candidato no hay forma de saber cuál es el 15 real.
    if (posiciones.length === 1) {
      const i = posiciones[0];
      d = d.slice(0, i) + d.slice(i + 2);
    } else if (posiciones.length > 1) {
      return {
        ok: false,
        error: "No se puede interpretar ese número. Escribilo como +5493814123456.",
      };
    }
  }

  // Código de país ya presente, sin '+'.
  if (d.startsWith("54")) {
    const e164 = "+" + d;
    return RE_E164.test(e164) ? { ok: true, valor: e164 } : { ok: false, error: ERROR };
  }

  // Número local de 10 dígitos (área + abonado): se asume celular argentino.
  if (d.length === 10) {
    const e164 = "+549" + d;
    return RE_E164.test(e164) ? { ok: true, valor: e164 } : { ok: false, error: ERROR };
  }

  return { ok: false, error: ERROR };
}

/**
 * Para mostrar. Se muestra el E.164 tal cual: el largo del código de área
 * argentino (2, 3 o 4 dígitos) no se puede deducir del número, así que
 * cualquier agrupado que lo separe sería una invención y un número mal
 * espaciado se lee como un número equivocado.
 */
export function formatTelefono(telefono: string | null | undefined): string {
  return telefono?.trim() || "—";
}
