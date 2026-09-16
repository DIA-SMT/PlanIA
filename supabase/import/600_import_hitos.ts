/**
 * Carga el calendario de hitos desde la planilla de Planificación.
 *
 * 15.09, párrafos 799 a 803. Se decidió importar una vez y volver a correr esto
 * cuando manden una planilla nueva: el Word enlaza un Google Sheets, pero
 * conectarse a Google en vivo es otra cosa y necesita permisos que no tenemos.
 *
 *   npx tsx supabase/import/600_import_hitos.ts "C:/ruta/Calendario HITOS .xlsx"
 *
 * Es idempotente por (fecha_desde, fecha_hasta, nombre): volver a correrlo con la
 * misma planilla no duplica nada. Un hito que cambió de fecha entra como nuevo y
 * el viejo queda — si hace falta limpiar, se borra por `origen`.
 *
 * CÓMO ESTÁ ARMADA LA PLANILLA, que no es obvio:
 *   - Una hoja por mes. Las columnas son id_secretaria, nombre_secretaria,
 *     nombre_direccion, DESDE, HASTA, TIPO DE HITO, NOMBRE.
 *   - La secretaría y la dirección se arrastran hacia abajo: aparecen una vez y
 *     las filas siguientes las dejan vacías. Hay que llevar el último valor.
 *   - Las celdas vacías vienen autocerradas (`<c r="A4"/>`), así que un regex que
 *     busque `<c ...>...</c>` se come varias celdas de una. Por eso el parseo
 *     corta por tag y no por par de tags.
 */
import { readFileSync, mkdtempSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ORIGEN = "Calendario HITOS .xlsx";

const des = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

const ES_FECHA = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/;
const aIso = (s: string): string | null => {
  const m = ES_FECHA.exec(s.trim());
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
};

/** Las celdas de una fila, como { A: "...", B: "..." }. */
function celdasDe(cont: string, sst: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of cont.matchAll(/<c\s[^>]*?r="([A-Z]+)\d+"[^>]*?(\/>|>([\s\S]*?)<\/c>)/g)) {
    const col = m[1];
    const cuerpo = m[3] ?? "";
    const esTexto = / t="s"/.test(m[0]);
    const v = (/<v>([\s\S]*?)<\/v>/.exec(cuerpo) || [])[1];
    if (v == null) continue;
    const val = esTexto ? sst[Number(v)] ?? "" : v;
    if (String(val).trim()) out[col] = String(val).trim();
  }
  return out;
}

/**
 * La planilla trae nombres escritos a mano. Se limpia lo que es claramente
 * basura de carga —un mail pegado al nombre de la secretaría— y nada más: no se
 * intenta adivinar contra `unidad_organizacional`, porque el hito se muestra
 * igual aunque el área no matchee y corregir nombres a ciegas es peor.
 */
const limpiarArea = (s: string): string =>
  s.replace(/\s*[\w.+-]+@[\w.-]+\.\w+\s*/g, " ").replace(/\s+/g, " ").trim();

async function main() {
  const ruta = process.argv[2];
  if (!ruta) {
    console.error('Uso: npx tsx supabase/import/600_import_hitos.ts "ruta/al/Calendario HITOS .xlsx"');
    process.exit(1);
  }

  // Un .xlsx es un zip, pero Expand-Archive mira la extensión y rechaza
  // cualquier cosa que no termine en .zip. Se copia con ese nombre y listo.
  const dir = mkdtempSync(join(tmpdir(), "hitos-"));
  const comoZip = join(dir, "libro.zip");
  copyFileSync(ruta, comoZip);
  execFileSync("powershell", [
    "-NoProfile",
    "-Command",
    `Expand-Archive -LiteralPath '${comoZip}' -DestinationPath '${dir}' -Force`,
  ]);

  const shared = readFileSync(join(dir, "xl/sharedStrings.xml"), "utf8");
  const sst = [...shared.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    des((m[1].match(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/g) || [])
      .map((x) => x.replace(/<t(?: [^>]*)?>/, "").replace(/<\/t>/, "")).join(""))
  );
  const wb = readFileSync(join(dir, "xl/workbook.xml"), "utf8");
  const hojas = [...wb.matchAll(/<sheet[^>]*name="([^"]+)"/g)].map((m) => des(m[1]));

  type Hito = {
    fecha_desde: string; fecha_hasta: string; tipo: string | null;
    nombre: string; secretaria: string | null; direccion: string | null; origen: string;
  };
  const hitos: Hito[] = [];
  const saltadas: string[] = [];

  for (let i = 1; i <= hojas.length; i++) {
    let xml: string;
    try { xml = readFileSync(join(dir, `xl/worksheets/sheet${i}.xml`), "utf8"); } catch { continue; }
    let secretaria = "", direccion = "";
    for (const [, n, cont] of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      if (Number(n) === 1) continue;
      const c = celdasDe(cont, sst);
      if (c.B) secretaria = limpiarArea(c.B);
      if (c.C) direccion = limpiarArea(c.C);
      const desde = aIso(c.D ?? "");
      if (!desde) continue;
      if (!c.G) { saltadas.push(`${hojas[i - 1]} fila ${n}: tiene fecha pero no nombre`); continue; }
      hitos.push({
        fecha_desde: desde,
        fecha_hasta: aIso(c.E ?? "") ?? desde,
        tipo: (c.F ?? "").toUpperCase() || null,
        nombre: c.G,
        secretaria: secretaria || null,
        direccion: direccion || null,
        origen: ORIGEN,
      });
    }
  }

  console.log(`hitos leídos: ${hitos.length}`);
  for (const s of saltadas) console.log(`  saltada — ${s}`);
  if (hitos.length === 0) { console.error("No se leyó ningún hito. Revisá la planilla."); process.exit(1); }

  const env = readFileSync(".env", "utf8");
  const g = (k: string) => (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
  const sb = createClient(g("NEXT_PUBLIC_SUPABASE_URL")!, g("SUPABASE_SERVICE_ROLE_KEY")!);

  // upsert por la clave natural: correrlo dos veces no duplica.
  const { error } = await sb
    .from("hito_calendario")
    .upsert(hitos, { onConflict: "fecha_desde,fecha_hasta,nombre" });
  if (error) { console.error("Error al cargar:", error.message); process.exit(1); }

  const { count } = await sb.from("hito_calendario").select("id", { count: "exact", head: true });
  console.log(`cargados. La tabla tiene ahora ${count} hitos.`);
}

main();
