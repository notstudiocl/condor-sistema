import { Router } from 'express';
import * as notificacionesRepo from '../../repositories/notificacionesRepo.js';
import * as auditRepo from '../../repositories/auditRepo.js';
import { adminAuthMiddleware } from '../../middleware/adminAuth.js';
import { requireRole, requireNotstudio } from '../../middleware/requireRole.js';
import { uploadBuffer, buildPublicUrl } from '../../services/storage/r2.js';
import { WEBHOOK_SETTING_KEY } from '../../services/notifications/webhookN8n.js';

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
    // La key es fija (se pisa el logo anterior): sin cache-buster, el panel y los clientes de correo
    // seguían mostrando el logo viejo cacheado por URL (bug real de QA).
    const url = `${buildPublicUrl(LOGO_KEY)}?v=${Date.now()}`;
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

// Integraciones (webhook de n8n): exclusivas de NotStudio — 404 para cualquier otro rol.
// GET /api/admin/settings/webhook-notificaciones — URL del webhook de n8n (modo híbrido).
// `envFallback` avisa si hay una env var que seguiría activa aunque se borre el setting.
router.get('/webhook-notificaciones', requireNotstudio, async (_req, res, next) => {
  try {
    const value = await notificacionesRepo.getSetting(WEBHOOK_SETTING_KEY);
    const url = typeof value === 'string' ? value : value?.url || value?.value || null;
    res.json({ success: true, data: { url, envFallback: Boolean(process.env.WEBHOOK_NOTIFICACIONES_URL) } });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/settings/webhook-notificaciones — { url } (vacío/null = volver al envío
// directo desde el backend con las credenciales de Resend/Telegram).
router.put('/webhook-notificaciones', requireNotstudio, async (req, res, next) => {
  try {
    const url = String(req.body?.url || '').trim();
    if (url && !/^https:\/\/\S+$/i.test(url)) {
      return res.status(400).json({ success: false, error: 'La URL del webhook debe comenzar con https://' });
    }
    await notificacionesRepo.setSetting(WEBHOOK_SETTING_KEY, { url: url || null }, req.admin?.id || null);

    auditRepo
      .registrar({
        adminUserId: req.admin?.id,
        accion: 'actualizar_webhook_notificaciones',
        entidad: 'app_settings',
        entidadId: WEBHOOK_SETTING_KEY,
        detalle: { url: url || null },
      })
      .catch((err) => console.error('[admin/settings] no se pudo registrar auditoría del webhook:', err.message));

    res.json({ success: true, data: { url: url || null } });
  } catch (err) {
    next(err);
  }
});

// Configuración General — SOLO notstudio (404 para el resto). Kill switch operativo, webhook de
// n8n y redirección de correos en modo desarrollo. Todo vive en app_settings; las env vars de
// EasyPanel quedan solo como fallback cuando no hay fila.
const GENERAL_KEYS = {
  subscription_active: { tipo: 'boolean', env: 'SUBSCRIPTION_ACTIVE' },
  subscription_message: { tipo: 'texto', env: 'SUBSCRIPTION_MESSAGE' },
  webhook_notificaciones_url: { tipo: 'url', env: 'WEBHOOK_NOTIFICACIONES_URL' },
  email_dev_redirect: { tipo: 'email', env: 'EMAIL_DEV_REDIRECT' },
};

function desenvolver(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v.value ?? v.url ?? v.email ?? null;
  return v ?? null;
}

router.get('/general', requireNotstudio, async (_req, res, next) => {
  try {
    const data = {};
    for (const [key, meta] of Object.entries(GENERAL_KEYS)) {
      const enDb = desenvolver(await notificacionesRepo.getSetting(key));
      const env = process.env[meta.env];
      let valor = enDb;
      if (valor === null && env !== undefined) valor = meta.tipo === 'boolean' ? env !== 'false' : env;
      if (meta.tipo === 'boolean') valor = valor === null ? true : valor !== false && valor !== 'false';
      data[key] = { value: valor, desdeEnv: enDb === null && env !== undefined };
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.put('/general', requireNotstudio, async (req, res, next) => {
  try {
    const body = req.body || {};
    const cambios = {};
    for (const [key, meta] of Object.entries(GENERAL_KEYS)) {
      if (!(key in body)) continue;
      let v = body[key];
      if (meta.tipo === 'boolean') v = v === true || v === 'true';
      else {
        v = String(v ?? '').trim() || null;
        if (v && meta.tipo === 'url' && !/^https:\/\/\S+$/i.test(v)) return res.status(400).json({ success: false, error: 'La URL del webhook debe comenzar con https://' });
        if (v && meta.tipo === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return res.status(400).json({ success: false, error: 'Correo de redirección inválido' });
      }
      await notificacionesRepo.setSetting(key, { value: v }, req.admin?.id || null);
      cambios[key] = v;
    }
    auditRepo
      .registrar({ adminUserId: req.admin?.id, accion: 'configuracion_general', entidad: 'app_settings', entidadId: 'general', detalle: cambios })
      .catch((err) => console.error('[admin/settings] auditoría general:', err.message));
    res.json({ success: true, data: cambios });
  } catch (err) {
    next(err);
  }
});

export default router;
