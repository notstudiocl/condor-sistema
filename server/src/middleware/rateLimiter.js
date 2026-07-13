import rateLimit from 'express-rate-limit';

// Protege los dos endpoints de login (técnico + admin) contra fuerza bruta.
// Por IP, ventana de 15 min, 10 intentos — suficiente margen para un técnico
// equivocándose de PIN en terreno, sin abrir la puerta a un ataque de diccionario.
// skipSuccessfulRequests: solo los intentos FALLIDOS cuentan contra el límite — varios
// técnicos logueándose bien desde la misma IP compartida (WiFi de oficina, hotspot de
// la camioneta) por la mañana no debían poder bloquear al resto del equipo con
// credenciales correctas (bug real corregido).
function makeLoginLimiter(message) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { success: false, error: message },
  });
}

export const loginRateLimiter = makeLoginLimiter(
  'Demasiados intentos de inicio de sesión. Intente nuevamente en unos minutos.'
);

export const adminLoginRateLimiter = makeLoginLimiter(
  'Demasiados intentos de inicio de sesión. Intente nuevamente en unos minutos.'
);
