/**
 * Pintar un chip a partir de un color.
 *
 * Lo que habia acá era la paleta del "color por actividad" de la agenda semanal
 * de PlanIA (correcciones 06.08), que se fue con esa pantalla el 30.09. Sobrevive
 * esta función porque no era de esa paleta: toma un hex cualquiera, y la Agenda
 * Georreferenciada la usa con los colores de los tipos de actividad.
 */

/**
 * Estilos inline para pintar un chip con un color. Van inline y no como clases
 * de Tailwind porque el color es un dato, no algo conocido en build.
 */
export function estiloChip(hex: string): React.CSSProperties {
  return {
    backgroundColor: `${hex}26`, // ~15 % de opacidad
    borderColor: `${hex}59`,
    color: hex,
  };
}
