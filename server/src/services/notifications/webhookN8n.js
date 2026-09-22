import * as notificacionesRepo from '../../repositories/notificacionesRepo.js';

// Modo HÍBRIDO de notificaciones (mismo patrón que hya-sistema).
//
// Si hay una URL de webhook configurada (app_settings 'webhook_notificaciones_url', con
// fallback a la env var WEBHOOK_NOTIFICACIONES_URL), el backend NO envía email/Telegram
// él mismo: arma todo (emails ya renderizados, texto de Telegram, link al PDF en R2) y
// dispara UN POST a n8n (instancia compartida del proyecto EasyPanel "infra"). n8n solo
// entrega: Resend para los correos (adjunta el PDF bajándolo de la URL pública de R2) y
// el bot de Telegram al grupo de Condor.
//
// Sin URL configurada, dispatch.js sigue enviando in-process con las credenciales de
// notification_channels — el híbrido es opcional y reversible sin tocar código.

export const WEBHOOK_SETTING_KEY = 'webhook_notificaciones_url';
const WEBHOOK_TIMEOUT_MS = 20000;

export async function getWebhookUrl() {
  try {
    const value = await notificacionesRepo.getSetting(WEBHOOK_SETTING_KEY);
    // Con fila en app_settings manda la fila (aunque esté vacía = desactivado); la env var es
    // solo el respaldo cuando nunca se configuró desde el panel.
    if (value === null || value === undefined) return process.env.WEBHOOK_NOTIFICACIONES_URL || null;
    return (typeof value === 'string' ? value : value?.url || value?.value) || null;
  } catch (err) {
    console.error(`[webhookN8n] no se pudo leer ${WEBHOOK_SETTING_KEY}:`, err.message);
    return process.env.WEBHOOK_NOTIFICACIONES_URL || null;
  }
}

// Lanza si n8n no acepta el webhook — el caller (dispatch.js attemptSend) lo convierte en
// una fila fallida de notificacion_log, igual que un envío in-process que falla.
export async function enviarWebhookNotificacion(url, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      const cuerpo = await response.text().catch(() => '');
      throw new Error(`n8n respondió ${response.status} ${cuerpo.slice(0, 200)}`);
    }
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`n8n no respondió en ${WEBHOOK_TIMEOUT_MS}ms (timeout)`);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// emails: [{ plantilla, to, cc, from, replyTo, subject, html }] ya renderizados.
export function payloadOrden({ orden, emails, telegramTexto, pdfUrl, pdfNombre }) {
  return {
    evento: 'orden_completada',
    marca: { nombre: 'Condor 360' },
    emails,
    telegram: { texto: telegramTexto },
    pdfs: pdfUrl ? [{ nombre: pdfNombre, url: pdfUrl }] : [],
    orden: {
      id: orden.id,
      numero: orden.numero_orden_display,
      clienteEmpresa: orden.cliente_empresa,
      clienteEmail: orden.cliente_email || null,
      total: Number(orden.total || 0),
    },
  };
}
