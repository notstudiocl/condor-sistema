import jwt from 'jsonwebtoken';
import * as empleadosRepo from '../repositories/empleadosRepo.js';

// JWT_SECRET es obligatorio — sin default inseguro. Si falta, el servidor no debe arrancar.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET no está definida — obligatoria para arrancar el servidor');
}

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
 * Un token válido de un empleado ya no activo SIEMPRE se rechaza con 403 (revocación
 * inmediata), también en ambos modos.
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

  try {
    const activo = await empleadosRepo.isEmpleadoActivo(decoded.recordId);
    if (!activo) {
      return res.status(403).json({ success: false, error: 'Usuario inactivo. Contacte al administrador.' });
    }
  } catch (err) {
    console.error('[AUTH] Error verificando empleado activo:', err.message);
    return res.status(500).json({ success: false, error: 'Error interno de autenticación' });
  }

  req.user = decoded;
  next();
}
