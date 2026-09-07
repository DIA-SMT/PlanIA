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
}

export type TipoFila = "subsecretaria" | "direccion" | "departamento" | "propios_secretaria";

export interface FilaReporte extends ConteoEstados {
  tipo: TipoFila;
  nombre: string;
  unidad_id: string | null;
  hijos: FilaReporte[];
}

export interface ReporteSecretaria {
  origen: "corte" | "vivo";
  /** Datos del corte, cuando el origen es 'corte'. */
  corte: {
    id: string;
    anio: number;
    trimestre: number;
    fecha_corte: string;
    tomado_at: string;
  } | null;
  secretaria: { id: string; nombre: string } | null;
  /** Bloque 2 de la plantilla: el estado general de la secretaría. */
  totalSecretaria: ConteoEstados;
  /** Bloque 4: las filas de la tabla, anidadas. */
  filas: FilaReporte[];
  /** Totales del municipio, para el bloque 1. */
  totalMunicipio: ConteoEstados;
  /** true mientras el cliente no defina el Índice de Carga. */
  indiceCargaProvisorio: boolean;
}

const VACIO = (): ConteoEstados => ({
  proyectos: 0, finalizados: 0, en_ejecucion: 0, no_iniciados: 0, sin_datos: 0,
  pct: null, indice_carga: null,
});

/** Acumula una fila de la foto en un conteo, y junta los pct para promediar. */
function sumar(acc: ConteoEstados, fila: any, pcts: (number | null)[]) {
  acc.proyectos++;
  if (fila.estado === "verde") acc.finalizados++;
  else if (fila.estado === "amarillo") acc.en_ejecucion++;
  else if (fila.estado === "rojo") acc.no_iniciados++;
  else acc.sin_datos++;
  pcts.push(fila.pct ?? null);
}

/**
 * Cierra un conteo: promedio de avance e índice de carga.
 *
 * El promedio usa el mismo criterio que `avanceAgregado` en todo el sistema:
 * los proyectos sin dato cuentan como 0 en el numerador pero siguen en el
 * denominador, y si NINGUNO tiene dato el resultado es null (no 0). Es la
 * diferencia entre "no avanzaron" y "no cargaron", que en un informe que va
 * firmado a un secretario no es un detalle.
 */
function cerrar(acc: ConteoEstados, pcts: (number | null)[]): ConteoEstados {
  const conDatos = pcts.filter((p) => p != null).length;
  acc.pct = conDatos === 0 || pcts.length === 0
    ? null
    : Math.round(pcts.reduce<number>((a, p) => a + (p ?? 0), 0) / pcts.length);
  acc.indice_carga = acc.proyectos === 0
    ? null
    : Math.round(((acc.proyectos - acc.sin_datos) / acc.proyectos) * 100);
  return acc;
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
    .select("id, anio, trimestre, fecha_corte, origen, tomado_at, proyectos")
    .order("fecha_corte", { ascending: false })
    .limit(24);
  if (error) throw error;
  return data ?? [];
}

/** Secretarías (nivel 0) activas, para el selector. */
export async function getSecretarias() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("unidad_organizacional")
    .select("id, nombre, nombre_corto, codigo")
    .eq("nivel", 0)
    .eq("activa", true)
    .order("orden");
  if (error) throw error;
  return (data ?? []).map((u: any) => ({
    id: u.id,
    nombre: u.nombre_corto ?? u.nombre,
    nombre_largo: u.nombre,
    codigo: u.codigo,
  }));
}

/** Trae las filas de la foto: de un corte guardado, o calculadas al vuelo. */
async function traerFilas(opciones: {
  corteId?: string;
  fechaCorte?: string;
}): Promise<{ filas: any[]; corte: ReporteSecretaria["corte"]; origen: "corte" | "vivo" }> {
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
  // totales cierran igual entre si porque salen de las mismas filas: nada la
  // delata. Mejor no servirla.  la agrega la 046; si no existe la
  // columna, viene undefined y no se bloquea nada.
  const c = cab as any;
  if (c.completo === false) {
    throw new Error(
      `La foto del ${c.fecha_corte} quedó incompleta (se escribieron algunas de ` +
      `las ${c.proyectos} filas). Volvé a tomarla antes de emitir el reporte.`
    );
  }

  // Paginado: son 441 filas hoy y PostgREST corta en 1000, pero el POA crece.
  const filas: any[] = [];
  const TAM = 1000;
  for (let desde = 0; ; desde += TAM) {
    const { data, error } = await sb
      .from("corte_trimestral_proyecto")
      .select(
        "proyecto_nombre, unidad_id, unidad_nombre, unidad_nivel, secretaria_id, secretaria_nombre, " +
          "subsecretaria_id, subsecretaria_nombre, direccion_id, direccion_nombre, " +
          "es_propio_de_secretaria, estado, pct, metas, metas_con_datos, indicadores, indicadores_con_datos"
      )
      .eq("corte_id", opciones.corteId)
      // Sin orden estable, dos paginas con OFFSET distinto pueden repetir o
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
 * El reporte de una secretaría.
 *
 * @param secretariaId  null = solo los totales del municipio (bloque 1).
 * @param corteId       null = calcular con los datos de hoy, sin guardar.
 */
export async function getReporteSecretaria(opciones: {
  secretariaId: string | null;
  corteId?: string;
  fechaCorte?: string;
}): Promise<ReporteSecretaria> {
  // La puerta va acá y no en la pantalla. El detalle del corte se lee con el
  // cliente admin —hace falta para que el total del municipio sea el mismo
  // número para todos los lectores—, y eso saltea la RLS. Sin este control, la
  // pantalla del reporte con el patrón habitual del repo (?sec=<uuid>) dejaría
  // que un director pida el id de otra secretaría y reciba los nombres, estados
  // y avances de sus proyectos.
  const { getPerfilActual, getScopeUnidades } = await import("@/lib/auth");
  const { perfilVeTodo } = await import("@/lib/utils");
  const perfil = await getPerfilActual();
  if (!perfil) throw new Error("No autenticado");

  if (opciones.secretariaId && !perfilVeTodo(perfil)) {
    const scope = await getScopeUnidades(perfil);
    if (!scope.includes(opciones.secretariaId)) {
      throw new Error("No tenés acceso al reporte de esa secretaría");
    }
  }

  const { filas, corte, origen } = await traerFilas(opciones);

  // ---- Totales del municipio (bloque 1) ----
  const accMun = VACIO();
  const pctsMun: (number | null)[] = [];
  for (const f of filas) sumar(accMun, f, pctsMun);
  cerrar(accMun, pctsMun);

  if (!opciones.secretariaId) {
    return {
      origen, corte, secretaria: null,
      totalSecretaria: VACIO(),
      filas: [],
      totalMunicipio: accMun,
      indiceCargaProvisorio: true,
    };
  }

  const deLaSec = filas.filter((f) => f.secretaria_id === opciones.secretariaId);

  // El nombre sale de la unidad, no de la primera fila del detalle. Antes, una
  // secretaría sin proyectos —Movilidad Urbana tiene 0— quedaba encabezada con
  // el literal "(secretaría sin proyectos en este corte)", o sea un mensaje de
  // estado metido en el campo de identidad de un documento oficial. El vacío se
  // comunica con la tabla vacía y el cartel, no con el nombre.
  let nombreSec = deLaSec[0]?.secretaria_nombre ?? null;
  if (!nombreSec) {
    const todas = await getSecretarias();
    nombreSec = todas.find((s) => s.id === opciones.secretariaId)?.nombre ?? null;
  }

  // ---- Totales de la secretaría (bloque 2) ----
  const accSec = VACIO();
  const pctsSec: (number | null)[] = [];
  for (const f of deLaSec) sumar(accSec, f, pctsSec);
  cerrar(accSec, pctsSec);

  // ---- La tabla (bloque 4) ----
  // Estructura: subsecretaría > dirección > departamento, más una fila aparte
  // para los proyectos cargados en la secretaría misma. 6 de las 10
  // secretarías no tienen ninguna subsecretaría, así que el caso "dirección
  // directa" no es la excepción sino la mayoría: las direcciones sin
  // subsecretaría van al primer nivel de la tabla.
  type Nodo = { fila: FilaReporte; pcts: (number | null)[]; hijos: Map<string, Nodo> };
  const nuevoNodo = (tipo: TipoFila, nombre: string, unidad_id: string | null): Nodo => ({
    fila: { ...VACIO(), tipo, nombre, unidad_id, hijos: [] },
    pcts: [],
    hijos: new Map(),
  });

  const raiz = new Map<string, Nodo>();
  let propios: Nodo | null = null;

  for (const f of deLaSec) {
    if (f.es_propio_de_secretaria) {
      propios ??= nuevoNodo("propios_secretaria", "Proyectos propios de la Secretaría", f.secretaria_id);
      sumar(propios.fila, f, propios.pcts);
      continue;
    }

    // Nivel 1 de la tabla: la subsecretaría si la hay, si no la dirección.
    const claveTope = f.subsecretaria_id ?? f.direccion_id ?? f.unidad_id ?? "sin-unidad";
    const nombreTope = f.subsecretaria_id
      ? f.subsecretaria_nombre
      : f.direccion_nombre ?? f.unidad_nombre;
    const tipoTope: TipoFila = f.subsecretaria_id ? "subsecretaria" : "direccion";

    if (!raiz.has(claveTope)) raiz.set(claveTope, nuevoNodo(tipoTope, nombreTope, claveTope));
    const tope = raiz.get(claveTope)!;
    sumar(tope.fila, f, tope.pcts);

    // Nivel 2: la dirección, solo si arriba hay una subsecretaría.
    let padre = tope;
    if (f.subsecretaria_id && f.direccion_id) {
      if (!padre.hijos.has(f.direccion_id)) {
        padre.hijos.set(f.direccion_id, nuevoNodo("direccion", f.direccion_nombre ?? f.unidad_nombre, f.direccion_id));
      }
      const dir = padre.hijos.get(f.direccion_id)!;
      sumar(dir.fila, f, dir.pcts);
      padre = dir;
    }

    // Nivel 3: el departamento, cuando el proyecto no está en la dirección
    // misma. Son 9 proyectos en 4 museos, todos bajo Dirección de Museos.
    // El !== contra el padre y no contra direccion_id: con direccion_id en
    // NULL (foto vieja, o 046 sin aplicar) la unidad ya es el tope y se estaria
    // colgando de si misma, contandose dos veces.
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

  return {
    origen,
    corte,
    secretaria: opciones.secretariaId
      ? { id: opciones.secretariaId, nombre: nombreSec ?? "Secretaría" }
      : null,
    totalSecretaria: accSec,
    filas: filasTabla,
    totalMunicipio: accMun,
    indiceCargaProvisorio: true,
  };
}
