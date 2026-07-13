import { Router } from 'express';
import * as notificacionesRepo from '../../repositories/notificacionesRepo.js';
import * as auditRepo from '../../repositories/auditRepo.js';
import { adminAuthMiddleware } from '../../middleware/adminAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { uploadBuffer, buildPublicUrl } from '../../services/storage/r2.js';

// Configuración operativa editable desde el admin. El kill switch de suscripción NO
// vive acá — quedó a propósito en variables de entorno de EasyPanel, fuera del alcance
// de ambas apps (ver middleware/subscriptionGate.js).

const router = Router();

router.use(adminAuthMiddleware, requireRole('admin'));

const LOGO_KEY = 'branding/logo.png';
const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2MB
const LOGO_SETTING_KEY = 'logo_email_url';

function parseImagenBase64(imageBase64) {
  const match = /^data:image\/(\w+);base64,(.+)$/.exec(imageBase64 || '');
  if (!match) return null;
  const subtype = match[1].toLowerCase();
  const contentType = `image/${subtype === 'jpg' ? 'jpeg' : subtype}`;
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0) return null;
  return { buffer, contentType };
}

// GET /api/admin/settings/logo — URL pública del logo configurado (null si nunca se subió
// nada, en cuyo caso los correos usan el logo hardcodeado de defaultTemplates.js).
router.get('/logo', async (_req, res, next) => {
  try {
    const value = await notificacionesRepo.getSetting(LOGO_SETTING_KEY);
    const url = typeof value === 'string' ? value : value?.url || null;
    res.json({ success: true, data: { url } });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/settings/logo — { imageBase64: 'data:image/png;base64,...' } (máx 2MB).
// Sube a R2 bajo una key fija (se pisa el logo anterior) y guarda la URL pública resultante
// en app_settings — dispatch.js/defaultTemplates.js la leen en cada envío, con fallback al
// logo hardcodeado si nunca se configuró nada.
router.post('/logo', async (req, res, next) => {
  try {
    const { imageBase64 } = req.body || {};
    const parsed = parseImagenBase64(imageBase64);
    if (!parsed) {
      return res.status(400).json({ success: false, error: 'imageBase64 debe ser un data URI de imagen válido (png/jpg/webp)' });
    }
    if (parsed.buffer.length > LOGO_MAX_BYTES) {
      return res.status(400).json({ success: false, error: 'La imagen supera el máximo de 2MB' });
    }

    await uploadBuffer(LOGO_KEY, parsed.buffer, parsed.contentType);
    const url = buildPublicUrl(LOGO_KEY);
    await notificacionesRepo.setSetting(LOGO_SETTING_KEY, { url }, req.admin?.id || null);

    auditRepo
      .registrar({
        adminUserId: req.admin?.id,
        accion: 'actualizar_logo_email',
        entidad: 'app_settings',
        entidadId: LOGO_SETTING_KEY,
        detalle: { url },
      })
      .catch((err) => console.error('[admin/settings] no se pudo registrar auditoría del logo:', err.message));

    res.json({ success: true, data: { url } });
  } catch (err) {
    next(err);
  }
});

export default router;
