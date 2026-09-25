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
  briefing: string | null;
  created_at: string;
  updated_at: string;
}
