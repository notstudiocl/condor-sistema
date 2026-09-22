import * as notificacionesRepo from '../repositories/notificacionesRepo.js';

// Kill switch operativo (no es billing) — mismo criterio que hya-sistema: el valor real vive en
// app_settings (`subscription_active` / `subscription_message`, editable desde Configuración →
// General SOLO por el rol notstudio), con fallback a las env vars SUBSCRIPTION_ACTIVE /
// SUBSCRIPTION_MESSAGE de EasyPanel mientras no exista fila. Ausencia total de señal = activo:
// nunca bloquear por falta de configuración.
//
// Bloquea SOLO las escrituras de la app de terreno (crear/editar/reenviar órdenes). El panel
// sigue accesible: si bloqueara /api/admin, NotStudio no podría volver a activarlo desde ahí.

async function leer(key) {
  try {
    const v = await notificacionesRepo.getSetting(key);
    if (v === null || v === undefined) return undefined;
    return typeof v === 'object' && v !== null && 'value' in v ? v.value : v;
  } catch (err) {
    console.error(`[subscriptionGate] no se pudo leer ${key}:`, err.message);
    return undefined;
  }
}

export async function getSubscriptionStatus() {
  const activeDb = await leer('subscription_active');
  const messageDb = await leer('subscription_message');
  const active = activeDb !== undefined ? activeDb !== false && activeDb !== 'false' : process.env.SUBSCRIPTION_ACTIVE !== 'false';
  const message = (typeof messageDb === 'string' && messageDb.trim()) || process.env.SUBSCRIPTION_MESSAGE || null;
  return { active, message };
}

// Middleware para las rutas de escritura del técnico.
export async function subscriptionGate(_req, res, next) {
  try {
    const status = await getSubscriptionStatus();
    if (!status.active) {
      return res.status(403).json({
        success: false,
        error: status.message || 'Sistema suspendido.',
        code: 'SUBSCRIPTION_INACTIVE',
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}
