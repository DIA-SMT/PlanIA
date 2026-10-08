import { promedioDeProyectos } from "@/lib/utils";

/**
 * Los proyectos del informe agrupados por área, con lo que aporta cada una al
 * avance total — 06.10.
 *
 * "En los reportes podríamos por favor ordenar los proyectos del punto 3 por
 * área? [...] que el secretario al recorrer con el ojo la columna Dirección
 * responsable vea todo lo de una misma dirección seguido". Y en el mismo
 * mensaje: "no sabemos de qué manera podríamos mostrar cuánto aporta cada
 * dirección al total de avance de la secretaría. Quizás debajo de cada área".
 *
 * QUÉ ES EL APORTE. El avance del área es el promedio de sus proyectos con
 * datos (`promedioDeProyectos`). Ese promedio se puede partir sin residuo: cada
 * proyecto pone su avance dividido por la cantidad de proyectos con datos de
 * TODA el área que reporta, y lo que ponen los de una dirección es su aporte.
 * Los aportes de todas las direcciones suman exactamente el avance del punto 1.
 *
 *   Secretaría con 4 proyectos con datos: A 100 % y 60 %, B 40 % y 0 %.
 *   Avance: (100 + 60 + 40 + 0) / 4 = 50 %.
 *   A aporta (100 + 60) / 4 = 40 puntos; B aporta (40 + 0) / 4 = 10. Suman 50.
 *
 * Un proyecto sin datos no aporta ni resta: no entra en el promedio ("es como
 * si no existieran", 05.10).
 *
 * LOS PUNTOS VAN ENTEROS Y SUMAN EL TOTAL. Redondear cada aporte por su lado
 * puede dar 59 cuando el total dice 60, y este informe ya se discutió por un
 * número que no cerraba. Se reparten con el método del mayor resto: cada área
 * recibe la parte entera de su aporte y los puntos que faltan para llegar al
 * total van a las de mayor parte decimal. Ninguno se aleja más de un punto de
 * su valor exacto.
 */

export interface ProyectoConArea {
  nombre: string;
  unidad_nombre: string | null;
  pct: number | null;
}

export interface GrupoDeArea<P extends ProyectoConArea> {
  nombre: string;
  proyectos: P[];
  /** El avance propio del área: el promedio de sus proyectos con datos. */
  pct: number | null;
  conDatos: number;
  /** Los puntos que pone en el avance total. null si el total no tiene datos. */
  aporte: number | null;
}

const SIN_AREA = "Sin dirección asignada";

export function agruparPorArea<P extends ProyectoConArea>(
  proyectos: P[],
  /** El avance total del área que reporta, ya redondeado: el del punto 1. */
  total: number | null
): GrupoDeArea<P>[] {
  const porNombre = new Map<string, P[]>();
  for (const p of proyectos) {
    const nombre = p.unidad_nombre?.trim() || SIN_AREA;
    if (!porNombre.has(nombre)) porNombre.set(nombre, []);
    porNombre.get(nombre)!.push(p);
  }

  const conDatosTotal = proyectos.filter((p) => p.pct != null).length;

  const grupos = [...porNombre.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "es"))
    .map(([nombre, lista]) => {
      const prom = promedioDeProyectos(lista.map((p) => p.pct));
      const suma = lista.reduce((s, p) => s + (p.pct ?? 0), 0);
      return {
        nombre,
        proyectos: lista,
        pct: prom.pct,
        conDatos: prom.conDatos,
        exacto: conDatosTotal === 0 ? 0 : suma / conDatosTotal,
      };
    });

  const sinExacto = (g: (typeof grupos)[number], aporte: number | null): GrupoDeArea<P> => ({
    nombre: g.nombre,
    proyectos: g.proyectos,
    pct: g.pct,
    conDatos: g.conDatos,
    aporte,
  });

  if (total == null || conDatosTotal === 0) return grupos.map((g) => sinExacto(g, null));

  // Mayor resto: los enteros primero, y lo que falta para el total a las de
  // mayor parte decimal.
  const enteros = grupos.map((g) => Math.floor(g.exacto));
  let faltan = total - enteros.reduce((s, n) => s + n, 0);
  const porResto = grupos
    .map((g, i) => ({ i, resto: g.exacto - enteros[i] }))
    .sort((a, b) => b.resto - a.resto);
  for (const { i } of porResto) {
    if (faltan <= 0) break;
    enteros[i]++;
    faltan--;
  }

  return grupos.map((g, i) => sinExacto(g, enteros[i]));
}
