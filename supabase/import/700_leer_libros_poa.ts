/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lee los libros del POA 2026 —uno por secretaría— y arma la propuesta de carga.
 *
 * 17.09: "el POA es un libro que cada secretaría tiene […] dentro de cada libro
 * están las planificaciones de direcciones correspondiente a las áreas
 * dependientes". Pidieron que ese libro esté cargado.
 *
 *   npx tsx supabase/import/700_leer_libros_poa.ts "C:/ruta/a/la/carpeta"
 *
 * ESTE SCRIPT NO ESCRIBE EN LA BASE. Solo lee los documentos, los empareja con
 * los proyectos que ya existen y deja dos archivos:
 *   supabase/import/libros-poa.json   lo que se cargaría, para que lo lea el 710
 *   LIBROS_POA_REVISAR.md             lo que no emparejó solo, para Planificación
 *
 * POR QUE EN DOS PASOS. Los proyectos ya están cargados: de los 272 que traen
 * los libros, 252 ya estaban en PlanIA. Lo que falta es el TEXTO —descripción,
 * objetivo, período, línea de base, meta—, que está en el 5 % de los proyectos.
 * Emparejar por nombre acierta en el 93 %; el resto lo mira una persona antes de
 * que nada toque la base.
 *
 * LOS OCHO DOCUMENTOS NO TIENEN LA MISMA ESTRUCTURA, que es lo que hace esto
 * menos trivial de lo que parece:
 *   - Ambiente, Gobierno, General y Atención Ciudadana usan "Descripción y
 *     objetivo", "Período de trabajo", "Línea de base", "Meta".
 *   - Ingresos Municipales usa "Objetivo", "Plazo de ejecución", "Responsable
 *     técnico" y "Meta anual 2026".
 *   - Algunos agrupan por "DIRECCIÓN DE X" y otros no separan nada.
 *   - Servicios Públicos vino en .docx y el resto en PDF.
 * Por eso cada campo se busca por una lista de sinónimos y no por una etiqueta.
 *
 * Los PDF se pasan a texto con `pdftotext -layout` (viene con poppler; en
 * Windows está en el Git Bash, en /mingw64/bin).
 */
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, basename, extname } from "node:path";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Texto de cada documento
// ---------------------------------------------------------------------------

/** Un PDF a texto, respetando columnas. */
function textoDePdf(ruta: string): string {
  const salida = join(mkdtempSync(join(tmpdir(), "poa-")), "libro.txt");
  // El nombre original puede traer acentos que pdftotext no abre en Windows, así
  // que se copia a un nombre simple antes de convertir.
  const copia = join(mkdtempSync(join(tmpdir(), "poa-")), "libro.pdf");
  copyFileSync(ruta, copia);
  execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", copia, salida]);
  return readFileSync(salida, "utf8");
}

/** Un .docx a texto: un párrafo del documento, una línea. */
function textoDeDocx(ruta: string): string {
  const carpeta = mkdtempSync(join(tmpdir(), "poa-"));
  const zip = join(carpeta, "libro.zip");
  copyFileSync(ruta, zip); // Expand-Archive rechaza la extensión .docx
  execFileSync("powershell", [
    "-NoProfile",
    "-Command",
    `Expand-Archive -Path '${zip}' -DestinationPath '${carpeta}' -Force`,
  ]);
  const xml = readFileSync(join(carpeta, "word", "document.xml"), "utf8");
  return xml
    .split(/<\/w:p>/)
    .map((p) =>
      // `<w:t>` y `<w:t xml:space="preserve">`, NADA MÁS. Con `<w:t[^>]*>` se
      // colaba `<w:tblPr>`, que empieza igual, y por esa vía entraban cientos de
      // caracteres de XML de tablas en medio del texto. Pasó: cuatro proyectos
      // de Servicios Públicos quedaron con XML crudo en la descripción.
      [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map((m) => m[1])
        .join("")
        // Red de seguridad: si algún día se cuela otra etiqueta, no llega al dato.
        .replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
    )
    .join("\n");
}

// ---------------------------------------------------------------------------
// Parseo de un libro
// ---------------------------------------------------------------------------

/** Cada campo con todas las formas en que lo escribieron. Van de la más específica a la más general. */
const CAMPOS = [
  { clave: "descripcion", etiquetas: ["descripción y objetivo", "descripcion y objetivo", "descripción", "descripcion"] },
  // Ingresos Municipales titula "Objetivo" a secas, y ahi es otra cosa: dos
  // renglones, no el parrafo largo de los demas libros. Va a su propia columna.
  { clave: "objetivo", etiquetas: ["objetivo general", "objetivo"] },
  { clave: "periodo", etiquetas: ["período de trabajo", "periodo de trabajo", "plazo de ejecución", "plazo de ejecucion", "período de ejecución", "periodo de ejecucion"] },
  { clave: "hito", etiquetas: ["hito"] },
  { clave: "linea_base", etiquetas: ["línea de base", "linea de base"] },
  { clave: "meta", etiquetas: ["meta anual 2026", "meta anual", "metas", "meta"] },
  { clave: "responsable", etiquetas: ["responsable técnico", "responsable tecnico", "responsable"] },
] as const;

type Clave = (typeof CAMPOS)[number]["clave"];

/** Una etiqueta al principio de una línea: "Línea de base: ..." */
const RE_ETIQUETA = new RegExp(
  `^\\s*(${CAMPOS.flatMap((c) => c.etiquetas).sort((a, b) => b.length - a.length).join("|")})\\s*:`,
  "i"
);

const claveDe = (etiqueta: string): Clave | null => {
  const e = etiqueta.toLowerCase().trim();
  for (const c of CAMPOS) if (c.etiquetas.includes(e)) return c.clave;
  return null;
};

export interface ProyectoDelLibro {
  archivo: string;
  direccion: string | null;
  nombre: string;
  tipo: string | null;
  campos: Partial<Record<Clave, string>>;
}

/** Los pies de página quedan como líneas con un número suelto. */
const esBasura = (l: string) => /^\s*\d{1,3}\s*$/.test(l) || l.trim() === "";

function parsearLibro(texto: string, archivo: string): ProyectoDelLibro[] {
  const lineas = texto.replace(/\r\n/g, "\n").replace(/\f/g, "\n").split("\n");
  const proyectos: ProyectoDelLibro[] = [];

  let direccion: string | null = null;
  let actual: ProyectoDelLibro | null = null;
  let campo: Clave | null = null;
  let buffer: string[] = [];

  const cerrarCampo = () => {
    if (actual && campo && buffer.length > 0) {
      const texto = buffer.join(" ").replace(/\s+/g, " ").trim();
      // Si la etiqueta aparece dos veces gana la primera: en estos documentos la
      // repetición es un encabezado de tabla o un resumen del final.
      if (texto && !actual.campos[campo]) actual.campos[campo] = texto;
    }
    campo = null;
    buffer = [];
  };

  for (const linea of lineas) {
    // ¿Empieza una dirección?
    if (/^\s*DIRECCI[ÓO]N(ES)?\b/.test(linea) && linea.trim() === linea.trim().toUpperCase()) {
      cerrarCampo();
      direccion = linea.trim().replace(/\s+/g, " ");
      continue;
    }

    // ¿Empieza un proyecto?
    const mProyecto = linea.match(/^\s*Proyecto\s+\d+\s*:\s*(.+)$/i);
    if (mProyecto) {
      cerrarCampo();
      const [nombre, ...resto] = mProyecto[1].split("|");
      actual = {
        archivo,
        direccion,
        nombre: nombre.replace(/\s+/g, " ").trim(),
        tipo: resto.join(" | ").replace(/\s+/g, " ").trim() || null,
        campos: {},
      };
      proyectos.push(actual);
      continue;
    }

    if (!actual || esBasura(linea)) {
      if (esBasura(linea) && campo) buffer.push(""); // corta el párrafo, no el campo
      continue;
    }

    const mEtiqueta = linea.match(RE_ETIQUETA);
    if (mEtiqueta) {
      cerrarCampo();
      campo = claveDe(mEtiqueta[1]);
      buffer = [linea.slice(mEtiqueta[0].length)];
      continue;
    }

    if (campo) buffer.push(linea);
  }
  cerrarCampo();

  return proyectos;
}

// ---------------------------------------------------------------------------
// Emparejar con lo que ya está cargado
// ---------------------------------------------------------------------------

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/**
 * "enero a diciembre de 2026", "Enero/Diciembre 2026", "marzo a diciembre".
 *
 * Devuelve el primer día del mes de inicio y el último del de fin. Si no se
 * entiende, null: es preferible dejar la fecha vacía a inventar una.
 */
function fechasDelPeriodo(texto: string | undefined): { inicio: string; fin: string } | null {
  if (!texto) return null;
  const t = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const anio = Number(t.match(/\b(20\d\d)\b/)?.[1] ?? 2026);
  const nombres = Object.keys(MESES).join("|");
  const rango = t.match(new RegExp(`\\b(${nombres})\\b\\s*(?:a|hasta|al|\\/|-|–)\\s*\\b(${nombres})\\b`));
  if (!rango) return null;
  const dd = (n: number) => String(n).padStart(2, "0");
  const m1 = MESES[rango[1]];
  const m2 = MESES[rango[2]];
  // Día 0 del mes siguiente = último día de este mes.
  const ultimo = new Date(Date.UTC(anio, m2, 0)).getUTCDate();
  return { inicio: `${anio}-${dd(m1)}-01`, fin: `${anio}-${dd(m2)}-${dd(ultimo)}` };
}

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Cuánto se parecen dos nombres, 0 a 1, por palabras en común. */
function parecido(a: string, b: string): number {
  const pa = new Set(normalizar(a).split(" ").filter((w) => w.length > 3));
  const pb = new Set(normalizar(b).split(" ").filter((w) => w.length > 3));
  if (pa.size === 0 || pb.size === 0) return 0;
  let comunes = 0;
  for (const w of pa) if (pb.has(w)) comunes++;
  return comunes / Math.min(pa.size, pb.size);
}

async function main() {
  const carpeta = process.argv[2];
  if (!carpeta) {
    console.error('Uso: npx tsx supabase/import/700_leer_libros_poa.ts "C:/ruta/a/los/libros"');
    process.exit(1);
  }

  // ---- Los libros ----
  const archivos = readdirSync(carpeta).filter((f) => [".pdf", ".docx"].includes(extname(f).toLowerCase()));
  console.log(`Libros encontrados: ${archivos.length}\n`);

  const delLibro: ProyectoDelLibro[] = [];
  for (const f of archivos) {
    const ruta = join(carpeta, f);
    const texto = extname(f).toLowerCase() === ".pdf" ? textoDePdf(ruta) : textoDeDocx(ruta);
    const proyectos = parsearLibro(texto, basename(f));
    delLibro.push(...proyectos);
    const conTexto = proyectos.filter((p) => p.campos.descripcion).length;
    console.log(
      `  ${String(proyectos.length).padStart(3)} proyectos  (${String(conTexto).padStart(3)} con descripción)  ${f.slice(0, 52)}`
    );
  }
  console.log(`\nTotal en los libros: ${delLibro.length} proyectos`);

  // ---- Lo que ya está en la base ----
  const env = readFileSync(".env", "utf8");
  const g = (k: string) => (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
  const sb = createClient(g("NEXT_PUBLIC_SUPABASE_URL")!, g("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: pys, error } = await sb
    .from("proyecto")
    .select("id, nombre, descripcion, objetivo, unidad_id, fecha_inicio, fecha_fin")
    .eq("estado", "activo")
    .is("deleted_at", null);
  if (error) throw error;
  const { data: unidades } = await sb.from("unidad_organizacional").select("id, nombre, nombre_corto, parent_id");
  const U = new Map((unidades ?? []).map((u: any) => [u.id, u]));
  const nombreUnidad = (id: string) => {
    const u = U.get(id) as any;
    return u?.nombre_corto ?? u?.nombre ?? "(sin área)";
  };

  const enBase = (pys ?? []) as any[];
  console.log(`Proyectos activos en PlanIA: ${enBase.length}\n`);

  // ---- Emparejar ----
  const usados = new Set<string>();
  const propuesta: any[] = [];
  const dudosos: any[] = [];
  const sinPareja: ProyectoDelLibro[] = [];

  for (const p of delLibro) {
    const k = normalizar(p.nombre);
    if (k.length < 8) { sinPareja.push(p); continue; }

    let mejor: any = null;
    let puntaje = 0;
    for (const c of enBase) {
      if (usados.has(c.id)) continue;
      const kc = normalizar(c.nombre);
      const s = kc === k ? 1 : kc.includes(k) || k.includes(kc) ? 0.9 : parecido(p.nombre, c.nombre);
      if (s > puntaje) { puntaje = s; mejor = c; }
    }

    if (!mejor || puntaje < 0.5) { sinPareja.push(p); continue; }
    usados.add(mejor.id);

    // Solo lo que hoy está vacío: nunca se pisa lo que cargaron a mano.
    const vacio = (v: unknown) => !String(v ?? "").trim();
    const fechas = fechasDelPeriodo(p.campos.periodo);
    const fila = {
      proyecto_id: mejor.id,
      nombre_en_base: mejor.nombre,
      nombre_en_libro: p.nombre,
      area: nombreUnidad(mejor.unidad_id),
      direccion_en_libro: p.direccion,
      archivo: p.archivo,
      puntaje: Number(puntaje.toFixed(2)),
      descripcion: p.campos.descripcion && vacio(mejor.descripcion) ? p.campos.descripcion : null,
      objetivo: p.campos.objetivo && vacio(mejor.objetivo) ? p.campos.objetivo : null,
      fecha_inicio: fechas && vacio(mejor.fecha_inicio) ? fechas.inicio : null,
      fecha_fin: fechas && vacio(mejor.fecha_fin) ? fechas.fin : null,
      campos_del_libro: p.campos,
    };
    (puntaje >= 0.9 ? propuesta : dudosos).push(fila);
  }

  writeFileSync(
    "supabase/import/libros-poa.json",
    JSON.stringify({ generado: new Date().toISOString(), seguros: propuesta, dudosos, sin_pareja: sinPareja }, null, 2),
    "utf8"
  );

  console.log(`Emparejados con confianza alta : ${propuesta.length}`);
  console.log(`Emparejados para revisar       : ${dudosos.length}`);
  console.log(`Sin pareja en el sistema       : ${sinPareja.length}`);

  const todos = [...propuesta, ...dudosos];
  console.log("\nDe los emparejados, lo que el libro trae y PlanIA no tiene:");
  for (const k of ["descripcion", "objetivo", "fecha_inicio"] as const) {
    console.log(`  ${k.padEnd(13)}: ${todos.filter((f) => f[k]).length}`);
  }
  const conPeriodo = todos.filter((f) => f.campos_del_libro.periodo).length;
  const leido = todos.filter((f) => fechasDelPeriodo(f.campos_del_libro.periodo)).length;
  console.log(`  (el libro trae período en ${conPeriodo} y se entendió la fecha en ${leido})`);
  console.log("\nLo que el libro trae y hoy no tiene dónde ir:");
  for (const k of ["linea_base", "meta", "hito", "responsable"] as const) {
    console.log(`  ${k.padEnd(13)}: ${todos.filter((f) => f.campos_del_libro[k]).length}`);
  }

  // ---- El archivo para Planificación ----
  const md: string[] = [
    "# Libros del POA 2026: lo que hay que mirar a mano",
    "",
    `Generado el ${new Date().toISOString().slice(0, 10)} a partir de ${archivos.length} libros.`,
    "",
    `Se leyeron **${delLibro.length}** proyectos. **${propuesta.length}** emparejaron solos con un proyecto`,
    `del sistema. Acá están los otros dos grupos, que nadie carga hasta que estén revisados.`,
    "",
    `## Emparejados pero dudosos (${dudosos.length})`,
    "",
    "El nombre del libro y el del sistema se parecen pero no son iguales. Si es el mismo",
    "proyecto, no hay que hacer nada; si no lo es, avisá y lo sacamos.",
    "",
    "| Área | En el libro | En el sistema | Parecido |",
    "|---|---|---|---|",
    ...dudosos.map((d) => `| ${d.area} | ${d.nombre_en_libro} | ${d.nombre_en_base} | ${d.puntaje} |`),
    "",
    `## Están en el libro y no en el sistema (${sinPareja.length})`,
    "",
    "O bien son proyectos que nunca se cargaron, o el nombre cambió tanto que no los",
    "reconoce. Hay que decidir uno por uno si se crean.",
    "",
    "| Libro | Dirección | Proyecto |",
    "|---|---|---|",
    ...sinPareja.map((p) => `| ${p.archivo.slice(0, 28)} | ${p.direccion ?? "—"} | ${p.nombre} |`),
    "",
  ];
  writeFileSync("LIBROS_POA_REVISAR.md", md.join("\n"), "utf8");
  console.log("\nEscritos: supabase/import/libros-poa.json y LIBROS_POA_REVISAR.md");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
