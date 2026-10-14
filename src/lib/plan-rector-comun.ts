/**
 * Plan Rector: tipos y helpers PUROS, compartidos por cliente y servidor.
 *
 * Va aparte de `plan-rector.ts` a propósito: ese módulo importa
 * `getSupabaseServer`, que usa `next/headers` y es solo de servidor. Si un
 * componente con "use client" importa de ahí —aunque sea solo un helper de
 * texto— el build lo arrastra al bundle del browser y falla.
 *
 * Regla: acá nada que toque la base, el request ni cookies.
 */

import { agruparPorArea } from "./aporte-por-area";

export type TipoNodoRector = "area_intervencion" | "eje" | "objetivo" | "linea";
export type EstadoVinculoRector = "propuesto" | "confirmado" | "rechazado";

export interface NodoRector {
  id: string;
  parent_id: string | null;
  tipo: TipoNodoRector;
  nivel: number;
  clave_estable: string;
  codigo_cliente: string | null;
  nombre: string;
  nombre_corto: string | null;
  orden: number;
  activa: boolean;
}

/** Un proyecto imputado, con su avance ya calculado. */
export interface ProyectoImputado {
  id: string;
  codigo: string | null;
  nombre: string;
  unidad_nombre: string | null;
  /**
   * Clave para ordenar siguiendo el organigrama: la ruta de la unidad desde la
   * secretaría hacia abajo.
   *
   * 15.09, párrafo 1011: "¿podrían ordenar la columna de la derecha de manera tal
   * que al mirar esté agrupado por área? [...] que no salte de la secretaría de
   * ambiente a centros vecinales si por ejemplo también está la dirección de
   * ambiente."
   *
   * Ordenar por el nombre del área no alcanza: alfabéticamente una dirección
   * queda lejos de su secretaría. Con la ruta completa, todo lo que cuelga de una
   * secretaría queda junto y en el orden del organigrama.
   */
  orden_area: string;
  pct: number | null;
  estado: "verde" | "amarillo" | "rojo" | "sin_datos";
}

export interface NodoRectorArbol extends NodoRector {
  hijos: NodoRectorArbol[];
  /** Solo en los ejes: los ODS que declara el documento. */
  ods: { numero: number; nombre: string }[];
  /** Proyectos imputados a ESTE nodo (no a sus hijos). */
  imputados: number;
  /** Proyectos imputados a este nodo o a cualquier descendiente. */
  imputadosSubarbol: number;
  /** Los proyectos imputados a ESTE nodo, para listarlos debajo (09.09, párrafo 694). */
  proyectos: ProyectoImputado[];
  /**
   * Avance del subárbol: promedio simple de los proyectos imputados a este nodo
   * y a sus descendientes.
   *
   * Se calcula para todos los nodos pero la pantalla lo MUESTRA solo en el
   * ámbito, que es lo que pidieron el 09.09 (párrafo 703): "que se realice la
   * medición en base a los ámbitos [...] pero no saquen las líneas
   * estratégicas, déjenlas escritas, solo no las miden".
   */
  pct: number | null;
  estado: "verde" | "amarillo" | "rojo" | "sin_datos";
}

/**
 * Los cinco ámbitos con el color que les puso Planificación.
 *
 * 09.09, párrafo 687: "agregar los colores correspondientes a cada ámbito del
 * plan rector (en el sheets del plan rector, cada ámbito esta con su color
 * correspondiente)". Estaban en `Cumplimiento Plan Rector.xlsx` como RELLENO de
 * celda, no como texto, y por eso no habían aparecido al leer los valores. Son
 * los cinco únicos rellenos de la planilla y cada uno pinta el bloque completo
 * de su ámbito, así que la correspondencia no tiene ambigüedad.
 *
 * Van por código y no por nombre: el nombre se corrige, el código no.
 */
export const COLOR_AMBITO: Record<string, string> = {
  A1: "#CC4125",
  A2: "#93C47D",
  A3: "#FFD966",
  A4: "#6FA8DC",
  A5: "#C27BA0",
};

export function colorAmbito(codigo: string | null): string | null {
  if (!codigo) return null;
  return COLOR_AMBITO[codigo.trim().toUpperCase()] ?? null;
}

/**
 * Una propuesta de imputación esperando confirmación, ya ubicada en su eje.
 *
 * Vive acá y no en plan-rector.ts porque la pantalla de revisión en lote es un
 * componente de cliente: importar el tipo desde el módulo de servidor arrastra
 * getSupabaseServer al bundle del browser y el build falla.
 */
export interface PropuestaPendiente {
  vinculo_id: string;
  proyecto_id: string;
  proyecto_codigo: string | null;
  proyecto_nombre: string;
  area: string | null;
  justificacion: string | null;
  /** El eje al que se propone imputarlo (subiendo desde el nodo si hace falta). */
  eje_id: string;
  eje_nombre: string;
  eje_codigo: string | null;
  ambito_codigo: string | null;
  ambito_nombre: string;
}

export interface ImputacionProyecto {
  id: string;
  nodo_id: string;
  estado: EstadoVinculoRector;
  principal: boolean;
  justificacion: string | null;
  confianza: number | null;
  created_at: string;
  /** Ruta legible: "A2 · Eje 4 · Limpieza y saneamiento…" */
  ruta: string;
}

export function recortar(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Rótulo breve para las rutas y los selectores.
 *
 * 09.09, párrafo 771: "en el selector, el nombre al lado del código, tanto en
 * Ámbito como en Eje". Antes el ámbito era solo "A1" y el eje solo "Eje 4": para
 * elegir había que saberse los códigos de memoria.
 */
export function rotuloCorto(n: {
  tipo: TipoNodoRector;
  codigo_cliente: string | null;
  nombre: string;
  nombre_corto: string | null;
}): string {
  const nombre = n.nombre_corto ?? n.nombre;
  if (n.tipo === "area_intervencion") {
    return n.codigo_cliente ? `${n.codigo_cliente} · ${recortar(nombre, 44)}` : recortar(nombre, 48);
  }
  if (n.tipo === "eje") {
    const num = n.codigo_cliente ? `Eje ${n.codigo_cliente}` : "Eje";
    return `${num} · ${recortar(nombre, 44)}`;
  }
  if (n.tipo === "objetivo") return n.codigo_cliente ? `Obj. ${n.codigo_cliente}` : "Objetivo";
  return recortar(n.nombre, 60);
}

/**
 * Etiquetas propias del Plan Rector. No se reusa `semaforoLabel`, que para
 * 'gris' devuelve "Inactivo": acá un nodo sin proyectos no está inactivo, le
 * falta imputación.
 */
export function rotuloCobertura(imputados: number): string {
  if (imputados === 0) return "Sin proyectos imputados";
  return imputados === 1 ? "1 proyecto imputado" : `${imputados} proyectos imputados`;
}

// ---------------------------------------------------------------------------
// La cuenta del Plan Rector
// ---------------------------------------------------------------------------

/**
 * El avance del Plan Rector de un conjunto de proyectos — 13.10.
 *
 * Planificación definió el texto del indicador: "Para el cálculo del indicador
 * se consideran únicamente los proyectos que cuentan con información de avance
 * registrada. Los proyectos sin datos cargados y los no iniciados no se
 * contabilizan en el promedio."
 *
 * Es el promedio del avance de los proyectos con avance registrado. Quedan
 * afuera los sin datos (pct null) y los no iniciados (pct 0: tienen carga y no
 * avanzaron).
 *
 * ES UNA CUENTA DISTINTA DE LA DEL PANEL Y EL INFORME, a propósito: ahí los no
 * iniciados entran como 0 %. Se decidió el 14.10 aplicarlo solo acá. Por eso,
 * para los mismos proyectos, el Plan Rector da más alto: con los datos del
 * 14.10, 68 % contra 55 % si contara los no iniciados, y A1 96 % contra 38 %
 * (de sus 5 proyectos con datos, 3 no arrancaron). Contra el Panel puede dar
 * más alto o más bajo, porque además mide solo los proyectos imputados.
 */
export function avancePlanRector(pcts: (number | null)[]): {
  pct: number | null;
  total: number;
  /** Los que entran en el promedio: con avance registrado. */
  evaluables: number;
  sinDatos: number;
  noIniciados: number;
} {
  const conDato = pcts.filter((p): p is number => p != null);
  const evaluables = conDato.filter((p) => p > 0);
  return {
    pct: evaluables.length === 0
      ? null
      : Math.round(evaluables.reduce((s, p) => s + p, 0) / evaluables.length),
    total: pcts.length,
    evaluables: evaluables.length,
    sinDatos: pcts.length - conDato.length,
    noIniciados: conDato.length - evaluables.length,
  };
}

export interface AporteAmbito {
  codigo: string | null;
  nombre: string;
  color: string | null;
  proyectos: number;
  evaluables: number;
  /** El avance propio del ámbito, con la cuenta del Plan Rector. */
  pct: number | null;
  /** Los puntos que pone en el avance total. Suman exactamente el total. */
  aporte: number | null;
}

/**
 * Cuánto aporta cada ámbito al avance del Plan Rector — 13.10.
 *
 * "Vamos cumpliendo un 80 % y cada ámbito aporta x." El total es el promedio
 * de los proyectos con avance registrado, así que se parte sin residuo: cada
 * proyecto pone su avance dividido por la cantidad de proyectos que entran en
 * la cuenta, y lo de un ámbito es su aporte. Es la misma partición que el
 * aporte de cada dirección en el informe (`agruparPorArea`), que también reparte
 * los puntos enteros por mayor resto para que sumen el total.
 *
 * Cada proyecto tiene que venir UNA vez. Hoy cada uno está en un solo ámbito
 * (medido el 14.10: 408 imputados, ninguno en dos); si alguna vez uno cuelga de
 * dos, quien llama lo pasa con uno solo, o los aportes dejarían de sumar el
 * total. La pantalla del Plan Rector y el informe ya lo hacen así.
 */
export function aportesPorAmbito(
  proyectos: { pct: number | null; ambito: { codigo: string | null; nombre: string } }[]
): { total: ReturnType<typeof avancePlanRector>; ambitos: AporteAmbito[] } {
  const total = avancePlanRector(proyectos.map((p) => p.pct));
  // Los no iniciados pasan como sin dato: así `agruparPorArea`, que promedia y
  // reparte sobre los que tienen dato, aplica la regla del Plan Rector.
  const clave = (a: { codigo: string | null; nombre: string }) =>
    `${a.codigo ?? "~"}\u0000${a.nombre}`;
  const grupos = agruparPorArea(
    proyectos.map((p, i) => ({
      nombre: String(i),
      unidad_nombre: clave(p.ambito),
      pct: p.pct != null && p.pct > 0 ? p.pct : null,
    })),
    total.pct
  );
  return {
    total,
    ambitos: grupos.map((g) => {
      const [codigo, nombre] = g.nombre.split("\u0000");
      const cod = codigo === "~" ? null : codigo;
      return {
        codigo: cod,
        nombre,
        color: colorAmbito(cod),
        proyectos: g.proyectos.length,
        evaluables: g.conDatos,
        pct: g.pct,
        aporte: g.aporte,
      };
    }),
  };
}
