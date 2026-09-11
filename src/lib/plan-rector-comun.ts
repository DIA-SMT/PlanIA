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
