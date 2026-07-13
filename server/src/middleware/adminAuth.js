import jwt from 'jsonwebtoken';
import * as adminUsersRepo from '../repositories/adminUsersRepo.js';

// JWT_SECRET es obligatorio — sin default inseguro. Si falta, el servidor no debe arrancar.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET no está definida — obligatoria para arrancar el servidor');
}

// Admin panel: sesión corta (12h) — oficina/admin trabajan desde un puesto fijo,
// a diferencia del técnico en terreno con señal mala.
const JWT_ADMIN_EXPIRES_IN = process.env.JWT_ADMIN_EXPIRES_IN || '12h';

export function generateAdminToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, rol: user.rol },
    JWT_SECRET,
    { expiresIn: JWT_ADMIN_EXPIRES_IN }
  );
}

// Revocación inmediata (mismo patrón que el técnico en middleware/auth.js): el rol y
// el estado activo se releen de la DB en cada request en vez de confiar en el payload
// del JWT durante toda su vida (hasta 12h). Sin esto, desactivar/eliminar un usuario
// del panel o degradarlo de admin a oficina no le quitaba el acceso "de inmediato"
// como promete la UI de Usuarios — su token viejo seguía funcionando con el rol
// original hasta expirar (bug real encontrado en QA).
export async function adminAuthMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Token de administrador no proporcionado' });
  }

  const token = header.slice(7);
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.rol) {
      return res.status(401).json({ success: false, error: 'Token de administrador inválido' });
    }
  } catch {
    return res.status(401).json({ success: false, error: 'Token inválido o expirado' });
  }

  try {
    const actual = await adminUsersRepo.getById(decoded.id);
    if (!actual || actual.activo !== true) {
      return res.status(403).json({ success: false, error: 'Usuario sin acceso al panel. Contacte a un administrador.' });
    }
    // rol/email siempre de la DB (no del JWT viejo) — un cambio de rol aplica de inmediato.
    req.admin = { id: actual.id, email: actual.email, rol: actual.rol };
    next();
  } catch (err) {
    console.error('[adminAuth] Error verificando admin_user activo:', err.message);
    return res.status(500).json({ success: false, error: 'Error interno de autenticación' });
  }
}
