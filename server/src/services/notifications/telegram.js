import { getDecryptedSecret } from '../../repositories/notificacionesRepo.js';

// Fetch nativo contra la Bot API de Telegram — token y chat_id salen de
// notification_channels (canal 'telegram'): getDecryptedSecret ya devuelve tanto el
// secreto (token) descifrado como `config` (incluye chatId) en una sola fila/consulta,
// así que no hace falta una segunda llamada a getChannel() para leer el mismo config.

const TELEGRAM_TIMEOUT_MS = 15000;

export async function enviarTelegram({ text }) {
  if (!text) throw new Error('enviarTelegram requiere "text"');

  const channel = await getDecryptedSecret('telegram');
  if (!channel || !channel.activo) {
    throw new Error('Canal Telegram inactivo o sin credenciales configuradas');
  }
  const token = channel.secret;
  const chatId = channel.config?.chatId;
  if (!chatId) throw new Error('Canal Telegram sin chatId configurado');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
      signal: controller.signal,
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok || body?.ok === false) {
      throw new Error(`Telegram respondió ${response.status}: ${body?.description || 'error desconocido'}`);
    }
    return { messageId: body?.result?.message_id || null };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Telegram no respondió en ${TELEGRAM_TIMEOUT_MS}ms (timeout)`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
