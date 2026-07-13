import { Router } from 'express';
import * as notificacionesRepo from '../../repositories/notificacionesRepo.js';
import * as ordenesRepo from '../../repositories/ordenesRepo.js';
import { buildPublicUrl } from '../../services/storage/r2.js';
import { enviarEmail } from '../../services/notifications/resend.js';
import { enviarTelegram } from '../../services/notifications/telegram.js';
import { renderPlantilla, VARIABLE_WHITELIST, buildVariables } from '../../services/notifications/dispatch.js';
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

// GET /api/admin/plantillas — las 3 plantillas, marcando cuáles tienen override
router.get('/', adminAuthMiddleware, async (_req, res, next) => {
  try {
    const overrides = await Promise.all(TEMPLATE_KEYS.map((key) => notificacionesRepo.getTemplate(key)));
    res.json({
      success: true,
      data: TEMPLATE_KEYS.map((key, i) => ({
        templateKey: key,
        tieneOverride: !!overrides[i],
        asunto: overrides[i]?.asunto ?? null,
        bloques: overrides[i]?.bloques ?? [],
        activo: overrides[i]?.activo ?? true,
        updatedBy: overrides[i]?.updated_by ?? null,
        updatedAt: overrides[i]?.updated_at ?? null,
      })),
      variablesDisponibles: VARIABLE_WHITELIST,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/plantillas/:key
router.get('/:key', adminAuthMiddleware, validarTemplateKey, async (req, res, next) => {
  try {
    const override = await notificacionesRepo.getTemplate(req.params.key);
    res.json({
      success: true,
      data: {
        templateKey: req.params.key,
        tieneOverride: !!override,
        asunto: override?.asunto ?? null,
        bloques: override?.bloques ?? [],
        activo: override?.activo ?? true,
        updatedBy: override?.updated_by ?? null,
        updatedAt: override?.updated_at ?? null,
      },
      variablesDisponibles: VARIABLE_WHITELIST,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/plantillas/:key — crea/actualiza el override (oficina y admin pueden editar plantillas)
router.put('/:key', adminAuthMiddleware, validarTemplateKey, async (req, res, next) => {
  try {
    const { asunto, bloques, activo } = req.body || {};
    const saved = await notificacionesRepo.upsertTemplate({
      templateKey: req.params.key,
      asunto: asunto ?? null,
      bloques: Array.isArray(bloques) ? bloques : [],
      activo: activo !== false,
      updatedBy: req.admin?.id || null,
    });
    res.json({ success: true, data: saved });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/plantillas/:key — vuelve al default de código (borra el override)
router.delete('/:key', adminAuthMiddleware, validarTemplateKey, async (req, res, next) => {
  try {
    await notificacionesRepo.eliminarTemplateOverride(req.params.key);
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

    if (templateKey === 'telegram_ot') {
      const result = await enviarTelegram({ text: render.text });
      return res.json({ success: true, data: result });
    }

    const to = destinatario || orden.cliente_email;
    if (!to) return res.status(400).json({ success: false, error: 'Falta "destinatario" (la orden de prueba no tiene email de cliente)' });
    const result = await enviarEmail({ to, subject: `[PRUEBA] ${render.subject}`, html: render.html });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(502).json({ success: false, error: err.message });
  }
});

export default router;
