import nodemailer from "nodemailer";

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
 * DOS CAMINOS, y se elige solo según qué variables estén cargadas:
 *
 *   A) SMTP — una casilla común con su contraseña de aplicación.
 *        SMTP_USUARIO    la casilla, ej. direccionia@smt.gob.ar
 *        SMTP_PASSWORD   la contraseña de aplicación (16 caracteres, sin espacios)
 *        SMTP_HOST       opcional, por defecto smtp.gmail.com
 *        SMTP_PUERTO     opcional, por defecto 465
 *
 *      Es el camino que se eligió el 17.09: no toca el DNS del municipio ni
 *      necesita verificar el dominio, así que no depende del área de redes.
 *      La casilla tiene que tener la verificación en dos pasos activada, que es
 *      lo que habilita generar la contraseña de aplicación.
 *
 *   B) Resend — por HTTP, para el día que el municipio verifique su dominio.
 *        RESEND_API_KEY
 *
 *   En los dos:
 *        CORREO_REMITENTE    ej. PlanIA <direccionia@smt.gob.ar>. Con SMTP es
 *                            opcional: si falta, se arma con SMTP_USUARIO.
 *        CORREO_RESPONDER_A  opcional. A dónde va la respuesta si alguien
 *                            contesta el aviso, que no tiene por qué ser la
 *                            misma casilla desde la que sale.
 *
 * Si están las dos configuraciones gana SMTP, porque es la que se está usando.
 *
 * TRES DECISIONES QUE SIGUEN VALIENDO:
 *
 * 1. NO se usa el correo de prueba de Supabase. Ese permite unos pocos mensajes
 *    por hora y está pensado para desarrollo: con 72 destinatarios por aviso
 *    fallaría justo cuando se lo necesita, y encima en silencio.
 *
 * 2. Un mensaje por destinatario, nunca una lista junta ni copia oculta: si se
 *    juntan, cada uno ve —o deduce— la lista completa de correos del municipio,
 *    y un rebote se lleva puesto el envío de los demás.
 *
 * 3. Si no está configurado, no se rompe nada. El aviso se guarda igual y se ve
 *    en la campanita, y el envío devuelve `configurado: false` para que la
 *    pantalla lo diga en vez de mentir un "enviado". Sin esto, el día que la
 *    clave venza nadie se enteraría de que los correos no salen.
 */

const ENDPOINT_RESEND = "https://api.resend.com/emails/batch";

/** Tope de mensajes por llamada que acepta el endpoint de lote de Resend. */
const POR_LOTE = 100;

/**
 * Cuántos correos SMTP se mandan a la vez.
 *
 * De a uno, 73 destinatarios tardan más que el tiempo que Vercel le da a una
 * acción y el envío se corta por la mitad. Todos juntos, el servidor de correo
 * corta por abuso. Cinco conexiones es lo que Gmail tolera sin quejarse.
 */
const EN_PARALELO = 5;

export interface ResultadoCorreo {
  /** false = faltan las variables de entorno. No es un error: es que no está puesto. */
  configurado: boolean;
  enviados: number;
  errores: string[];
}

interface Mensaje {
  para: string[];
  asunto: string;
  texto: string;
  html?: string;
}

function configSmtp() {
  const usuario = process.env.SMTP_USUARIO;
  const password = process.env.SMTP_PASSWORD;
  if (!usuario || !password) return null;
  const puerto = Number(process.env.SMTP_PUERTO ?? 465);
  return {
    usuario,
    password,
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    puerto,
    // 465 habla TLS desde el saludo; 587 arranca en claro y sube con STARTTLS.
    seguro: puerto === 465,
  };
}

/** El remitente tal como se escribe en el encabezado, con nombre visible. */
function remitente(usuarioSmtp: string | null): string | null {
  const escrito = process.env.CORREO_REMITENTE?.trim();
  if (escrito) return escrito;
  // Con SMTP alcanza con la casilla: el nombre visible se puede poner después
  // sin tocar nada más que la variable.
  return usuarioSmtp ? `PlanIA <${usuarioSmtp}>` : null;
}

/** La dirección sola, sin el nombre visible: "PlanIA <a@b.com>" → "a@b.com". */
function soloDireccion(s: string): string {
  return (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase();
}

export function correoConfigurado(): boolean {
  if (configSmtp()) return true;
  return Boolean(process.env.RESEND_API_KEY && process.env.CORREO_REMITENTE);
}

/** Qué camino está en uso, para poder decirlo en un diagnóstico. */
export function proveedorDeCorreo(): "smtp" | "resend" | null {
  if (configSmtp()) return "smtp";
  if (process.env.RESEND_API_KEY && process.env.CORREO_REMITENTE) return "resend";
  return null;
}

/**
 * Manda un mismo mensaje a varias direcciones, UNA POR MENSAJE.
 *
 * Nunca tira: un corte de red o una casilla que rebota no pueden voltear la
 * creación del aviso, que ya está guardado.
 */
export async function enviarCorreoAVarios(input: Mensaje): Promise<ResultadoCorreo> {
  const destinos = [...new Set(input.para.map((d) => d.trim().toLowerCase()).filter(Boolean))];

  const smtp = configSmtp();
  if (smtp) {
    const de = remitente(smtp.usuario)!;
    if (destinos.length === 0) return { configurado: true, enviados: 0, errores: [] };
    return enviarPorSmtp(smtp, de, destinos, input);
  }

  const clave = process.env.RESEND_API_KEY;
  const de = remitente(null);
  if (!clave || !de) return { configurado: false, enviados: 0, errores: [] };
  if (destinos.length === 0) return { configurado: true, enviados: 0, errores: [] };
  return enviarPorResend(clave, de, destinos, input);
}

async function enviarPorSmtp(
  smtp: NonNullable<ReturnType<typeof configSmtp>>,
  de: string,
  destinos: string[],
  input: Mensaje
): Promise<ResultadoCorreo> {
  const responderA = process.env.CORREO_RESPONDER_A?.trim() || undefined;

  const transporte = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.puerto,
    secure: smtp.seguro,
    auth: { user: smtp.usuario, pass: smtp.password },
    pool: true,
    maxConnections: EN_PARALELO,
    maxMessages: 100,
    // Sin estos topes, un servidor que no contesta se come todo el tiempo que
    // Vercel le da a la acción y el aviso queda a medio mandar sin decir nada.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  const errores: string[] = [];
  let enviados = 0;

  const cola = [...destinos];
  const trabajador = async () => {
    for (let to = cola.shift(); to; to = cola.shift()) {
      try {
        await transporte.sendMail({
          from: de,
          to,
          replyTo: responderA,
          subject: input.asunto,
          text: input.texto,
          ...(input.html ? { html: input.html } : {}),
        });
        enviados++;
      } catch (e) {
        errores.push(`${to}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: EN_PARALELO }, trabajador));
  } finally {
    transporte.close();
  }

  // El error más probable la primera vez, y el más críptico: el remitente no es
  // la casilla que se autenticó. Gmail no deja mandar "como" otra dirección.
  // Va PRIMERO porque la pantalla muestra solo el primer error: si queda al
  // final, el que manda ve el 550 en crudo y no la explicación.
  if (errores.length > 0 && soloDireccion(de) !== smtp.usuario.trim().toLowerCase()) {
    errores.unshift(
      `Ojo: CORREO_REMITENTE (${soloDireccion(de)}) no es la casilla de SMTP_USUARIO (${smtp.usuario}). ` +
        "Salvo que esté configurada como alias, el servidor va a rechazar el envío."
    );
  }

  return { configurado: true, enviados, errores };
}

async function enviarPorResend(
  clave: string,
  de: string,
  destinos: string[],
  input: Mensaje
): Promise<ResultadoCorreo> {
  const responderA = process.env.CORREO_RESPONDER_A?.trim();
  const errores: string[] = [];
  let enviados = 0;

  for (let i = 0; i < destinos.length; i += POR_LOTE) {
    const lote = destinos.slice(i, i + POR_LOTE);
    const cuerpo = lote.map((to) => ({
      from: de,
      to: [to],
      subject: input.asunto,
      text: input.texto,
      ...(responderA ? { reply_to: responderA } : {}),
      ...(input.html ? { html: input.html } : {}),
    }));

    try {
      const r = await fetch(ENDPOINT_RESEND, {
        method: "POST",
        headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      if (!r.ok) {
        const detalle = await r.text().catch(() => "");
        errores.push(`HTTP ${r.status}${detalle ? `: ${detalle.slice(0, 200)}` : ""}`);
        continue;
      }
      enviados += lote.length;
    } catch (e) {
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
