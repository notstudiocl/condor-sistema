// Autoriza por rol del JWT admin ya verificado por adminAuthMiddleware (debe montarse después).
// requireRole(['admin']) o requireRole('admin').
export function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    const rol = req.admin?.rol;
    if (!rol || !allowed.includes(rol)) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para realizar esta acción' });
    }
    next();
  };
}
