import * as notificacionesRepo from '../../repositories/notificacionesRepo.js';
import { enviarEmail, DEFAULT_FROM, getReplyTo, getCorreoInterno } from './resend.js';
import { enviarTelegram } from './telegram.js';
import {
  emailClienteDefault, emailInternoDefault, telegramDefault, getLogoUrlConFallback, ORDEN_EJEMPLO,
  trabajosRowsEmailCliente, trabajosRowsEmailInterno, trabajosTextoTelegram, personalTexto,
} from './defaultTemplates.js';
import { buildPdfFilename, formatFecha, formatHora, formatFechaHora } from '../pdf/template.js';
import { getWebhookUrl, enviarWebhookNotificacion, payloadOrden } from './webhookN8n.js';

// Orquesta los 3 mensajes de una orden completada: email al cliente, email interno
// (copia a alcantarilladoscondor@gmail.com) y Telegram interno. Ningún canal puede
// tumbar a otro (Promise.allSettled) y cada intento queda logueado en notificacion_log,
// éxito o fracaso, incluyendo el caso "canal inactivo o sin credenciales".

// Destino de la copia interna de cada orden: configurable desde Correos (app_settings.email_interno).
const CORREO_INTERNO_DEFAULT = 'alcantarilladoscondor@gmail.com';

// Lista blanca de variables soportadas por los overrides editables desde el admin
// (notification_templates.bloques / .asunto). Variable fuera de esta lista, o
// escrita mal, se deja tal cual como texto "{{x}}" — nunca revienta el render.
// Incluye TODO lo que los defaults de código renderizan desde la orden: si un dato de la orden
// no tuviera variable, al "Guardar" el default desde el admin quedaría congelado el valor de
// ORDEN_EJEMPLO (patente AB-CD-12, trabajos de ejemplo) en los mensajes reales (bug real de QA).
export const VARIABLE_WHITELIST = [
  'numero_orden', 'cliente_empresa', 'cliente_nombre', 'fecha', 'total',
  'direccion', 'comuna', 'pdf_url', 'tecnicos', 'estado',
  'patente', 'hora_inicio', 'hora_termino', 'descripcion', 'observaciones', 'metodo_pago',
  'garantia', 'cliente_email', 'cliente_telefono', 'orden_compra', 'requiere_factura',
  'trabajos_tabla_cliente', 'trabajos_tabla_interno', 'trabajos_texto', 'logo_url',
];

export function buildVariables(orden, { pdfUrl, logoUrl } = {}) {
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
    tecnicos: personalTexto(orden),
    estado: orden.estado || '',
    patente: orden.patente_vehiculo || '',
    hora_inicio: formatHora(orden.hora_inicio),
    hora_termino: formatHora(orden.hora_termino),
    descripcion: orden.descripcion_trabajo || '',
    observaciones: orden.observaciones || '',
    metodo_pago: orden.metodo_pago || '',
    garantia: orden.garantia || '',
    cliente_email: orden.cliente_email || '',
    cliente_telefono: orden.cliente_telefono || '',
    orden_compra: orden.orden_compra || '',
    requiere_factura: orden.requiere_factura === true ? 'Sí' : orden.requiere_factura === false ? 'No' : '',
    trabajos_tabla_cliente: trabajosRowsEmailCliente(orden.trabajos),
    trabajos_tabla_interno: trabajosRowsEmailInterno(orden.trabajos),
    trabajos_texto: trabajosTextoTelegram(orden.trabajos),
    logo_url: logoUrl || '',
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
export async function renderPlantilla(templateKey, orden, ctx = {}, defaultFn = DEFAULT_RENDERERS[templateKey]) {
  // logoUrl siempre resuelto acá (configurado en el admin o el fallback hardcodeado) —
  // así ningún caller (dispatch real, preview, enviar-prueba, buildDefaultEditable) se
  // olvida de pasarlo y el logo nunca queda roto en un email.
  const logoUrl = ctx.logoUrl || (await getLogoUrlConFallback());
  const fullCtx = { ...ctx, logoUrl };
  const fallback = defaultFn(orden, fullCtx);
  let override = null;
  try {
    override = await notificacionesRepo.getTemplate(templateKey);
  } catch (err) {
    console.error(`[notificaciones] no se pudo leer override de "${templateKey}", uso default:`, err.message);
  }

  if (!override || override.activo === false) return fallback;

  const vars = buildVariables(orden, fullCtx);
  const asunto = override.asunto ? substituteVariables(override.asunto, vars) : fallback.subject;
  const html = override.bloques && override.bloques.length > 0 ? renderBloques(override.bloques, vars) : fallback.html;
  const text = override.bloques && override.bloques.length > 0 ? renderBloques(override.bloques, vars) : fallback.text;

  return { subject: asunto, html, text };
}

// Convierte el resultado de un default de código (renderizado sobre una orden real o
// de ejemplo) en una plantilla "editable": cada valor de `vars` que aparece tal cual en
// el texto se reemplaza por su token {{var}}. Así, lo que el admin ve al abrir el editor
// -y lo que guardaría si presiona "Guardar" sin tocar nada- sigue siendo dinámico para
// los campos soportados, en vez de quedar una foto congelada de una sola orden.
export function templatizarConVariables(text, vars) {
  if (!text) return text || '';
  const entries = Object.entries(vars)
    .filter(([, value]) => value != null && String(value).length >= 2)
    .sort((a, b) => String(b[1]).length - String(a[1]).length);
  let out = text;
  for (const [key, value] of entries) {
    out = out.split(String(value)).join(`{{${key}}}`);
  }
  return out;
}

// Arma la representación editable del default de código de un template, para que
// GET /api/admin/plantillas nunca muestre el editor vacío cuando no hay override
// guardado. Se renderiza sobre ORDEN_EJEMPLO (no depende de que exista una orden real
// en la base — importante en una base recién migrada) y se templatiza con las variables
// soportadas por el editor.
export async function buildDefaultEditable(templateKey) {
  const defaultFn = DEFAULT_RENDERERS[templateKey];
  if (!defaultFn) return { asunto: null, bloques: [] };

  const logoUrl = await getLogoUrlConFallback();
  const ctx = { pdfUrl: 'https://ejemplo.condoralcantarillados.cl/OT-00123.pdf', logoUrl };
  const rendered = defaultFn(ORDEN_EJEMPLO, ctx);
  const vars = buildVariables(ORDEN_EJEMPLO, ctx);

  const asunto = rendered.subject ? templatizarConVariables(rendered.subject, vars) : null;
  const cuerpo = templatizarConVariables(rendered.html || rendered.text, vars);

  return { asunto, bloques: cuerpo ? [cuerpo] : [] };
}

async function getDevRedirect() {
  try {
    const value = await notificacionesRepo.getSetting('email_dev_redirect');
    // Fila presente (aunque vacía) manda sobre la env var: vaciar el campo desde el panel apaga
    // la redirección de verdad.
    if (value === null || value === undefined) return process.env.EMAIL_DEV_REDIRECT || null;
    return (typeof value === 'string' ? value : value?.email || value?.value) || null;
  } catch (err) {
    console.error('[notificaciones] no se pudo leer email_dev_redirect:', err.message);
    return process.env.EMAIL_DEV_REDIRECT || null;
  }
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

  // MODO DESARROLLO: con app_settings 'email_dev_redirect' (o env EMAIL_DEV_REDIRECT), TODOS
  // los correos —cliente e interno— van a esa casilla, con el destinatario real anotado en
  // el asunto. Telegram no se redirige. Borrar el setting/env al pasar a producción real.
  const CORREO_INTERNO = await getCorreoInterno();
  const devRedirect = await getDevRedirect();
  const clienteEmail = devRedirect && orden.cliente_email ? devRedirect : orden.cliente_email;
  const correoInterno = devRedirect || CORREO_INTERNO;
  const ccCliente = devRedirect ? null : CORREO_INTERNO;
  if (devRedirect) {
    emailCliente.subject = `[DEV → ${orden.cliente_email}] ${emailCliente.subject}`;
    emailInterno.subject = `[DEV → ${CORREO_INTERNO}] ${emailInterno.subject}`;
  }

  // MODO HÍBRIDO (ver webhookN8n.js): con webhook configurado, n8n entrega los 3 mensajes.
  // Un solo POST, pero se registra una fila de notificacion_log por mensaje para que el
  // historial del admin se vea igual que en el envío in-process.
  const webhookUrl = await getWebhookUrl();
  if (webhookUrl) {
    let remitente = {};
    try {
      remitente = (await notificacionesRepo.getChannel('resend'))?.config || {};
    } catch (err) {
      console.error('[notificaciones] no se pudo leer config de Resend, uso remitente default:', err.message);
    }
    const from = remitente.fromEmail || DEFAULT_FROM;
    const replyTo = await getReplyTo();

    const emails = [];
    if (clienteEmail) {
      emails.push({ plantilla: 'email_cliente', to: clienteEmail, cc: ccCliente, from, replyTo, subject: emailCliente.subject, html: emailCliente.html });
    }
    emails.push({ plantilla: 'email_interno', to: correoInterno, cc: null, from, replyTo, subject: emailInterno.subject, html: emailInterno.html });

    const payload = payloadOrden({ orden, emails, telegramTexto: telegramMsg.text, pdfUrl, pdfNombre: buildPdfFilename(orden) });
    let error = null;
    try {
      await enviarWebhookNotificacion(webhookUrl, payload);
    } catch (err) {
      error = err;
    }
    const entrega = () => {
      if (error) throw error;
    };
    return Promise.all([
      clienteEmail
        ? attemptSend(orden.id, 'resend', 'email_cliente', clienteEmail, entrega)
        : attemptSend(orden.id, 'resend', 'email_cliente', null, () => {
            throw new Error('Orden sin email de cliente registrado');
          }),
      attemptSend(orden.id, 'resend', 'email_interno', correoInterno, entrega),
      attemptSend(orden.id, 'telegram', 'telegram_ot', 'telegram', entrega),
    ]);
  }

  const attachments =
    pdfBuffer && Buffer.isBuffer(pdfBuffer)
      ? [{ filename: buildPdfFilename(orden), content: pdfBuffer.toString('base64') }]
      : undefined;

  const results = await Promise.allSettled([
    clienteEmail
      ? attemptSend(orden.id, 'resend', 'email_cliente', clienteEmail, () =>
          enviarEmail({ to: clienteEmail, cc: ccCliente, subject: emailCliente.subject, html: emailCliente.html, attachments })
        )
      : attemptSend(orden.id, 'resend', 'email_cliente', null, () => {
          throw new Error('Orden sin email de cliente registrado');
        }),
    attemptSend(orden.id, 'resend', 'email_interno', correoInterno, () =>
      enviarEmail({ to: correoInterno, subject: emailInterno.subject, html: emailInterno.html, attachments })
    ),
    attemptSend(orden.id, 'telegram', 'telegram_ot', 'telegram', () => enviarTelegram({ text: telegramMsg.text })),
  ]);

  return results.map((r) => (r.status === 'fulfilled' ? r.value : { ok: false, error: r.reason?.message || String(r.reason) }));
}
