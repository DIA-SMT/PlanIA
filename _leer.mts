import { readFileSync, mkdtempSync, copyFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
const ruta = process.argv[2];
const carpeta = mkdtempSync(join(tmpdir(), "doc-"));
const zip = join(carpeta, "doc.zip");
copyFileSync(ruta, zip);
execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -Path '${zip}' -DestinationPath '${carpeta}' -Force`]);
const xml = readFileSync(join(carpeta, "word", "document.xml"), "utf8");
const parrafos = xml.split(/<\/w:p>/).map((p) =>
  [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join("")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
);
const lineas = parrafos.map((t, i) => `${String(i + 1).padStart(4)}| ${t}`);
writeFileSync("_doc4.txt", lineas.join("\n"), "utf8");
console.log(`parrafos: ${parrafos.length}`);
const conTexto = parrafos.map((t, i) => [i + 1, t] as const).filter(([, t]) => t.trim());
console.log(`con texto: ${conTexto.length}`);
// Donde aparece 18.09 o similar
for (const [i, t] of conTexto) if (/18[./]09|18 de septiembre|18\.9/.test(t)) console.log(`  marca 18.09 en el parrafo ${i}: ${t.slice(0, 90)}`);
