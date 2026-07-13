import jwt from 'jsonwebtoken';

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

export function adminAuthMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Token de administrador no proporcionado' });
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.rol) {
      return res.status(401).json({ success: false, error: 'Token de administrador inválido' });
    }
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Token inválido o expirado' });
  }
}
