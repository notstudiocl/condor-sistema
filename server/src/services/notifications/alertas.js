// Alertas de infraestructura para el equipo de NotStudio (no para el cliente): Gotenberg/R2/n8n
// caídos, jobs que agotan reintentos. Van por un bot y chat de Telegram PROPIOS de NotStudio
// (env ALERTAS_TELEGRAM_BOT_TOKEN / ALERTAS_TELEGRAM_CHAT_ID). Sin esas env vars solo se
// loguea — nunca se manda una alerta técnica al grupo del cliente.

const TIMEOUT_MS = 10000;

export function alertasConfiguradas() {
  return Boolean(process.env.ALERTAS_TELEGRAM_BOT_TOKEN && process.env.ALERTAS_TELEGRAM_CHAT_ID);
}

// Lanza si Telegram no acepta el mensaje (el job alerta_notstudio reintenta).
export async function enviarAlertaNotstudio(mensaje) {
  const texto = `⚠️ <b>CONDOR 360 — alerta</b>\n${mensaje || 'Sin detalle'}`;
  if (!alertasConfiguradas()) {
    console.error('[alertas] (sin ALERTAS_TELEGRAM_* configuradas)', texto.replace(/<[^>]+>/g, ''));
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
    return { enviada: true };
  } finally {
    clearTimeout(timeout);
  }
}
