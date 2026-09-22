import { getDecryptedSecret, getSetting } from '../../repositories/notificacionesRepo.js';

// Fetch nativo contra la API REST de Resend — a propósito SIN el paquete npm 'resend'
// para no sumar una dependencia más por una sola llamada HTTP.

const RESEND_TIMEOUT_MS = 15000;
const RESEND_API_URL = 'https://api.resend.com/emails';
// El dominio verificado en la cuenta Resend de NotStudio es noreply.notstudio.cl (no la raíz).
export const DEFAULT_FROM = 'Condor Alcantarillados <notificaciones@noreply.notstudio.cl>';
export const DEFAULT_REPLY_TO = 'alcantarilladoscondor@gmail.com';
export const DEFAULT_CORREO_INTERNO = 'alcantarilladoscondor@gmail.com';

// Correos de la empresa, editables por el admin desde Correos (app_settings). Se aplican a TODO
// correo que sale del sistema (órdenes, invitaciones, contraseñas, pruebas): el "Responder a"
// es el correo del cliente (Condor), no el de NotStudio; el interno recibe copia de cada orden.
async function leerSetting(key) {
  try {
    const v = await getSetting(key);
    const s = typeof v === 'string' ? v : v?.value;
    return (s && String(s).trim()) || null;
  } catch {
    return null;
  }
}
export async function getReplyTo() {
  return (await leerSetting('email_reply_to')) || DEFAULT_REPLY_TO;
}
export async function getCorreoInterno() {
  return (await leerSetting('email_interno')) || DEFAULT_CORREO_INTERNO;
}

/**
 * Envía un email vía Resend. La API key nunca sale de este módulo en claro
 * (viene de notificacionesRepo.getDecryptedSecret, que descifra con pgcrypto) y
 * nunca se loguea, ni siquiera en un error.
 *
 * attachments: [{ filename, content }] — content en base64 SIN el prefijo 'data:...;base64,'.
 */
export async function enviarEmail({ to, cc, subject, html, attachments }) {
  if (!to) throw new Error('enviarEmail requiere "to"');

  const channel = await getDecryptedSecret('resend');
  if (!channel || !channel.activo) {
    throw new Error('Canal Resend inactivo o sin credenciales configuradas');
  }
  const apiKey = channel.secret;
  const from = channel.config?.fromEmail || DEFAULT_FROM;
  const replyTo = await getReplyTo();

  const body = {
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  };
  if (cc) body.cc = Array.isArray(cc) ? cc : [cc];
  if (replyTo) body.reply_to = replyTo;
  if (attachments && attachments.length > 0) {
    body.attachments = attachments.map((a) => ({ filename: a.filename, content: a.content }));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);
  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    let responseBody = null;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = null;
    }

    if (!response.ok) {
      throw new Error(`Resend respondió ${response.status}: ${responseBody?.message || 'error desconocido'}`);
    }
    return { id: responseBody?.id || null };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Resend no respondió en ${RESEND_TIMEOUT_MS}ms (timeout)`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
