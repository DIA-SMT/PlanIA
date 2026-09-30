/**
 * La Agenda Georreferenciada: tipos, estados y colores.
 *
 * Vive aparte de `agenda-geo.ts` —que habla con la base— para que los
 * componentes con "use client" puedan importar esto sin arrastrar
 * `getSupabaseServer` al bundle del navegador. Es el mismo reparto que hay
 * entre `plan-rector.ts` y `plan-rector-comun.ts`, y por la misma razon: sin
 * esto el build falla.
 *
 * Los tipos y los colores salen de la leyenda de la maqueta del 22.09. El color
 * se define una sola vez porque lo comparten el calendario, el mapa y la ficha:
 * si se copian, el dia que agreguen un tipo queda de un color en el mapa y de
 * otro en la lista.
 */

export const TIPOS = [
  { clave: "obras_publicas", rotulo: "Obras públicas", hex: "#D97706" },
  { clave: "salud", rotulo: "Salud / Esterilización", hex: "#16A34A" },
  { clave: "cultura", rotulo: "Cultura", hex: "#7C3AED" },
  { clave: "educacion", rotulo: "Educación", hex: "#DB2777" },
  { clave: "servicios", rotulo: "Servicios", hex: "#0891B2" },
  { clave: "institucional", rotulo: "Actividades institucionales", hex: "#DC2626" },
  { clave: "otras", rotulo: "Otras actividades", hex: "#6B7280" },
] as const;

export type TipoActividad = (typeof TIPOS)[number]["clave"];

/** El tipo, o el gris de "otras" si llega uno que no conocemos. */
export function tipoDe(clave: string | null | undefined) {
  return TIPOS.find((t) => t.clave === clave) ?? TIPOS[TIPOS.length - 1];
}

/**
 * El circuito del pedido: "carga → actualización → confirmación → realización →
 * histórico". `suspendida` no está en esa lista pero hace falta: una actividad
 * que se cae no es lo mismo que una que nunca existió, y borrarla perdería el
 * dato de que estaba prevista.
 */
export const ESTADOS = [
  { clave: "programada", rotulo: "Programada", clase: "text-info bg-info/10 border-info/30" },
  { clave: "confirmada", rotulo: "Confirmada", clase: "text-success bg-success/10 border-success/30" },
  { clave: "en_curso", rotulo: "En ejecución", clase: "text-warning bg-warning/10 border-warning/30" },
  { clave: "realizada", rotulo: "Realizada", clase: "text-muted bg-border/40 border-border" },
  { clave: "suspendida", rotulo: "Suspendida", clase: "text-danger bg-danger/10 border-danger/30" },
] as const;

export type EstadoActividad = (typeof ESTADOS)[number]["clave"];

export function estadoDe(clave: string | null | undefined) {
  return ESTADOS.find((e) => e.clave === clave) ?? ESTADOS[0];
}

/** Una actividad, tal como la devuelven las consultas. */
export interface Actividad {
  id: string;
  fecha: string;
  hora_desde: string | null;
  hora_hasta: string | null;
  titulo: string;
  descripcion: string | null;
  unidad_id: string;
  unidad_nombre: string | null;
  tipo: string;
  estado: string;
  lugar_texto: string | null;
  lat: number | null;
  lng: number | null;
  requiere_confirmacion: boolean;
  proyecto_id: string | null;
  /** Codigo y nombre del proyecto del POA. Solo lo trae la consulta de la ficha. */
  proyecto_nombre?: string | null;
  briefing: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * El centro del mapa cuando no hay pines que encuadrar: San Miguel de Tucuman.
 *
 * Con actividades cargadas el mapa se ajusta solo al conjunto; esto es para el
 * arranque en frio y para la posicion inicial del pin al cargar una actividad
 * nueva, que casi siempre cae en la ciudad.
 */
export const CENTRO_SMT: [number, number] = [-26.8241, -65.2226];
export const ZOOM_CIUDAD = 13;

/**
 * El recuadro de Tucuman, para pedirle al geocodificador que priorice de aca.
 *
 * Sin esto "Florida 1514" devuelve la Florida de Estados Unidos, que es la
 * respuesta correcta a la pregunta equivocada.
 */
export const RECUADRO_TUCUMAN = {
  oeste: -65.45,
  sur: -27.0,
  este: -65.0,
  norte: -26.65,
};

/** Si un punto cae dentro del recuadro de Tucuman. */
export function enTucuman(lat: number, lng: number): boolean {
  const r = RECUADRO_TUCUMAN;
  return lat >= r.sur && lat <= r.norte && lng >= r.oeste && lng <= r.este;
}

/**
 * Las tres vistas del periodo. Vive aca y no en la barra de filtros porque lo
 * necesitan tanto los componentes de cliente como las pantallas de servidor, y
 * este modulo es el unico que pueden importar los dos.
 */
export type VistaAgenda = "mes" | "semana" | "dia";

/**
 * Que le falta a una actividad para estar completa.
 *
 * La lista sale del propio formulario de carga rapida, que al guardar avisa
 * "cuando puedas, completa el horario, el lugar y el tipo". El punto en el mapa
 * se sumo con la etapa 3.
 *
 * El tipo cuenta como faltante cuando quedo en `otras` porque ese es el valor
 * por defecto: desde afuera no hay forma de distinguir "es una actividad de
 * otro tipo" de "nadie lo eligio". Se prefiere preguntar de mas y que lo
 * confirmen, antes que dejar todo el mapa de un solo color.
 */
export function faltantesDe(a: {
  hora_desde: string | null;
  lugar_texto: string | null;
  tipo: string;
  lat: number | null;
  lng: number | null;
}): string[] {
  const faltan: string[] = [];
  if (!a.hora_desde) faltan.push("horario");
  if (!a.lugar_texto) faltan.push("lugar");
  if (a.tipo === "otras") faltan.push("tipo");
  if (a.lat == null || a.lng == null) faltan.push("punto en el mapa");
  return faltan;
}

/** Los rotulos de los campos del historial, que en la base son nombres de columna. */
export const CAMPOS_HISTORIAL: Record<string, string> = {
  fecha: "Fecha",
  hora_desde: "Hora de inicio",
  hora_hasta: "Hora de fin",
  titulo: "Titulo",
  estado: "Estado",
  lugar_texto: "Lugar",
  lat: "Ubicacion (latitud)",
  lng: "Ubicacion (longitud)",
  unidad_id: "Area responsable",
  tipo: "Tipo",
  requiere_confirmacion: "Requiere confirmacion",
  deleted_at: "Baja",
};

/**
 * El bucket de Storage donde viven los adjuntos de una actividad.
 *
 * Vive aca y no en `actions-documento.ts` por una regla de Next: en un archivo
 * "use server" solo se pueden exportar funciones async. Una constante exportada
 * ahi rompe el build entero, y con un mensaje que apunta al componente que la
 * importa y no al archivo que la declara.
 */
export const BUCKET_DOCUMENTOS = "actividad-documentos";

/** 10 MB. Un briefing con fotos entra; un video no, y no es lo que se pidio. */
export const TAMANO_MAXIMO_DOCUMENTO = 10 * 1024 * 1024;
