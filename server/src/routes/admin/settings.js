import { Router } from 'express';
import * as notificacionesRepo from '../../repositories/notificacionesRepo.js';
import * as auditRepo from '../../repositories/auditRepo.js';
import { adminAuthMiddleware } from '../../middleware/adminAuth.js';
import { requireRole } from '../../middleware/requireRole.js';

const router = Router();

router.use(adminAuthMiddleware, requireRole('admin'));

// GET /api/admin/settings/subscription — estado del kill switch de suscripción
router.get('/subscription', async (_req, res, next) => {
  try {
    const status = await notificacionesRepo.getSubscriptionStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/settings/subscription — kill switch (requiere confirmación escrita
// "SUSPENDER" en el frontend antes de llamar acá) — queda registrado en audit_log.
router.put('/subscription', async (req, res, next) => {
  try {
    const { active, message } = req.body || {};
    if (typeof active !== 'boolean') {
      return res.status(400).json({ success: false, error: 'active (boolean) es requerido' });
    }
    await notificacionesRepo.setSubscriptionActive(active, message, req.admin?.id || null);

    await auditRepo.registrar({
      adminUserId: req.admin?.id,
      accion: active ? 'reactivar_suscripcion' : 'suspender_suscripcion',
      entidad: 'app_settings',
      entidadId: 'subscription_active',
      detalle: { active, message },
    }).catch((err) => console.error('[admin/settings] no se pudo registrar auditoría de kill switch:', err.message));

    res.json({ success: true, data: { active: !!active, message: message || null } });
  } catch (err) {
    next(err);
  }
});

export default router;
