import { Router } from 'express';
import { findTecnicoByCredencial } from '../services/airtable.js';
import { generateToken } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  const startTime = Date.now();
  console.log('[LOGIN] Intento de login recibido:', {
    ip: req.ip,
    hasEmail: !!req.body?.email,
    hasUsuario: !!req.body?.usuario,
    hasPin: !!req.body?.pin,
  });

  try {
    const { email, usuario, pin } = req.body;
    const rawInput = email || usuario || '';

    if (!rawInput || !pin) {
      console.log('[LOGIN] Faltan credenciales');
      return res.status(400).json({
        success: false,
        error: 'Usuario y PIN son requeridos',
      });
    }

    console.log('[LOGIN] Buscando técnico para:', rawInput);
    const tecnico = await findTecnicoByCredencial(rawInput);
    console.log('[LOGIN] Resultado búsqueda:', tecnico ? `encontrado: ${tecnico.nombre}` : 'no encontrado', `(${Date.now() - startTime}ms)`);

    if (!tecnico) {
      return res.status(401).json({
        success: false,
        error: 'Credenciales incorrectas',
      });
    }

    if (tecnico.activo !== true) {
      console.log('[LOGIN] Usuario inactivo:', tecnico.nombre);
      return res.status(403).json({
        success: false,
        error: 'Usuario inactivo. Contacte al administrador.',
      });
    }

    if (String(tecnico.pin) !== String(pin)) {
      console.log('[LOGIN] PIN incorrecto para:', tecnico.nombre);
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
    console.log('[LOGIN] Login exitoso:', user.nombre, `(${Date.now() - startTime}ms)`);

    res.json({
      success: true,
      data: { user, token },
    });
  } catch (err) {
    console.error('[LOGIN] Error:', err.message, `(${Date.now() - startTime}ms)`);
    next(err);
  }
});

export default router;
