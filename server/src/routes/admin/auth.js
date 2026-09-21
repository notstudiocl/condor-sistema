import { Router } from 'express';
import * as personasRepo from '../../repositories/personasRepo.js';
import * as auditRepo from '../../repositories/auditRepo.js';
import { generateAdminToken } from '../../middleware/adminAuth.js';
import { adminLoginRateLimiter } from '../../middleware/rateLimiter.js';

const router = Router();

const PASSWORD_MIN = 8;

function respuestaSesion(persona) {
  const token = generateAdminToken({ id: persona.id, email: persona.email, rol: persona.rol });
  return { user: { id: persona.id, email: persona.email, nombre: persona.nombre, rol: persona.rol }, token };
}

router.post('/login', adminLoginRateLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email y contraseña son requeridos' });
    }

    const persona = await personasRepo.findByEmail(email);
    // Sin contraseña o con un rol sin panel (p.ej. 'tecnico'): para este login no existe.
    if (!persona || !persona.password_hash || !personasRepo.ROLES_PANEL.includes(persona.rol)) {
      return res.status(401).json({ success: false, error: 'Credenciales incorrectas' });
    }
    // Bloqueo temporal por intentos fallidos — compartido con el login de terreno.
    if (personasRepo.estaBloqueada(persona)) {
      return res.status(429).json({ success: false, error: 'Demasiados intentos fallidos. Intenta nuevamente en unos minutos.' });
    }
    if (persona.activo !== true) {
      return res.status(403).json({ success: false, error: 'Usuario inactivo. Contacte al administrador.' });
    }

    const passOk = await personasRepo.verificarPassword(persona, password);
    if (!passOk) {
      await personasRepo.registrarFalloLogin(persona.id);
      return res.status(401).json({ success: false, error: 'Credenciales incorrectas' });
    }

    await personasRepo.registrarLoginOk(persona.id, 'panel');
    res.json({ success: true, data: respuestaSesion(persona) });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/auth/invitacion/:token — valida el enlace (72 h) antes de mostrar el formulario.
router.get('/invitacion/:token', adminLoginRateLimiter, async (req, res, next) => {
  try {
    const persona = await personasRepo.findByInviteToken(req.params.token);
    if (!persona) {
      return res.status(404).json({ success: false, error: 'La invitación no existe o ya venció. Pide que te envíen una nueva.' });
    }
    res.json({ success: true, data: { nombre: persona.nombre, email: persona.email } });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/auth/invitacion/:token — { password }: la persona define su propia contraseña
// y queda con la sesión iniciada. El token se consume (setPassword lo limpia).
router.post('/invitacion/:token', adminLoginRateLimiter, async (req, res, next) => {
  try {
    const password = String(req.body?.password || '');
    if (password.length < PASSWORD_MIN) {
      return res.status(400).json({ success: false, error: `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres` });
    }
    const persona = await personasRepo.findByInviteToken(req.params.token);
    if (!persona || !personasRepo.ROLES_PANEL.includes(persona.rol)) {
      return res.status(404).json({ success: false, error: 'La invitación no existe o ya venció. Pide que te envíen una nueva.' });
    }

    await personasRepo.setPassword(persona.id, password);
    await personasRepo.registrarLoginOk(persona.id, 'panel');

    auditRepo
      .registrar({ adminUserId: persona.id, accion: 'aceptar_invitacion', entidad: 'empleados', entidadId: persona.id, detalle: { email: persona.email } })
      .catch((err) => console.error('[admin/auth] no se pudo registrar auditoría de invitación:', err.message));

    res.json({ success: true, data: respuestaSesion(persona) });
  } catch (err) {
    next(err);
  }
});

export default router;
