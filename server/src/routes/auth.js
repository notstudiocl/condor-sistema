import { Router } from 'express';
import * as empleadosRepo from '../repositories/empleadosRepo.js';
import * as personasRepo from '../repositories/personasRepo.js';
import { generateToken } from '../middleware/auth.js';
import { loginRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/login', loginRateLimiter, async (req, res, next) => {
  const startTime = Date.now();
  console.log('[LOGIN] Intento de login recibido:', {
    ip: req.ip,
    hasEmail: !!req.body?.email,
    hasUsuario: !!req.body?.usuario,
    hasPin: !!req.body?.pin,
  });

  try {
    const { email, usuario, pin } = req.body || {};
    const rawInput = (email || usuario || '').trim();

    if (!rawInput || !pin) {
      console.log('[LOGIN] Faltan credenciales');
      return res.status(400).json({
        success: false,
        error: 'Usuario y PIN son requeridos',
      });
    }

    console.log('[LOGIN] Buscando técnico para:', rawInput);
    const empleado = await empleadosRepo.findByCredencial(rawInput);
    console.log('[LOGIN] Resultado búsqueda:', empleado ? `encontrado: ${empleado.nombre}` : 'no encontrado', `(${Date.now() - startTime}ms)`);

    // Sin PIN = persona sin acceso terreno (p.ej. alguien de oficina): para este login no existe.
    if (!empleado || !empleado.pin_hash) {
      return res.status(401).json({
        success: false,
        error: 'Credenciales incorrectas',
      });
    }

    // Bloqueo temporal por intentos fallidos — compartido con el login del panel.
    if (personasRepo.estaBloqueada(empleado)) {
      console.log('[LOGIN] Cuenta bloqueada temporalmente:', empleado.nombre);
      return res.status(429).json({
        success: false,
        error: 'Demasiados intentos fallidos. Intente nuevamente en unos minutos.',
      });
    }

    if (empleado.activo !== true) {
      console.log('[LOGIN] Usuario inactivo:', empleado.nombre);
      return res.status(403).json({
        success: false,
        error: 'Usuario inactivo. Contacte al administrador.',
      });
    }

    const pinOk = await empleadosRepo.verificarPin(empleado, pin);
    if (!pinOk) {
      console.log('[LOGIN] PIN incorrecto para:', empleado.nombre);
      await personasRepo.registrarFalloLogin(empleado.id);
      return res.status(401).json({
        success: false,
        error: 'Credenciales incorrectas',
      });
    }

    // recordId = id numérico de Postgres (ya no rec* de Airtable) — se usa como
    // linked record de "Responsable Orden" y para verificar empleado.activo en cada request.
    const user = {
      id: empleado.id,
      recordId: empleado.id,
      nombre: empleado.nombre,
      email: empleado.usuario,
    };

    await personasRepo.registrarLoginOk(empleado.id, 'terreno');
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
