import { NextResponse, type NextRequest } from "next/server";
import { getPerfilActual } from "@/lib/auth";
import { getPoaDelArea, PARRAFOS_POA, ANIO_POA, type AreaDelPoa, type TextoPoa } from "@/lib/poa-2027";
import { partirEnItems, conMayusculas } from "@/lib/items-texto";

export const dynamic = "force-dynamic";

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
}

/**
 * Un párrafo del documento, con su rótulo y sus ítems como lista de Word —
 * 05.10.
 *
 * Es la misma regla que la pantalla (partirEnItems): el documento que se baja
 * tiene que verse igual que el que se edita. Word dibuja un <ul> como lista con
 * viñetas, así que en el archivo los ítems también quedan uno debajo del otro y
 * no "todo de corrido". El rótulo va en el mismo renglón que la introducción de
 * la lista, como en el libro.
 */
function parrafo(rotulo: string | null, valor: string | null | undefined): string {
  if (!valor?.trim()) return "";
  // Con mayúscula al empezar, igual que en pantalla (05.10).
  const corregido = conMayusculas(valor.trim());
  const r = rotulo ? `<b>${esc(rotulo)}:</b> ` : "";
  const p = partirEnItems(corregido);
  if (!p) return `<p style="margin:0 0 6px 0;">${r}${esc(corregido)}</p>`;
  const intro = r || p.intro ? `<p style="margin:0 0 4px 0;">${r}${esc(p.intro)}</p>` : "";
  const items = p.items.map((i) => `<li style="margin-bottom:4px;">${esc(i)}</li>`).join("");
  return `${intro}<ul style="margin:0 0 6px 18px;padding:0;">${items}</ul>`;
}

const conTexto = (t: TextoPoa) => !!(t.titulo?.trim() || t.texto?.trim());

/** Un área del documento: introducciones, proyectos y banco de ideas (08.10). */
function bloque(area: AreaDelPoa): string {
  const intros = area.introducciones
    .filter(conTexto)
    .map(
      (t) =>
        (t.titulo?.trim() ? `<h3 style="font-size:12pt;margin:12px 0 4px 0;">${esc(t.titulo)}</h3>` : "") +
        parrafo(null, t.texto)
    )
    .join("");

  const proyectos = area.fichas
    .map(
      (f, i) =>
        `<h3 style="font-size:12pt;margin:14px 0 4px 0;">Proyecto ${i + 1}: ${esc(f.programa)}</h3>` +
        PARRAFOS_POA.map((p) => parrafo(p.rotulo, f[p.campo])).join("")
    )
    .join("");

  const ideas = area.ideas.filter(conTexto);
  const banco =
    ideas.length === 0
      ? ""
      : `<h3 style="font-size:12pt;margin:18px 0 4px 0;">Banco de ideas</h3>` +
        ideas
          .map(
            (t) =>
              `<h4 style="font-size:11pt;margin:10px 0 4px 0;">Proyecto: ${esc(t.titulo)}</h4>` +
              parrafo(null, t.texto)
          )
          .join("");

  return `<h2 style="font-size:14pt;color:#1f4e9c;border-bottom:1px solid #9cb3d6;margin:24px 0 8px 0;">${esc(area.nombre)}</h2>${intros}${proyectos}${banco}`;
}

/**
 * El POA 2027 de un área en Word.
 *
 * 08.10: arma el MISMO documento que la pantalla, con la misma función que la
 * arma (getPoaDelArea): lo del área y lo que mandaron las de abajo, solo las
 * fichas ACEPTADAS, redactado como el libro y con las introducciones y el banco
 * de ideas. Hasta hoy el Word iba por su lado: traía también las propuestas que
 * nadie había aceptado y seguía en el formato de tabla PRISMA, que la pantalla
 * dejó el 28.09 ("no son fichas, están como redactados").
 *
 * Planificación Estratégica no tiene área: pide la de cualquiera con ?unidad=.
 * Para cualquier otro rol el parámetro se ignora, como en "Editar mi POA".
 */
export async function GET(req: NextRequest) {
  const perfil = await getPerfilActual();
  if (!perfil) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const pedida = req.nextUrl.searchParams.get("unidad");
  const unidadId = perfil.rol === "admin_funcional" ? pedida : perfil.unidad_id;
  if (!unidadId) {
    return NextResponse.json({ error: "Elegí un área para descargar su POA." }, { status: 400 });
  }

  const { propia, recibidas } = await getPoaDelArea(unidadId);
  if (!propia) return NextResponse.json({ error: "No se encontró esa área." }, { status: 404 });

  const conAlgo = (a: AreaDelPoa) =>
    a.fichas.length > 0 || a.introducciones.some(conTexto) || a.ideas.some(conTexto);
  const areas = [propia, ...recibidas].filter(conAlgo);
  const total = areas.reduce((s, a) => s + a.fichas.length, 0);
  const fecha = new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="utf-8" />
  <title>POA ${ANIO_POA} — ${esc(propia.nombre)}</title>
</head>
<body style="font-family:Arial,sans-serif;font-size:11pt;">
  <h1 style="color:#1f4e9c;font-size:18pt;margin-bottom:2px;">PLAN OPERATIVO ANUAL ${ANIO_POA}</h1>
  <p style="font-size:13pt;font-weight:bold;margin:0;">${esc(propia.nombre)}</p>
  <p style="font-size:9pt;color:#666;">Municipalidad de San Miguel de Tucumán · ${total} ${total === 1 ? "proyecto" : "proyectos"} · generado el ${fecha}</p>
  <hr/>
  ${areas.length === 0 ? "<p>Todavía no hay nada cargado en este POA.</p>" : areas.map(bloque).join("")}
</body>
</html>`;

  const filename = `POA${ANIO_POA}_${(propia.nombre || "area")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")}.doc`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "application/msword; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
