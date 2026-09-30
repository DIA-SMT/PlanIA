import { sumarDias, lunesIso } from "@/lib/queries";
import { coincideBusqueda, normalizarBusqueda } from "@/lib/utils";
import type { Actividad, VistaAgenda } from "@/lib/agenda-geo-comun";
import type { UnidadOrganizacional } from "@/types/database";

/**
 * El período y los filtros de la Agenda Georreferenciada, compartidos por la
 * agenda y el mapa.
 *
 * El pedido del 22.09 dice que el mapa lleva "los mismos filtros que la
 * agenda". La forma de que sigan siendo los mismos dentro de seis meses es que
 * sean el mismo código y no dos copias que empiezan iguales.
 *
 * Importa de `queries.ts`, que habla con la base: esto es solo para pantallas
 * de servidor. Lo que necesitan los componentes de cliente —el tipo
 * `VistaAgenda`, los tipos, los estados, los colores— está en
 * `agenda-geo-comun.ts`.
 */

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export const esIso = (s: string | undefined): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export const esVista = (s: string | undefined): VistaAgenda =>
  s === "semana" || s === "dia" ? s : "mes";

export interface Periodo {
  desde: string;
  hasta: string;
  /** Todos los días del período, en orden. */
  dias: string[];
  titulo: string;
  anterior: string;
  siguiente: string;
  /** Mes 0-11 de la fecha de referencia; en vista mes los otros se atenúan. */
  mesReferencia: number;
}

/** El rango de días que muestra cada vista, con su título y su navegación. */
export function rangoDeVista(vista: VistaAgenda, fecha: string): Periodo {
  const mesReferencia = Number(fecha.slice(5, 7)) - 1;
  let desde: string;
  let hasta: string;
  let titulo: string;
  let anterior: string;
  let siguiente: string;

  if (vista === "dia") {
    desde = fecha;
    hasta = fecha;
    anterior = sumarDias(fecha, -1);
    siguiente = sumarDias(fecha, 1);
    titulo = new Date(fecha + "T00:00:00").toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } else if (vista === "semana") {
    desde = lunesIso(fecha);
    hasta = sumarDias(desde, 6);
    anterior = sumarDias(desde, -7);
    siguiente = sumarDias(desde, 7);
    titulo = `${Number(desde.slice(8, 10))} – ${Number(hasta.slice(8, 10))} de ${
      MESES[Number(hasta.slice(5, 7)) - 1]
    } ${hasta.slice(0, 4)}`;
  } else {
    const primero = `${fecha.slice(0, 7)}-01`;
    const diasDelMes = new Date(
      Number(fecha.slice(0, 4)),
      Number(fecha.slice(5, 7)),
      0
    ).getDate();
    const ultimo = `${fecha.slice(0, 7)}-${String(diasDelMes).padStart(2, "0")}`;
    desde = lunesIso(primero); // la grilla arranca el lunes de la 1ª semana
    hasta = sumarDias(lunesIso(ultimo), 6); // y termina el domingo de la última
    anterior = sumarDias(primero, -1);
    siguiente = sumarDias(ultimo, 1);
    titulo = `${MESES[mesReferencia]} ${fecha.slice(0, 4)}`;
  }

  const dias: string[] = [];
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) dias.push(d);

  return { desde, hasta, dias, titulo, anterior, siguiente, mesReferencia };
}

export interface FiltrosAgenda {
  sec?: string;
  sub?: string;
  dir?: string;
  tipo?: string;
  estado?: string;
  q?: string;
}

/**
 * Los cinco filtros, aplicados todos en el mismo lugar.
 *
 * Aunque la consulta sepa filtrar por tipo y estado, no se le delega: el área
 * es un subárbol del organigrama y el texto mira cuatro campos con las tildes
 * normalizadas, así que esos dos no pueden ir en el SQL de todos modos; y sobre
 * todo, quien llama necesita conservar el conjunto sin filtrar para distinguir
 * "acá no hay nada" de "los filtros lo dejaron sin nada". Filtrando en la
 * consulta las dos frases se vuelven la misma y el cartel manda a buscar el
 * problema donde no está. Un período son seis semanas del municipio entero: no
 * es volumen que justifique el riesgo.
 */
export function filtrarActividades(
  actividades: Actividad[],
  unidades: UnidadOrganizacional[],
  filtros: FiltrosAgenda
): Actividad[] {
  const hijosPorPadre = new Map<string | null, UnidadOrganizacional[]>();
  for (const u of unidades) {
    (hijosPorPadre.get(u.parent_id) ?? hijosPorPadre.set(u.parent_id, []).get(u.parent_id)!).push(u);
  }
  const subarbol = (unidadId: string): Set<string> => {
    const out = new Set<string>([unidadId]);
    const walk = (id: string) => {
      for (const hijo of hijosPorPadre.get(id) ?? []) {
        out.add(hijo.id);
        walk(hijo.id);
      }
    };
    walk(unidadId);
    return out;
  };

  const filtroUnidad = filtros.dir || filtros.sub || filtros.sec || null;
  const ambito = filtroUnidad ? subarbol(filtroUnidad) : null;

  const termino = normalizarBusqueda(filtros.q ?? "");
  const coincide = (a: Actividad) =>
    !termino ||
    coincideBusqueda(a.titulo, termino) ||
    coincideBusqueda(a.lugar_texto, termino) ||
    coincideBusqueda(a.descripcion, termino) ||
    coincideBusqueda(a.unidad_nombre, termino);

  return actividades.filter(
    (a) =>
      (!ambito || ambito.has(a.unidad_id)) &&
      (!filtros.tipo || a.tipo === filtros.tipo) &&
      (!filtros.estado || a.estado === filtros.estado) &&
      coincide(a)
  );
}

/** Los filtros puestos, para que los enlaces internos no los pierdan. */
export function filtrosEnUrl(filtros: FiltrosAgenda): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ["sec", "sub", "dir", "tipo", "estado", "q"] as const) {
    const v = filtros[k];
    if (v) out[k] = v;
  }
  return out;
}
