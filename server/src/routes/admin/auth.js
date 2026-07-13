import { Router } from 'express';
import * as adminUsersRepo from '../../repositories/adminUsersRepo.js';
import { generateAdminToken } from '../../middleware/adminAuth.js';
import { adminLoginRateLimiter } from '../../middleware/rateLimiter.js';

const router = Router();

router.post('/login', adminLoginRateLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email y contraseña son requeridos' });
    }

    const user = await adminUsersRepo.findByEmail(email.trim());
    if (!user) {
      return res.status(401).json({ success: false, error: 'Credenciales incorrectas' });
    }
    if (user.activo !== true) {
      return res.status(403).json({ success: false, error: 'Usuario inactivo. Contacte al administrador.' });
    }

    const passOk = await adminUsersRepo.verificarPassword(user, password);
    if (!passOk) {
      return res.status(401).json({ success: false, error: 'Credenciales incorrectas' });
    }

    await adminUsersRepo.registrarLogin(user.id);
    const token = generateAdminToken({ id: user.id, email: user.email, rol: user.rol });

    res.json({
      success: true,
      data: {
        user: { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol },
        token,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
