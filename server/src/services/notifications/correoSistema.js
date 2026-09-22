import { enviarEmail, DEFAULT_FROM, getReplyTo } from './resend.js';
import { getWebhookUrl, enviarWebhookNotificacion } from './webhookN8n.js';
import * as notificacionesRepo from '../../repositories/notificacionesRepo.js';

// Correos del propio sistema (invitaciones al panel, contraseñas temporales) — van a personal
// interno, no a clientes, así que NO pasan por email_dev_redirect. Usan el mismo camino que las
// notificaciones de órdenes: webhook de n8n si está configurado, Resend in-process si no.
// Lanza si el envío falla (el caller decide cómo degradar).
export async function enviarCorreoSistema({ to, subject, html }) {
  const webhookUrl = await getWebhookUrl();
  if (!webhookUrl) {
    await enviarEmail({ to, subject, html });
    return;
  }
  let remitente = {};
  try {
    remitente = (await notificacionesRepo.getChannel('resend'))?.config || {};
  } catch {
    remitente = {};
  }
  await enviarWebhookNotificacion(webhookUrl, {
    evento: 'correo_sistema',
    marca: { nombre: 'Condor 360' },
    emails: [{ plantilla: 'sistema', to, cc: null, from: remitente.fromEmail || DEFAULT_FROM, replyTo: await getReplyTo(), subject, html }],
    telegram: { texto: '' },
    pdfs: [],
  });
}
