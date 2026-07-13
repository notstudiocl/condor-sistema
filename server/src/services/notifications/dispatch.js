import * as notificacionesRepo from '../../repositories/notificacionesRepo.js';
import { enviarEmail } from './resend.js';
import { enviarTelegram } from './telegram.js';
import { emailClienteDefault, emailInternoDefault, telegramDefault } from './defaultTemplates.js';
import { buildPdfFilename, formatFecha } from '../pdf/template.js';

// Orquesta los 3 mensajes de una orden completada: email al cliente, email interno
// (copia a alcantarilladoscondor@gmail.com) y Telegram interno. Ningún canal puede
// tumbar a otro (Promise.allSettled) y cada intento queda logueado en notificacion_log,
// éxito o fracaso, incluyendo el caso "canal inactivo o sin credenciales".

const CORREO_INTERNO = 'alcantarilladoscondor@gmail.com';

// Lista blanca de variables soportadas por los overrides editables desde el admin
// (notification_templates.bloques / .asunto). Variable fuera de esta lista, o
// escrita mal, se deja tal cual como texto "{{x}}" — nunca revienta el render.
export const VARIABLE_WHITELIST = [
  'numero_orden', 'cliente_empresa', 'cliente_nombre', 'fecha', 'total',
  'direccion', 'comuna', 'pdf_url', 'tecnicos', 'estado',
];

export function buildVariables(orden, { pdfUrl } = {}) {
  const total = Number(orden.total || 0);
  return {
    numero_orden: orden.numero_orden_display || '',
    cliente_empresa: orden.cliente_empresa || '',
    cliente_nombre: orden.supervisor || orden.cliente?.nombre || '',
    fecha: formatFecha(orden.fecha),
    total: `$${total.toLocaleString('es-CL')}`,
    direccion: orden.direccion || '',
    comuna: orden.comuna || '',
    pdf_url: pdfUrl || '',
    tecnicos: (orden.empleados || []).map((e) => e.nombre).filter(Boolean).join(', '),
    estado: orden.estado || '',
  };
}

export function substituteVariables(text, vars) {
  if (!text) return text || '';
  return text.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (match, key) => {
    if (VARIABLE_WHITELIST.includes(key) && Object.prototype.hasOwnProperty.call(vars, key)) {
      return vars[key] ?? '';
    }
    return match; // desconocida -> se deja tal cual, nunca truena
  });
}

// `bloques`: array de bloques del editor del admin. Cada bloque es un string de
// HTML/texto (o { content } por si el editor evoluciona a objetos con más metadata);
// se concatenan en orden y se sustituyen las variables.
function renderBloques(bloques, vars) {
  return (bloques || [])
    .map((b) => substituteVariables(typeof b === 'string' ? b : b?.content || '', vars))
    .join('\n');
}

const DEFAULT_RENDERERS = {
  email_cliente: emailClienteDefault,
  email_interno: emailInternoDefault,
  telegram_ot: telegramDefault,
};

// Exportado para que routes/admin/plantillas.js reuse EXACTAMENTE la misma lógica de
// override-o-default en preview/enviar-prueba (nunca debe divergir del envío real).
export async function renderPlantilla(templateKey, orden, ctx, defaultFn = DEFAULT_RENDERERS[templateKey]) {
  const fallback = defaultFn(orden, ctx);
  let override = null;
  try {
    override = await notificacionesRepo.getTemplate(templateKey);
  } catch (err) {
    console.error(`[notificaciones] no se pudo leer override de "${templateKey}", uso default:`, err.message);
  }

  if (!override || override.activo === false) return fallback;

  const vars = buildVariables(orden, ctx);
  const asunto = override.asunto ? substituteVariables(override.asunto, vars) : fallback.subject;
  const html = override.bloques && override.bloques.length > 0 ? renderBloques(override.bloques, vars) : fallback.html;
  const text = override.bloques && override.bloques.length > 0 ? renderBloques(override.bloques, vars) : fallback.text;

  return { subject: asunto, html, text };
}

async function attemptSend(ordenId, canal, plantilla, destinatario, sendFn) {
  let ok = false;
  let error = null;
  try {
    await sendFn();
    ok = true;
  } catch (err) {
    error = (err?.message || String(err)).slice(0, 500);
  }
  try {
    await notificacionesRepo.logNotificacion({ ordenId, canal, plantilla, destinatario, ok, error });
  } catch (logErr) {
    console.error(`[notificaciones] no se pudo registrar notificacion_log para ${canal}/${plantilla}:`, logErr.message);
  }
  return { canal, plantilla, ok, error };
}

/**
 * Dispara las 3 notificaciones de una orden ya completada. Nunca lanza: cada canal
 * se intenta y se loguea de forma independiente. Devuelve un resumen para quien
 * quiera inspeccionar el resultado (p.ej. reenviarNotificacionesOrden).
 */
export async function dispatchNotificaciones(orden, { pdfUrl, pdfBuffer } = {}) {
  const ctx = { pdfUrl };

  const [emailCliente, emailInterno, telegramMsg] = await Promise.all([
    renderPlantilla('email_cliente', orden, ctx, emailClienteDefault),
    renderPlantilla('email_interno', orden, ctx, emailInternoDefault),
    renderPlantilla('telegram_ot', orden, ctx, telegramDefault),
  ]);

  const attachments =
    pdfBuffer && Buffer.isBuffer(pdfBuffer)
      ? [{ filename: buildPdfFilename(orden), content: pdfBuffer.toString('base64') }]
      : undefined;

  const clienteEmail = orden.cliente_email;

  const results = await Promise.allSettled([
    clienteEmail
      ? attemptSend(orden.id, 'resend', 'email_cliente', clienteEmail, () =>
          enviarEmail({ to: clienteEmail, cc: CORREO_INTERNO, subject: emailCliente.subject, html: emailCliente.html, attachments })
        )
      : attemptSend(orden.id, 'resend', 'email_cliente', null, () => {
          throw new Error('Orden sin email de cliente registrado');
        }),
    attemptSend(orden.id, 'resend', 'email_interno', CORREO_INTERNO, () =>
      enviarEmail({ to: CORREO_INTERNO, subject: emailInterno.subject, html: emailInterno.html, attachments })
    ),
    attemptSend(orden.id, 'telegram', 'telegram_ot', 'telegram', () => enviarTelegram({ text: telegramMsg.text })),
  ]);

  return results.map((r) => (r.status === 'fulfilled' ? r.value : { ok: false, error: r.reason?.message || String(r.reason) }));
}
