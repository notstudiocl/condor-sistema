import { Router } from 'express';
import crypto from 'crypto';
import * as adminUsersRepo from '../../repositories/adminUsersRepo.js';
import * as auditRepo from '../../repositories/auditRepo.js';
import { enviarEmail } from '../../services/notifications/resend.js';
import { adminAuthMiddleware } from '../../middleware/adminAuth.js';
import { requireRole } from '../../middleware/requireRole.js';

const router = Router();

// Usuarios del admin panel: solo un 'admin' puede administrar otros usuarios
// (spec: matriz de permisos — Usuarios queda fuera del alcance de 'oficina').
router.use(adminAuthMiddleware, requireRole('admin'));

function generarPassword() {
  // 12 caracteres legibles (sin 0/O/1/l ambiguos), suficiente para una contraseña
  // temporal que el usuario cambiará — nunca se vuelve a mostrar tras esta respuesta.
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(12))
    .map((b) => alphabet[b % alphabet.length])
    .join('');
}

async function intentarInvitacion(email, nombre, password) {
  try {
    await enviarEmail({
      to: email,
      subject: 'Acceso al Panel de Administración — Condor 360',
      html: `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#0f172a;">
        <p>Hola ${nombre || ''},</p>
        <p>Se creó una cuenta para ti en el Panel de Administración de Condor 360.</p>
        <p><b>Correo:</b> ${email}<br/><b>Contraseña temporal:</b> ${password}</p>
        <p>Te recomendamos cambiarla apenas ingreses.</p>
      </div>`,
    });
    return true;
  } catch (err) {
    console.error(`[admin/usuarios] no se pudo enviar invitación a ${email}:`, err.message);
    return false;
  }
}

router.get('/', async (_req, res, next) => {
  try {
    const usuarios = await adminUsersRepo.listUsers();
    res.json({ success: true, data: usuarios });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/usuarios — alta con invitación por email (Resend). La contraseña
// nunca queda solo en el correo: también se devuelve UNA vez en la respuesta, por
// si Resend no está configurado o el envío falla (mismo patrón que el PIN de técnicos).
router.post('/', async (req, res, next) => {
  try {
    const { email, nombre, rol } = req.body || {};
    if (!email || !nombre) {
      return res.status(400).json({ success: false, error: 'email y nombre son requeridos' });
    }
    if (rol && !['admin', 'oficina'].includes(rol)) {
      return res.status(400).json({ success: false, error: 'rol inválido' });
    }
    const existente = await adminUsersRepo.findByEmail(email);
    if (existente) {
      return res.status(409).json({ success: false, error: 'Ya existe un usuario con ese email' });
    }

    const password = generarPassword();
    const user = await adminUsersRepo.crearAdminUser({ email, password, nombre, rol: rol || 'oficina' });
    const invitacionEnviada = await intentarInvitacion(email, nombre, password);

    await auditRepo.registrar({
      adminUserId: req.admin?.id,
      accion: 'crear_usuario',
      entidad: 'admin_users',
      entidadId: user.id,
      detalle: { email, rol: user.rol, invitacionEnviada },
    }).catch((err) => console.error('[admin/usuarios] no se pudo registrar auditoría de alta:', err.message));

    res.status(201).json({ success: true, data: { user, password, invitacionEnviada } });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/usuarios/:id — editar nombre/rol/activo, con guards:
//  - no puede desactivarse a sí mismo
//  - no puede degradar/desactivar al último admin activo
router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { nombre, rol, activo } = req.body || {};
    if (rol && !['admin', 'oficina'].includes(rol)) {
      return res.status(400).json({ success: false, error: 'rol inválido' });
    }

    const objetivo = await adminUsersRepo.getById(id);
    if (!objetivo) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    const seDesactiva = activo === false && objetivo.activo === true;
    const seDegrada = rol === 'oficina' && objetivo.rol === 'admin';
    // req.admin.id viene del JWT (string, serializado desde un bigint de Postgres) —
    // comparar con String() para no perder el guard por un simple mismatch de tipos.
    const esUnoMismo = String(req.admin?.id) === String(id);

    if (esUnoMismo && (seDesactiva || seDegrada)) {
      return res.status(400).json({ success: false, error: 'No puedes desactivarte ni quitarte el rol de administrador a ti mismo' });
    }

    if ((seDesactiva || seDegrada) && objetivo.rol === 'admin' && objetivo.activo === true) {
      const totalAdmins = await adminUsersRepo.countAdmins();
      if (totalAdmins <= 1) {
        return res.status(400).json({ success: false, error: 'No puedes dejar el sistema sin ningún administrador activo' });
      }
    }

    const actualizado = await adminUsersRepo.actualizarAdminUser(id, { nombre, rol, activo });

    await auditRepo.registrar({
      adminUserId: req.admin?.id,
      accion: 'editar_usuario',
      entidad: 'admin_users',
      entidadId: id,
      detalle: { nombre, rol, activo },
    }).catch((err) => console.error('[admin/usuarios] no se pudo registrar auditoría de edición:', err.message));

    res.json({ success: true, data: actualizado });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/usuarios/:id/reset-password — nueva contraseña temporal, se muestra UNA vez
router.post('/:id/reset-password', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const objetivo = await adminUsersRepo.getById(id);
    if (!objetivo) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    const password = generarPassword();
    await adminUsersRepo.cambiarPassword(id, password);
    const invitacionEnviada = await intentarInvitacion(objetivo.email, objetivo.nombre, password);

    await auditRepo.registrar({
      adminUserId: req.admin?.id,
      accion: 'reset_password',
      entidad: 'admin_users',
      entidadId: id,
      detalle: { email: objetivo.email },
    }).catch((err) => console.error('[admin/usuarios] no se pudo registrar auditoría de reset-password:', err.message));

    res.json({ success: true, data: { password, invitacionEnviada } });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/usuarios/:id — mismos guards que desactivar
router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (String(req.admin?.id) === String(id)) {
      return res.status(400).json({ success: false, error: 'No puedes eliminar tu propia cuenta' });
    }
    const objetivo = await adminUsersRepo.getById(id);
    if (!objetivo) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    if (objetivo.rol === 'admin' && objetivo.activo === true) {
      const totalAdmins = await adminUsersRepo.countAdmins();
      if (totalAdmins <= 1) {
        return res.status(400).json({ success: false, error: 'No puedes eliminar al último administrador activo' });
      }
    }

    await adminUsersRepo.eliminarAdminUser(id);

    await auditRepo.registrar({
      adminUserId: req.admin?.id,
      accion: 'eliminar_usuario',
      entidad: 'admin_users',
      entidadId: id,
      detalle: { email: objetivo.email },
    }).catch((err) => console.error('[admin/usuarios] no se pudo registrar auditoría de eliminación:', err.message));

    res.json({ success: true, data: { eliminado: true } });
  } catch (err) {
    next(err);
  }
});

export default router;
