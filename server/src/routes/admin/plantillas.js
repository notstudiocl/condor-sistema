import { Router } from 'express';
import * as auditRepo from '../../repositories/auditRepo.js';
import * as notificacionesRepo from '../../repositories/notificacionesRepo.js';
import * as ordenesRepo from '../../repositories/ordenesRepo.js';
import { buildPublicUrl } from '../../services/storage/r2.js';
import { enviarCorreoSistema } from '../../services/notifications/correoSistema.js';
import { getWebhookUrl, enviarWebhookNotificacion } from '../../services/notifications/webhookN8n.js';
import { enviarTelegram } from '../../services/notifications/telegram.js';
import { renderPlantilla, VARIABLE_WHITELIST, buildVariables, buildDefaultEditable } from '../../services/notifications/dispatch.js';
import { adminAuthMiddleware } from '../../middleware/adminAuth.js';
import { requireRole } from '../../middleware/requireRole.js';

const router = Router();
const TEMPLATE_KEYS = ['email_cliente', 'email_interno', 'telegram_ot'];

function validarTemplateKey(req, res, next) {
  if (!TEMPLATE_KEYS.includes(req.params.key)) {
    return res.status(400).json({ success: false, error: `template_key inválido. Use uno de: ${TEMPLATE_KEYS.join(', ')}` });
  }
  next();
}

async function ordenDePrueba(ordenId) {
  if (ordenId) {
    const orden = await ordenesRepo.getOrdenById(ordenId);
    if (orden) return orden;
  }
  // Sin ordenId (o no encontrada) -> la más reciente, para que "preview" siempre funcione.
  const { ordenes } = await ordenesRepo.listOrdenesAdmin({ page: 1, limit: 1 });
  if (!ordenes[0]) return null;
  return ordenesRepo.getOrdenById(ordenes[0].id);
}

function pdfUrlDeOrden(orden) {
  const pdfFoto = (orden.fotos || []).find((f) => f.tipo === 'pdf');
  return pdfFoto ? buildPublicUrl(pdfFoto.r2_key) : null;
}

// Arma la respuesta de un template: el override guardado si existe, o si no el default
// de código ya "templatizado" (buildDefaultEditable) — el editor del admin nunca debe
// mostrarse vacío, con o sin override.
async function plantillaResponse(templateKey, override) {
  if (override) {
    return {
      templateKey,
      tieneOverride: true,
      asunto: override.asunto ?? null,
      bloques: override.bloques ?? [],
      activo: override.activo ?? true,
      updatedBy: override.updated_by ?? null,
      updatedAt: override.updated_at ?? null,
    };
  }
  const def = await buildDefaultEditable(templateKey);
  return {
    templateKey,
    tieneOverride: false,
    asunto: def.asunto,
    bloques: def.bloques,
    activo: true,
    updatedBy: null,
    updatedAt: null,
  };
}

// GET /api/admin/plantillas — las 3 plantillas, marcando cuáles tienen override
router.get('/', adminAuthMiddleware, async (_req, res, next) => {
  try {
    const overrides = await Promise.all(TEMPLATE_KEYS.map((key) => notificacionesRepo.getTemplate(key)));
    const data = await Promise.all(TEMPLATE_KEYS.map((key, i) => plantillaResponse(key, overrides[i])));
    res.json({ success: true, data, variablesDisponibles: VARIABLE_WHITELIST });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/plantillas/:key
router.get('/:key', adminAuthMiddleware, validarTemplateKey, async (req, res, next) => {
  try {
    const override = await notificacionesRepo.getTemplate(req.params.key);
    const data = await plantillaResponse(req.params.key, override);
    res.json({ success: true, data, variablesDisponibles: VARIABLE_WHITELIST });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/plantillas/:key — crea/actualiza el override (oficina y admin pueden editar plantillas)
router.put('/:key', adminAuthMiddleware, validarTemplateKey, async (req, res, next) => {
  try {
    const { asunto, bloques, activo } = req.body || {};
    const bloquesLimpios = (Array.isArray(bloques) ? bloques : []).filter((b) => String(typeof b === 'string' ? b : b?.content || '').trim());
    if (bloquesLimpios.length === 0) {
      return res.status(400).json({ success: false, error: 'La plantilla necesita al menos un bloque con contenido. Usa "Restaurar default" para volver al mensaje original.' });
    }
    const saved = await notificacionesRepo.upsertTemplate({
      templateKey: req.params.key,
      asunto: asunto ?? null,
      bloques: bloquesLimpios,
      activo: activo !== false,
      updatedBy: req.admin?.id || null,
    });
    auditRepo.registrar({ adminUserId: req.admin?.id, accion: 'guardar_plantilla', entidad: 'notification_templates', entidadId: req.params.key, detalle: { asunto: asunto ?? null, bloques: bloquesLimpios.length } })
      .catch((err) => console.error('[admin/plantillas] auditoría:', err.message));
    res.json({ success: true, data: saved });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/plantillas/:key — vuelve al default de código (borra el override)
router.delete('/:key', adminAuthMiddleware, validarTemplateKey, async (req, res, next) => {
  try {
    await notificacionesRepo.eliminarTemplateOverride(req.params.key);
    auditRepo.registrar({ adminUserId: req.admin?.id, accion: 'restaurar_plantilla', entidad: 'notification_templates', entidadId: req.params.key, detalle: null })
      .catch((err) => console.error('[admin/plantillas] auditoría:', err.message));
    res.json({ success: true, data: { templateKey: req.params.key, tieneOverride: false } });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/plantillas/preview — { templateKey, ordenId? } -> subject/html/text
// renderizados con una orden real (override si existe, default de código si no).
router.post('/preview', adminAuthMiddleware, async (req, res, next) => {
  try {
    const { templateKey, ordenId } = req.body || {};
    if (!TEMPLATE_KEYS.includes(templateKey)) {
      return res.status(400).json({ success: false, error: `templateKey inválido. Use uno de: ${TEMPLATE_KEYS.join(', ')}` });
    }
    const orden = await ordenDePrueba(ordenId);
    if (!orden) return res.status(404).json({ success: false, error: 'No hay ninguna orden disponible para previsualizar' });

    const ctx = { pdfUrl: pdfUrlDeOrden(orden) };
    const render = await renderPlantilla(templateKey, orden, ctx);

    res.json({
      success: true,
      data: { ...render, ordenId: orden.id, numeroOrden: orden.numero_orden_display, variables: buildVariables(orden, ctx) },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/plantillas/enviar-prueba — { templateKey, ordenId?, destinatario? }
// Renderiza igual que preview, pero además lo envía DE VERDAD por el canal correspondiente
// (email_cliente/email_interno -> Resend; telegram_ot -> Telegram). No se loguea en
// notificacion_log — es una prueba manual del admin, no un envío de negocio.
router.post('/enviar-prueba', adminAuthMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { templateKey, ordenId, destinatario } = req.body || {};
    if (!TEMPLATE_KEYS.includes(templateKey)) {
      return res.status(400).json({ success: false, error: `templateKey inválido. Use uno de: ${TEMPLATE_KEYS.join(', ')}` });
    }
    const orden = await ordenDePrueba(ordenId);
    if (!orden) return res.status(404).json({ success: false, error: 'No hay ninguna orden disponible para la prueba' });

    const ctx = { pdfUrl: pdfUrlDeOrden(orden) };
    const render = await renderPlantilla(templateKey, orden, ctx);

    // Mismo camino que el envío real: webhook de n8n si está configurado, in-process si no.
    // Antes usaba Resend/Telegram directo y fallaba siempre en producción, donde las
    // credenciales viven en n8n y notification_channels está vacío (bug real de QA).
    const webhookUrl = await getWebhookUrl();
    if (templateKey === 'telegram_ot') {
      if (webhookUrl) {
        await enviarWebhookNotificacion(webhookUrl, { evento: 'prueba', marca: { nombre: 'Condor 360' }, emails: [], telegram: { texto: `[PRUEBA] ${render.text}` }, pdfs: [] });
        return res.json({ success: true, data: { via: 'n8n' } });
      }
      const result = await enviarTelegram({ text: `[PRUEBA] ${render.text}` });
      return res.json({ success: true, data: result });
    }

    const to = destinatario || orden.cliente_email;
    if (!to) return res.status(400).json({ success: false, error: 'Falta "destinatario" (la orden de prueba no tiene email de cliente)' });
    await enviarCorreoSistema({ to, subject: `[PRUEBA] ${render.subject}`, html: render.html });
    res.json({ success: true, data: { via: webhookUrl ? 'n8n' : 'resend' } });
  } catch (err) {
    // 500 y no 502: el proxy de EasyPanel reemplaza los 502 por su propia página HTML sin CORS
    // y la UI solo veía "No se pudo conectar con el servidor" (bug real de QA).
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
