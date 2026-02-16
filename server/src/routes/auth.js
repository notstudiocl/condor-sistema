import { Router } from 'express';
import { findTecnicoByEmail } from '../services/airtable.js';
import { generateToken } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const { email, pin } = req.body;

    if (!email || !pin) {
      return res.status(400).json({
        success: false,
        error: 'Email y PIN son requeridos',
      });
    }

    const tecnico = await findTecnicoByEmail(email);
    if (!tecnico) {
      return res.status(401).json({
        success: false,
        error: 'Credenciales incorrectas',
      });
    }

    if (tecnico.estado !== 'Activo') {
      return res.status(403).json({
        success: false,
        error: 'Usuario inactivo. Contacte al administrador.',
      });
    }

    if (String(tecnico.pin) !== String(pin)) {
      return res.status(401).json({
        success: false,
        error: 'Credenciales incorrectas',
      });
    }

    const user = {
      id: tecnico.id,
      recordId: tecnico.recordId || null,
      nombre: tecnico.nombre,
      email: tecnico.email,
      especialidad: tecnico.especialidad,
    };

    const token = generateToken(user);

    res.json({
      success: true,
      data: { user, token },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
