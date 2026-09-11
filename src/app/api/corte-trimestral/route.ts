import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import {
  tomarCorteTrimestral,
  finDeTrimestre,
  ultimoCierrePasado,
  cierrePendiente,
} from "@/lib/corte-trimestral";
import { hoyLocal } from "@/lib/utils";

export const revalidate = 0;
export const dynamic = "force-dynamic";
// La foto recorre 441 proyectos, 789 metas y 1404 indicadores paginados: no
// entra en el timeout por defecto de una función serverless.
export const maxDuration = 60;

/**
 * Toma la foto del corte trimestral. La llama el proceso programado de GitHub
 * Actions (.github/workflows/corte-trimestral.yml), que corre todos los días.
 *
 *   POST /api/corte-trimestral
 *   Authorization: Bearer <CORTE_TRIMESTRAL_SECRET>
 *
 * Sin sesión: lo consume un cron, así que la autorización es el secreto y la
 * lectura va por service_role. Mismo criterio que el feed de calendario.
 *
 * Parámetros opcionales en el cuerpo:
 *   fecha_corte  ISO. Por defecto hoy.
 *   solo_fin_de_trimestre  si es true (lo que manda el cron), solo actúa cuando
 *                          quedó un cierre de trimestre sin foto, y la fecha
 *                          la pone en ese cierre. Así el cron corre todos los
 *                          días sin ensuciar y rescata solo lo que falte.
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

  const hoy = hoyLocal();
  let fechaCorte = cuerpo.fecha_corte ?? hoy;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaCorte)) {
    return Response.json({ error: "fecha_corte tiene que ser YYYY-MM-DD" }, { status: 400 });
  }

  // El cron corre todos los días porque GitHub Actions no sabe expresar "el
  // último día del trimestre". El filtro se hace acá, y NO es "hoy es el último
  // día": es "quedó algún cierre sin foto".
  //
  // La diferencia importa. Con el filtro anterior, un atraso en la cola de
  // Actions la noche del 30 de septiembre corría el job ya con fecha del 1 de
  // octubre, el endpoint respondía "hoy no es fin de trimestre" con HTTP 200,
  // el check salía verde y el cierre se perdía para siempre — justo lo que la
  // foto existe para evitar. Preguntando por el pendiente, la corrida del 1, la
  // del 2 o la del 3 lo rescata sola, y la fecha del corte queda en el cierre
  // real, no en el día que corrió.
  if (cuerpo.solo_fin_de_trimestre) {
    let pendiente: Awaited<ReturnType<typeof cierrePendiente>>;
    try {
      pendiente = await cierrePendiente(hoy);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return Response.json({ error: `No se pudo consultar el cierre pendiente: ${msg}` }, { status: 500 });
    }
    if (!pendiente.fecha) {
      return Response.json({
        omitido: true,
        motivo: `el cierre del ${ultimoCierrePasado(hoy)} ya tiene su foto`,
        proximo_cierre: finDeTrimestre(hoy),
      });
    }
    // Un cierre viejo NO se rescata: la foto se llenaría con los datos de hoy y
    // quedaría fechada meses atrás, afirmando algo falso sobre un día en el que
    // nadie miró. Se responde 200 para no dejar el check en rojo todos los días
    // por algo que ya no tiene arreglo, pero se dice fuerte que ese cierre se
    // perdió, para que el workflow lo marque como aviso.
    if (pendiente.vencido) {
      return Response.json({
        omitido: true,
        cierre_perdido: pendiente.fecha,
        dias: pendiente.dias,
        motivo:
          `el cierre del ${pendiente.fecha} no tiene foto y pasaron ${pendiente.dias} días: ` +
          `ya no se puede reconstruir, y guardarlo con los datos de hoy seria inventar ese dia`,
        proximo_cierre: finDeTrimestre(hoy),
      });
    }
    // Se fecha en el cierre, no en hoy.
    fechaCorte = pendiente.fecha;
  }

  try {
    const r = await tomarCorteTrimestral({ fechaCorte, origen: "automatico" });
    return Response.json({
      ok: true,
      ...r,
      // Para que el workflow pueda avisar cuando rescató un cierre atrasado.
      rescatado: fechaCorte !== hoy,
      corrido_el: hoy,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("corte-trimestral:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
