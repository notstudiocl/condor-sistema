import jwt from 'jsonwebtoken';
import * as personasRepo from '../repositories/personasRepo.js';

// JWT_SECRET es obligatorio — sin default inseguro. Si falta, el servidor no debe arrancar.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET no está definida — obligatoria para arrancar el servidor');
}

// Admin panel: sesión corta (12h) — oficina/admin trabajan desde un puesto fijo,
// a diferencia del técnico en terreno con señal mala.
const JWT_ADMIN_EXPIRES_IN = process.env.JWT_ADMIN_EXPIRES_IN || '12h';

// Tras la unificación, técnicos y usuarios del panel son filas de la MISMA tabla y se firman
// con el MISMO secreto. Lo que separa los dos espacios de tokens es el claim `aud`: el token
// del panel lleva aud:'admin' y middleware/auth.js (terreno) lo rechaza; este middleware
// rechaza cualquier token que no lo traiga.
const AUDIENCE = 'admin';

export function generateAdminToken(user) {
  return jwt.sign({ id: user.id, email: user.email, rol: user.rol }, JWT_SECRET, {
    expiresIn: JWT_ADMIN_EXPIRES_IN,
    audience: AUDIENCE,
  });
}

// Revocación inmediata: rol, activo y acceso al panel se releen de la DB en cada request en vez
// de confiar en el payload del JWT (hasta 12h de vida). Desactivar a alguien, degradarlo a
// 'tecnico' o quitarle la contraseña corta su sesión en la siguiente request.
export async function adminAuthMiddleware(req, res, next) {
  // Los sub-routers repiten este middleware: la segunda pasada reutiliza lo ya resuelto.
  if (req.admin) return next();

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Token de administrador no proporcionado' });
  }

  let decoded;
  try {
    decoded = jwt.verify(header.slice(7), JWT_SECRET, { audience: AUDIENCE });
  } catch {
    return res.status(401).json({ success: false, error: 'Token inválido o expirado' });
  }
  if (!decoded.id) {
    return res.status(401).json({ success: false, error: 'Token de administrador inválido' });
  }

  try {
    const estado = await personasRepo.obtenerEstadoAcceso(decoded.id);
    if (!estado || !estado.activo || !estado.tienePanel) {
      return res.status(401).json({ success: false, error: 'Tu sesión ya no es válida. Vuelve a iniciar sesión.' });
    }
    // rol/email siempre de la DB (no del JWT viejo) — un cambio de rol aplica de inmediato.
    req.admin = { id: estado.id, email: estado.email, rol: estado.rol, nombre: estado.nombre };
    next();
  } catch (err) {
    console.error('[adminAuth] Error verificando acceso al panel:', err.message);
    return res.status(500).json({ success: false, error: 'Error interno de autenticación' });
  }
}
