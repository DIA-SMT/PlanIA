import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { tomarCorteTrimestral, finDeTrimestre, trimestreDe } from "@/lib/corte-trimestral";

export const revalidate = 0;
export const dynamic = "force-dynamic";
// La foto recorre 441 proyectos, 789 metas y 1404 indicadores paginados: no
// entra en el timeout por defecto de una función serverless.
export const maxDuration = 60;

/**
 * Toma la foto del corte trimestral. La llama el proceso programado de GitHub
 * Actions (.github/workflows/corte-trimestral.yml) el último día de cada
 * trimestre.
 *
 *   POST /api/corte-trimestral
 *   Authorization: Bearer <CORTE_TRIMESTRAL_SECRET>
 *
 * Sin sesión: lo consume un cron, así que la autorización es el secreto y la
 * lectura va por service_role. Mismo criterio que el feed de calendario.
 *
 * Parámetros opcionales en el cuerpo:
 *   fecha_corte  ISO. Por defecto hoy.
 *   solo_fin_de_trimestre  si es true (el default para el cron), no hace nada
 *                          salvo que hoy SEA el último día del trimestre. Así
 *                          el cron puede correr todos los días sin ensuciar.
 */
function secretoValido(header: string | null): boolean {
  const esperado = process.env.CORTE_TRIMESTRAL_SECRET;
  if (!esperado) return false;
  const recibido = (header ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  // timingSafeEqual exige mismo largo; comparar los largos primero filtra sin
  // filtrar información útil.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!process.env.CORTE_TRIMESTRAL_SECRET) {
    return Response.json(
      { error: "Falta configurar CORTE_TRIMESTRAL_SECRET" },
      { status: 503 }
    );
  }
  if (!secretoValido(req.headers.get("authorization"))) {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }

  let cuerpo: { fecha_corte?: string; solo_fin_de_trimestre?: boolean } = {};
  try {
    cuerpo = await req.json();
  } catch {
    // Sin cuerpo está bien: se usan los defaults.
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const fechaCorte = cuerpo.fecha_corte ?? hoy;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaCorte)) {
    return Response.json({ error: "fecha_corte tiene que ser YYYY-MM-DD" }, { status: 400 });
  }

  // El cron corre todos los días a la misma hora porque GitHub Actions no
  // entiende "el último día del trimestre". El filtro se hace acá.
  if (cuerpo.solo_fin_de_trimestre && fechaCorte !== finDeTrimestre(fechaCorte)) {
    return Response.json({
      omitido: true,
      motivo: `hoy (${fechaCorte}) no es el último día del trimestre ${trimestreDe(fechaCorte)}`,
      proximo_corte: finDeTrimestre(fechaCorte),
    });
  }

  try {
    const r = await tomarCorteTrimestral({ fechaCorte, origen: "automatico" });
    return Response.json({ ok: true, ...r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("corte-trimestral:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
