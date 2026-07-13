import { Router } from 'express';
import * as notificacionesRepo from '../../repositories/notificacionesRepo.js';
import { enviarEmail } from '../../services/notifications/resend.js';
import { enviarTelegram } from '../../services/notifications/telegram.js';
import { adminAuthMiddleware } from '../../middleware/adminAuth.js';
import { requireRole } from '../../middleware/requireRole.js';

const router = Router();
const CANALES_VALIDOS = ['resend', 'telegram'];

function maskSecret(secret) {
  if (!secret) return null;
  if (secret.length <= 7) return '••••';
  return `${secret.slice(0, 3)}••••${secret.slice(-4)}`;
}

function validarCanal(req, res, next) {
  if (!CANALES_VALIDOS.includes(req.params.canal)) {
    return res.status(400).json({ success: false, error: `Canal inválido. Use uno de: ${CANALES_VALIDOS.join(', ')}` });
  }
  next();
}

// GET /api/admin/notificaciones/log — historial de envíos (email/telegram), filtrable.
// oficina y admin pueden ver el historial (a diferencia de la config de canales, que
// es solo-admin) — reenviar una fila fallida se hace con POST /api/admin/ordenes/:id/reenviar.
router.get('/log', adminAuthMiddleware, async (req, res, next) => {
  try {
    const { page, limit, canal, soloFallidas } = req.query;
    const result = await notificacionesRepo.listLog({
      page: Math.max(1, Number(page) || 1),
      limit: Math.min(200, Math.max(1, Number(limit) || 50)),
      canal: canal || undefined,
      soloFallidas: soloFallidas === 'true' || soloFallidas === '1',
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/notificaciones — estado de los 2 canales (para la pantalla Configuración)
router.get('/', adminAuthMiddleware, requireRole('admin'), async (_req, res, next) => {
  try {
    const channels = await notificacionesRepo.listChannels();
    res.json({ success: true, data: channels.map((c) => ({ canal: c.canal, activo: c.activo, config: c.config, secretLast4: c.secret_last4, updatedAt: c.updated_at })) });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/notificaciones/:canal — detalle con secreto SIEMPRE enmascarado (re_••••3kFa)
router.get('/:canal', adminAuthMiddleware, requireRole('admin'), validarCanal, async (req, res, next) => {
  try {
    const { canal } = req.params;
    const channel = await notificacionesRepo.getChannel(canal);
    if (!channel) {
      return res.json({ success: true, data: { canal, activo: false, config: {}, secretMask: null, updatedAt: null } });
    }

    let secretMask = null;
    try {
      const decrypted = await notificacionesRepo.getDecryptedSecret(canal);
      if (decrypted?.secret) secretMask = maskSecret(decrypted.secret);
    } catch (err) {
      console.error(`[admin/notificaciones] no se pudo generar máscara para "${canal}":`, err.message);
    }

    res.json({
      success: true,
      data: {
        canal: channel.canal,
        activo: channel.activo,
        config: channel.config,
        secretMask,
        updatedBy: channel.updated_by,
        updatedAt: channel.updated_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/notificaciones/:canal — activo/config siempre se pisan; secret solo si
// viene no-vacío (input vacío = "no toco la credencial guardada", nunca se re-muestra).
router.put('/:canal', adminAuthMiddleware, requireRole('admin'), validarCanal, async (req, res, next) => {
  try {
    const { canal } = req.params;
    const { activo, config, secret } = req.body || {};

    const updated = await notificacionesRepo.upsertChannel({
      canal,
      activo: !!activo,
      config: config || {},
      secret: secret && String(secret).trim() ? String(secret).trim() : null,
      updatedBy: req.admin?.id || null,
    });

    res.json({
      success: true,
      data: {
        canal: updated.canal,
        activo: updated.activo,
        config: updated.config,
        // Solo tenemos el last4 a mano acá (no vale la pena volver a descifrar tras un
        // simple PUT) — mismo formato reducido que usa el resto del admin.
        secretMask: updated.secret_last4 ? `••••${updated.secret_last4}` : null,
        updatedAt: updated.updated_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/notificaciones/:canal/test — envía un mensaje de prueba REAL.
// Nunca usa datos falsos silenciosos: si el canal está inactivo/sin credenciales,
// resend.js / telegram.js lanzan y acá se traduce a un 502 explícito.
router.post('/:canal/test', adminAuthMiddleware, requireRole('admin'), validarCanal, async (req, res) => {
  const { canal } = req.params;
  try {
    if (canal === 'resend') {
      const to = req.body?.to;
      if (!to) return res.status(400).json({ success: false, error: 'Falta "to" (destinatario) para la prueba' });
      const result = await enviarEmail({
        to,
        subject: 'Prueba de conexión — Condor 360',
        html: '<p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#0f172a;">Este es un correo de prueba enviado desde el panel de administración de Condor 360. Si lo recibiste, la conexión con Resend funciona correctamente.</p>',
      });
      return res.json({ success: true, data: result });
    }
    if (canal === 'telegram') {
      const result = await enviarTelegram({
        text: '✅ <b>Prueba de conexión</b> — enviada desde el panel de administración de Condor 360.',
      });
      return res.json({ success: true, data: result });
    }
    return res.status(400).json({ success: false, error: 'Canal inválido' });
  } catch (err) {
    // Error real de canal inactivo/credenciales/timeout — 502 (falla aguas abajo), no 500.
    res.status(502).json({ success: false, error: err.message });
  }
});

export default router;
