import { Router } from 'express';
import { findTecnicoByUsuario } from '../services/airtable.js';
import { generateToken } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const { email, usuario, pin } = req.body;
    const rawInput = email || usuario || '';

    if (!rawInput || !pin) {
      return res.status(400).json({
        success: false,
        error: 'Usuario y PIN son requeridos',
      });
    }

    const usuarioInput = rawInput.trim().toLowerCase();
    const tecnico = await findTecnicoByUsuario(usuarioInput);
    if (!tecnico) {
      return res.status(401).json({
        success: false,
        error: 'Credenciales incorrectas',
      });
    }

    if (tecnico.activo !== true) {
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
      email: tecnico.usuario,
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
