/**
 * Envío de correo.
 *
 * 09.09, párrafo 735: "nos gusta cómo se visualiza desde el sistema, pero
 * notamos que no llega notificación al celular, al correo electrónico
 * vinculado. [...] Ustedes díganos qué es más viable de hacer". Decidido:
 * correo ahora, SMS más adelante. Los 73 usuarios tienen correo cargado y
 * ninguno tiene celular, así que el correo funciona el día uno y el SMS
 * arrancaría con una campaña de carga de datos más un costo por mensaje.
 *
 * TRES DECISIONES QUE IMPORTAN:
 *
 * 1. Sin dependencia nueva. Se habla por HTTP con la API del proveedor usando
 *    `fetch`, que ya está en el runtime. Agregar un paquete para armar tres
 *    campos de JSON engorda el despliegue de Vercel, que ya roza el límite de
 *    tamaño de función.
 *
 * 2. NO se usa el correo de prueba de Supabase. Ese permite unos pocos mensajes
 *    por hora y está pensado para desarrollo: con 72 destinatarios por aviso
 *    fallaría justo cuando se lo necesita, y encima en silencio.
 *
 * 3. Si no está configurado, no se rompe nada. El aviso se guarda igual y se ve
 *    en la campanita —que es como funciona hoy— y el envío devuelve
 *    `configurado: false` para que la pantalla lo pueda decir en vez de mentir
 *    un "enviado". Sin esto, el día que falte la clave nadie se enteraría de que
 *    los correos no salen.
 *
 * QUÉ HAY QUE CARGAR PARA QUE FUNCIONE (en `.env` y en Vercel):
 *   RESEND_API_KEY      la clave de la cuenta de Resend
 *   CORREO_REMITENTE    el remitente verificado, ej. PlanIA <planiaino-reply@smt.gob.ar>
 */

const ENDPOINT = "https://api.resend.com/emails/batch";

/** Tope de mensajes por llamada que acepta el endpoint de lote. */
const POR_LOTE = 100;

export interface ResultadoCorreo {
  /** false = faltan las variables de entorno. No es un error: es que no está puesto. */
  configurado: boolean;
  enviados: number;
  errores: string[];
}

export function correoConfigurado(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.CORREO_REMITENTE);
}

/**
 * Manda un mismo mensaje a varias direcciones, UNA POR MENSAJE.
 *
 * No se juntan en un `to` con todos ni en copia oculta: si se juntan, cada
 * destinatario ve —o puede deducir— la lista completa de correos del municipio,
 * y además un rebote de una dirección se lleva puesto el envío de las demás.
 */
export async function enviarCorreoAVarios(input: {
  para: string[];
  asunto: string;
  texto: string;
  html?: string;
}): Promise<ResultadoCorreo> {
  const clave = process.env.RESEND_API_KEY;
  const remitente = process.env.CORREO_REMITENTE;
  if (!clave || !remitente) {
    return { configurado: false, enviados: 0, errores: [] };
  }

  const destinos = [...new Set(input.para.map((d) => d.trim().toLowerCase()).filter(Boolean))];
  if (destinos.length === 0) return { configurado: true, enviados: 0, errores: [] };

  const errores: string[] = [];
  let enviados = 0;

  for (let i = 0; i < destinos.length; i += POR_LOTE) {
    const lote = destinos.slice(i, i + POR_LOTE);
    const cuerpo = lote.map((to) => ({
      from: remitente,
      to: [to],
      subject: input.asunto,
      text: input.texto,
      ...(input.html ? { html: input.html } : {}),
    }));

    try {
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${clave}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(cuerpo),
      });
      if (!r.ok) {
        const detalle = await r.text().catch(() => "");
        errores.push(`HTTP ${r.status}${detalle ? `: ${detalle.slice(0, 200)}` : ""}`);
        continue;
      }
      enviados += lote.length;
    } catch (e) {
      // Un corte de red no puede tumbar la creación del aviso: el aviso ya está
      // guardado y se ve en la campanita.
      errores.push(e instanceof Error ? e.message : String(e));
    }
  }

  return { configurado: true, enviados, errores };
}

/** El cuerpo del correo de un aviso, en texto y en HTML. */
export function correoDeAviso(input: {
  titulo: string;
  cuerpo: string;
  importante: boolean;
  deQuien: string | null;
  urlApp: string | null;
}): { asunto: string; texto: string; html: string } {
  const marca = input.importante ? "[Importante] " : "";
  const asunto = `${marca}PlanIA: ${input.titulo}`;
  const firma = input.deQuien
    ? `\n\n— ${input.deQuien}, Dirección de Planificación Estratégica`
    : "\n\n— Dirección de Planificación Estratégica";
  const enlace = input.urlApp ? `\n\nEntrar a PlanIA: ${input.urlApp}` : "";

  const texto = `${input.titulo}\n\n${input.cuerpo}${enlace}${firma}\n\nEste aviso también está en la campanita de PlanIA.`;

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#111;max-width:560px">
  ${input.importante ? '<p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#B91C1C;text-transform:uppercase;letter-spacing:.06em">Importante</p>' : ""}
  <h1 style="margin:0 0 12px;font-size:19px;line-height:1.3">${esc(input.titulo)}</h1>
  <div style="white-space:pre-wrap">${esc(input.cuerpo)}</div>
  ${input.urlApp ? `<p style="margin:20px 0 0"><a href="${input.urlApp}" style="background:#4F46E5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;display:inline-block">Entrar a PlanIA</a></p>` : ""}
  <p style="margin:24px 0 0;font-size:12px;color:#666;border-top:1px solid #e5e5e5;padding-top:12px">
    ${esc(input.deQuien ? `${input.deQuien}, ` : "")}Dirección de Planificación Estratégica ·
    Municipalidad de San Miguel de Tucumán.<br>Este aviso también está en la campanita de PlanIA.
  </p>
</div>`;

  return { asunto, texto, html };
}
