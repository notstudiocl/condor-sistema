// Autoriza por rol ya verificado por adminAuthMiddleware (debe montarse después).
// requireRole(['admin']) o requireRole('admin').
//
// Jerarquía: 'notstudio' (soporte de NotStudio) puede todo lo que puede 'admin'.
export function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    const rol = req.admin?.rol;
    const permitido = !!rol && (allowed.includes(rol) || (rol === 'notstudio' && allowed.includes('admin')));
    if (!permitido) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para realizar esta acción' });
    }
    next();
  };
}

// Secciones exclusivas de NotStudio (credenciales de integraciones, webhook de n8n). Para
// cualquier otro rol la respuesta es 404, no 403: ni siquiera se revela que la sección existe.
export function requireNotstudio(req, res, next) {
  if (req.admin?.rol !== 'notstudio') {
    return res.status(404).json({ success: false, error: 'Ruta no encontrada' });
  }
  next();
}
