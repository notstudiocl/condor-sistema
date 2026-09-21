import jwt from 'jsonwebtoken';
import * as personasRepo from '../repositories/personasRepo.js';

// JWT_SECRET es obligatorio — sin default inseguro. Si falta, el servidor no debe arrancar.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET no está definida — obligatoria para arrancar el servidor');
}

// Comparte JWT_SECRET con middleware/adminAuth.js. Lo que separa ambos espacios de tokens es el
// claim `aud`: el token del panel lleva aud:'admin'; el de terreno NO lleva `aud` (así los tokens
// de técnicos emitidos antes de la unificación siguen valiendo). Cada middleware rechaza al otro.

// Técnicos de terreno: sesión larga (30 días por defecto) — señal mala, no se puede
// pedir re-login seguido. La revocación real ocurre vía empleado.activo en cada request.
const JWT_TECNICO_EXPIRES_IN = process.env.JWT_TECNICO_EXPIRES_IN || '30d';

export function generateToken(user) {
  return jwt.sign(
    { id: user.id, recordId: user.recordId, email: user.email, nombre: user.nombre },
    JWT_SECRET,
    { expiresIn: JWT_TECNICO_EXPIRES_IN }
  );
}

/**
 * Ventana dual de auth para el corte Airtable -> Postgres (plan F7):
 *   - AUTH_ENFORCE=warn (default): requests SIN Authorization header se aceptan igual
 *     (PWAs viejas cacheadas que aún no mandan token en /api/ordenes), solo se loguea
 *     IP/UA para monitorear cuándo el tráfico sin token llega a cero.
 *   - AUTH_ENFORCE=enforce: requests sin token se rechazan con 401.
 * Un token presente pero inválido/expirado SIEMPRE se rechaza con 401, en ambos modos
 * — eso no es "cliente viejo silencioso", es un intento de auth que falló de verdad.
 * Un token válido de una persona ya no activa, o a la que se le quitó el PIN (acceso terreno),
 * SIEMPRE se rechaza con 403 (revocación inmediata), también en ambos modos. El estado se relee
 * de la DB en cada request: nunca se confía en el payload del JWT.
 */
export async function authMiddleware(req, res, next) {
  const enforce = process.env.AUTH_ENFORCE === 'enforce';
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    if (enforce) {
      return res.status(401).json({ success: false, error: 'Token no proporcionado' });
    }
    console.warn(
      `[AUTH][warn] Request sin token — IP: ${req.ip} UA: "${req.headers['user-agent'] || 'desconocido'}" — ${req.method} ${req.originalUrl}`
    );
    req.user = null;
    return next();
  }

  const token = header.slice(7);
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, error: 'Token inválido o expirado' });
  }

  // Un token del panel (aud:'admin') no sirve para la app de terreno.
  if (decoded.aud === 'admin' || !(decoded.recordId || decoded.id)) {
    return res.status(401).json({ success: false, error: 'Token inválido o expirado' });
  }

  try {
    const estado = await personasRepo.obtenerEstadoAcceso(decoded.recordId || decoded.id);
    if (!estado || !estado.activo || !estado.tienePin) {
      return res.status(403).json({ success: false, error: 'Usuario inactivo. Contacte al administrador.' });
    }
  } catch (err) {
    console.error('[AUTH] Error verificando empleado activo:', err.message);
    return res.status(500).json({ success: false, error: 'Error interno de autenticación' });
  }

  req.user = decoded;
  next();
}
