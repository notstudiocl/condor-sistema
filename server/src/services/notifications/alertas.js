import { getWebhookUrl, enviarWebhookNotificacion } from './webhookN8n.js';

// Alertas de infraestructura para el equipo de NotStudio (no para el cliente): Gotenberg/R2/n8n
// caídos, jobs que agotan reintentos. Igual que en H&A, van por n8n: el mismo webhook de
// notificaciones con `alerta: true`, y el workflow las desvía al canal interno de NotStudio
// (bot notificacionesvk_bot, chat -1003548492046) en vez del grupo del cliente.
// Respaldo si no hay webhook: bot/chat propios vía ALERTAS_TELEGRAM_BOT_TOKEN / _CHAT_ID.
// Sin ninguna de las dos vías, solo se loguea — nunca al grupo del cliente.

const TIMEOUT_MS = 10000;

export async function alertasConfiguradas() {
  if (await getWebhookUrl()) return true;
  return Boolean(process.env.ALERTAS_TELEGRAM_BOT_TOKEN && process.env.ALERTAS_TELEGRAM_CHAT_ID);
}

// Lanza si no se pudo entregar (el job alerta_notstudio reintenta).
export async function enviarAlertaNotstudio(mensaje) {
  const texto = `⚠️ <b>CONDOR 360 — alerta</b>\n${mensaje || 'Sin detalle'}`;
  const webhookUrl = await getWebhookUrl();
  if (webhookUrl) {
    await enviarWebhookNotificacion(webhookUrl, { evento: 'alerta', alerta: true, marca: { nombre: 'Condor 360' }, emails: [], telegram: { texto }, pdfs: [] });
    return { enviada: true, via: 'n8n' };
  }
  if (!process.env.ALERTAS_TELEGRAM_BOT_TOKEN || !process.env.ALERTAS_TELEGRAM_CHAT_ID) {
    console.error('[alertas] (sin webhook ni ALERTAS_TELEGRAM_*)', texto.replace(/<[^>]+>/g, ''));
    return { enviada: false };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`https://api.telegram.org/bot${process.env.ALERTAS_TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.ALERTAS_TELEGRAM_CHAT_ID, text: texto, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: controller.signal,
    });
    const body = await r.json().catch(() => null);
    if (!r.ok || body?.ok === false) throw new Error(`Telegram respondió ${r.status}: ${body?.description || 'error'}`);
    return { enviada: true, via: 'telegram' };
  } finally {
    clearTimeout(timeout);
  }
}
