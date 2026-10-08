/**
 * Los ítems de un texto del POA, para mostrarlos uno debajo del otro — 05.10.
 *
 * "La visión editable y a primera vista de las POAs es muy incómoda, está todo
 * de corrido. [...] Fíjense que hay ítems y están uno al lado del otro."
 *
 * El texto de las fichas viene de los libros del POA y llegó SIN saltos de
 * línea: las viñetas quedaron en el medio del renglón, "● Etapa 1: ... ● Etapa
 * 2: ...". Por eso no alcanzaba con respetar los saltos al mostrar —no había
 * ninguno—: hay que partir el texto en las viñetas.
 *
 * Es una sola regla para todos los lugares donde aparece este texto: el
 * documento del POA 2027, la pantalla de edición, el Word que se descarga y la
 * ficha del libro en cada proyecto. Si cada uno partiera a su manera, el Word y
 * la pantalla mostrarían ítems distintos del mismo texto.
 *
 * No toca lo guardado. Solo cambia cómo se lee.
 */

/**
 * Las viñetas que aparecen en los libros. Son caracteres que no se usan para
 * otra cosa, así que no hay riesgo de partir una frase por una coma o un guion.
 * El guion "-" queda afuera a propósito: aparece a mitad de frase todo el
 * tiempo ("BAM - 2° Aniversario").
 */
const VINETAS = /[●•▪◦‣]/g;

/**
 * Un rango de meses que abre un ítem: "Enero - Mar:", "Abr - Junio:" — 06.10.
 *
 * "Las POA se ven mejor pero sigue figurando de corrido. [...] La meta tiene
 * ítems en el documento pero no en el PlanIA." El ejemplo era la calendarización
 * trimestral de los proyectos del Parque 9 de Julio. En el libro original esos
 * renglones eran una lista de Word, y la viñeta de una lista de Word no es un
 * carácter del texto: es formato. Al leer el libro se perdió, así que acá no
 * hay nada que buscar con VINETAS.
 *
 * Lo que sí quedó es el rango de meses con dos puntos, que es inconfundible: en
 * una frase común un "Abr - Junio:" no aparece. Medido el 06.10: 28 fichas del
 * POA 2027 tienen los cuatro trimestres así, sin viñetas, y ninguna otra forma
 * de lista sin viñetas aparece más de dos veces.
 *
 * Busca el lugar donde empieza cada ítem; la letra anterior no puede ser parte
 * de una palabra, para que "Primavera - Junio:" no corte en "vera".
 */
const MES = "(?:Ene(?:ro)?|Feb(?:rero)?|Mar(?:zo)?|Abr(?:il)?|May(?:o)?|Jun(?:io)?|Jul(?:io)?|Ago(?:sto)?|Sep(?:t(?:iembre)?)?|Set(?:iembre)?|Oct(?:ubre)?|Nov(?:iembre)?|Dic(?:iembre)?)";
const RANGO_DE_MESES = new RegExp(
  "(?<!\\p{L})(?=" + MES + "\\.?\\s*[-–]\\s*" + MES + "\\.?\\s*:)",
  "gu"
);

export interface TextoConItems {
  /** Lo que viene antes de la primera viñeta. Puede estar vacío. */
  intro: string;
  items: string[];
}

/**
 * Parte un texto en su introducción y sus ítems.
 *
 * Devuelve null si no hay al menos dos ítems: un texto con una sola viñeta no es
 * una lista, y mostrarlo como tal sería decorar de más.
 */
export function partirEnItems(texto: string | null | undefined): TextoConItems | null {
  if (!texto) return null;
  let antes: string;
  let resto: string[];
  // Las viñetas mandan: si el texto las tiene, los ítems son esos, aunque
  // adentro haya rangos de meses.
  if ((texto.match(VINETAS) ?? []).length >= 2) {
    [antes, ...resto] = texto.split(VINETAS);
  } else {
    // El rango de meses no se descarta como la viñeta: es parte del ítem. Se
    // corta por posición y no con split, porque split no corta en la posición
    // 0 y un texto que arranca con "Enero - Mar:" tomaría el primer ítem como
    // introducción.
    const cortes = [...texto.matchAll(RANGO_DE_MESES)].map((m) => m.index);
    if (cortes.length < 2) return null;
    antes = texto.slice(0, cortes[0]);
    resto = cortes.map((c, i) => texto.slice(c, cortes[i + 1]));
  }
  const items = resto.map((t) => t.trim()).filter(Boolean);
  if (items.length < 2) return null;
  return { intro: antes.trim(), items };
}

/**
 * El mismo texto con cada ítem en su renglón, para editarlo.
 *
 * Es lo que se pone en el cuadro de texto al hacer clic: editar un ítem en el
 * medio de un párrafo de mil caracteres es lo "difícil de editar" que pidieron
 * arreglar. Si alguien guarda, queda guardado así, con los saltos. Si no toca
 * nada, no se guarda: lo controla el campo editable.
 *
 * Aplicarlo dos veces da lo mismo que una.
 */
export function conRenglones(texto: string): string {
  const p = partirEnItems(texto);
  if (!p) return texto;
  return [p.intro, ...p.items.map((i) => `● ${i}`)].filter(Boolean).join("\n");
}

/**
 * El texto con mayúscula al empezar, y al empezar cada ítem — 05.10.
 *
 * "Todo debe estar iniciado con Mayúscula." El texto de los libros se cortó
 * después del rótulo —"Descripción y objetivo: el Tráiler…"— y la oración siguió
 * en minúscula. Medido el 05.10: 165 de 326 fichas del 2026 y 52 de 93 del 2027
 * tienen algún campo así.
 *
 * Solo toca la PRIMERA letra, y solo si es minúscula y no hay otra cosa antes
 * que espacios, comillas o signos de apertura. "2025 fue el año…" queda igual:
 * no se busca una letra más adelante para subir. Una sigla o un nombre que ya
 * vienen en mayúscula no cambian.
 *
 * Se aplica al mostrar. Lo guardado queda como está hasta que alguien edite el
 * campo; ahí se guarda ya corregido.
 *
 * Aplicarla dos veces da lo mismo que una.
 */
export function conMayusculas(texto: string): string {
  return texto.replace(
    /(^|[●•▪◦‣])([\s"'«“(¿¡]*)(\p{Ll})/gu,
    (_, antes: string, signos: string, letra: string) => antes + signos + letra.toUpperCase()
  );
}
