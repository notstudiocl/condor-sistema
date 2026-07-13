// Kill switch de suscripción — fuente de verdad: variables de entorno de EasyPanel
// (SUBSCRIPTION_ACTIVE / SUBSCRIPTION_MESSAGE). Las controla solo NotStudio desde el
// panel de EasyPanel, fuera del alcance de la app de terreno y del admin panel — ninguna
// de las dos apps puede leerlas ni editarlas.
//
// SUBSCRIPTION_ACTIVE: 'true' | 'false' (default activo si la env var falta — nunca
// bloquear por ausencia de configuración). SUBSCRIPTION_MESSAGE: texto libre mostrado
// a los usuarios cuando el servicio está suspendido.

export function getSubscriptionStatus() {
  return {
    active: process.env.SUBSCRIPTION_ACTIVE !== 'false',
    message: process.env.SUBSCRIPTION_MESSAGE || null,
  };
}

// Bloquea TODO el panel admin (incluido el login) cuando el servicio está suspendido.
// Se monta antes de adminAuthMiddleware sobre el prefijo /api/admin en index.js.
export function subscriptionGate(req, res, next) {
  const status = getSubscriptionStatus();
  if (!status.active) {
    return res.status(403).json({
      success: false,
      error: status.message || 'Sistema suspendido.',
      code: 'SUBSCRIPTION_INACTIVE',
    });
  }
  next();
}
