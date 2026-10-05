import { NextResponse } from "next/server";
import { getPerfilActual } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { FichaPrisma, UnidadOrganizacional } from "@/types/database";
import { partirEnItems } from "@/lib/items-texto";

export const dynamic = "force-dynamic";

function esc(s: string | null | undefined): string {
  if (!s) return "—";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
}

/**
 * Un campo con sus ítems como lista de Word — 05.10.
 *
 * Es la misma regla que la pantalla (partirEnItems): el documento que se baja
 * tiene que verse igual que el que se edita. Word dibuja un <ul> como lista con
 * viñetas, así que en el archivo los ítems también quedan uno debajo del otro y
 * no "todo de corrido".
 */
function escConItems(s: string | null | undefined): string {
  const p = partirEnItems(s);
  if (!p) return esc(s);
  const intro = p.intro ? '<p style="margin:0 0 4px 0;">' + esc(p.intro) + "</p>" : "";
  const items = p.items.map((i) => '<li style="margin-bottom:4px;">' + esc(i) + "</li>").join("");
  return intro + '<ul style="margin:0 0 0 18px;padding:0;">' + items + "</ul>";
}

export async function GET() {
  const perfil = await getPerfilActual();
  if (!perfil) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const sb = await getSupabaseServer();

  // 28.09: el documento que se baja tiene que ser el MISMO que muestra el
  // previsualizador, o sea lo del area mas lo que mandaron las de abajo. Antes
  // bajaba solo las fichas propias, asi que una secretaria se descargaba un
  // documento vacio mientras en pantalla veia el de todas sus direcciones.
  const { data: unidadesData } = await sb
    .from("unidad_organizacional")
    .select("id, nombre, nombre_corto, parent_id")
    .eq("activa", true);
  const unidades = (unidadesData ?? []) as UnidadOrganizacional[];

  const ids: string[] = [];
  if (perfil.unidad_id) {
    ids.push(perfil.unidad_id);
    const bajar = (id: string) => {
      for (const u of unidades.filter((x) => x.parent_id === id)) {
        ids.push(u.id);
        bajar(u.id);
      }
    };
    bajar(perfil.unidad_id);
  }

  let query = sb
    .from("ficha_prisma")
    .select("*, unidad:unidad_organizacional(id, nombre, nombre_corto)")
    .is("deleted_at", null)
    .order("created_at");
  if (ids.length > 0) query = query.in("unidad_id", ids);

  const { data } = await query;
  const fichas = (data ?? []) as (FichaPrisma & { unidad?: UnidadOrganizacional })[];

  // El titulo es el area de quien descarga, no la del primer proyecto que salga:
  // el documento de una secretaria lleva su nombre aunque abra con una ficha de
  // una direccion.
  const propia = unidades.find((u) => u.id === perfil.unidad_id);
  const direccionNombre = propia?.nombre ?? fichas[0]?.unidad?.nombre ?? "Área";
  const fecha = new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });

  const filas = [
    { letra: "P", label: "PROGRAMA / PROYECTO", key: "programa" as const },
    { letra: "R", label: "RELEVANCIA (descripción y objetivo)", key: "relevancia" as const },
    { letra: "I", label: "INDICADOR", key: "indicador" as const },
    { letra: "S", label: "SECRETARÍA", key: "secretaria" as const },
    { letra: "M", label: "META ANUAL", key: "meta_anual" as const },
    { letra: "A", label: "ANCLA (línea de base)", key: "ancla" as const },
  ];

  const fichasHtml = fichas
    .map((f) => {
      const filasHtml = filas
        .map(
          (fila) => `
        <tr>
          <td style="width:40px;background:#e8eef7;font-weight:bold;color:#1f4e9c;text-align:center;border:1px solid #9cb3d6;padding:6px;">${fila.letra}</td>
          <td style="width:200px;font-weight:bold;border:1px solid #9cb3d6;padding:6px;">${fila.label}</td>
          <td style="border:1px solid #9cb3d6;padding:6px;">${escConItems(f[fila.key])}</td>
        </tr>`
        )
        .join("");
      return `
      <table style="border-collapse:collapse;width:100%;margin-bottom:24px;font-family:Arial,sans-serif;font-size:11pt;">
        <tr>
          <td colspan="3" style="background:#1f4e9c;color:#fff;font-weight:bold;text-align:center;border:1px solid #9cb3d6;padding:8px;">
            Dirección: ${esc(f.unidad?.nombre)}
          </td>
        </tr>
        <tr>
          <td colspan="3" style="background:#d6e0f0;font-weight:bold;text-align:center;border:1px solid #9cb3d6;padding:6px;">
            Código: ${esc(f.codigo)}
          </td>
        </tr>
        ${filasHtml}
      </table>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="utf-8" />
  <title>POA 2027 — ${esc(direccionNombre)}</title>
</head>
<body style="font-family:Arial,sans-serif;">
  <h1 style="color:#1f4e9c;font-size:18pt;">Plan Operativo Anual 2027</h1>
  <h2 style="font-size:14pt;">${esc(direccionNombre)}</h2>
  <p style="font-size:10pt;color:#666;">Generado el ${fecha} · ${fichas.length} ficha(s) PRISMA</p>
  <hr/>
  ${fichas.length === 0 ? "<p>No hay fichas cargadas.</p>" : fichasHtml}
</body>
</html>`;

  const filename = `POA2027_${(direccionNombre || "direccion").replace(/[^a-zA-Z0-9]/g, "_")}.doc`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "application/msword; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
