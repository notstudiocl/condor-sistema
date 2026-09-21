import { Router } from 'express';
import crypto from 'crypto';
import * as personasRepo from '../../repositories/personasRepo.js';
import * as auditRepo from '../../repositories/auditRepo.js';
import { enviarCorreoSistema } from '../../services/notifications/correoSistema.js';
import { adminAuthMiddleware } from '../../middleware/adminAuth.js';
import { requireRole } from '../../middleware/requireRole.js';

// ÚNICA vía de escritura sobre personas (tabla `empleados` unificada): datos, rol, acceso
// terreno (PIN), acceso panel (invitación / contraseña), activar/desactivar, eliminar.
// routes/admin/empleados.js quedó deliberadamente de solo lectura para no tener dos caminos
// distintos de escritura sobre la misma tabla.
//
// Solo 'admin' (y 'notstudio') gestionan personas. Las cuentas 'notstudio' son invisibles para
// los demás roles: no salen en el listado y cualquier acceso por id responde 404.

const router = Router();
router.use(adminAuthMiddleware, requireRole('admin'));

const PANEL_URL = (process.env.ADMIN_PANEL_URL || 'https://condor.notstudio.cl/admin/').replace(/\/?$/, '/');

const esNotstudio = (req) => req.admin?.rol === 'notstudio';
const esUnoMismo = (req, id) => String(req.admin?.id) === String(id);
const esRolAdmin = (rol) => rol === 'admin' || rol === 'notstudio';

function auditar(req, accion, entidadId, detalle) {
  auditRepo
    .registrar({ adminUserId: req.admin?.id, accion, entidad: 'empleados', entidadId, detalle })
    .catch((err) => console.error(`[admin/usuarios] no se pudo registrar auditoría de ${accion}:`, err.message));
}

// Carga la persona objetivo respetando la invisibilidad de 'notstudio'.
async function cargarObjetivo(req, res) {
  const id = Number(req.params.id);
  const persona = Number.isFinite(id) ? await personasRepo.getById(id) : null;
  if (!persona || (persona.rol === 'notstudio' && !esNotstudio(req))) {
    res.status(404).json({ success: false, error: 'Persona no encontrada' });
    return null;
  }
  return persona;
}

// Solo notstudio puede crear o asignar el rol notstudio; para el resto ese rol "no existe".
function rolPermitido(req, rol) {
  if (!personasRepo.ROLES_VALIDOS.includes(rol)) return false;
  return rol !== 'notstudio' || esNotstudio(req);
}

// ¿Esta acción deja al sistema sin ningún administrador activo con acceso al panel?
async function dejariaSinAdmins(objetivo) {
  if (!(esRolAdmin(objetivo.rol) && objetivo.activo && objetivo.tiene_panel)) return false;
  return (await personasRepo.contarAdminsActivos()) <= 1;
}

function generarPassword() {
  // 12 caracteres legibles (sin 0/O/1/l ambiguos) — temporal, nunca se vuelve a mostrar.
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(12)).map((b) => alphabet[b % alphabet.length]).join('');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Crea la invitación (72 h) e intenta mandarla por correo. El enlace también se devuelve UNA vez
// en la respuesta, por si el correo falla (mismo criterio que el PIN de técnicos).
async function invitar(persona) {
  const token = await personasRepo.crearInvitacion(persona.id);
  const enlace = `${PANEL_URL}#/invitacion/${token}`;
  let enviada = false;
  try {
    await enviarCorreoSistema({
      to: persona.email,
      subject: 'Tu acceso al Panel de Condor 360',
      html: `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.5">
        <p>Hola ${escapeHtml(persona.nombre)},</p>
        <p>Te dieron acceso al Panel de Administración de <b>Condor 360</b>. Para activarlo, define tu contraseña en este enlace:</p>
        <p><a href="${enlace}" style="display:inline-block;background:#1E3A8A;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Definir mi contraseña</a></p>
        <p style="color:#64748b;font-size:12px">El enlace vence en 72 horas. Si no esperabas este correo, puedes ignorarlo.</p>
      </div>`,
    });
    enviada = true;
  } catch (err) {
    console.error(`[admin/usuarios] no se pudo enviar la invitación a ${persona.email}:`, err.message);
  }
  return { enlace, enviada };
}

function manejarDuplicado(err, res) {
  if (err.code !== '23505') return false;
  const campo = /email/.test(err.constraint || '') ? 'correo' : /usuario/.test(err.constraint || '') ? 'usuario' : 'usuario, RUT o correo';
  res.status(409).json({ success: false, error: `Ya existe otra persona con ese ${campo}` });
  return true;
}

// GET /api/admin/usuarios — todas las personas con sus accesos (sin hashes).
router.get('/', async (req, res, next) => {
  try {
    res.json({ success: true, data: await personasRepo.listar({ incluirNotstudio: esNotstudio(req) }) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const persona = await cargarObjetivo(req, res);
    if (persona) res.json({ success: true, data: persona });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/usuarios — alta de una persona.
//   accesoTerreno:true -> genera PIN (se muestra UNA vez), exige `usuario`.
//   rol con panel      -> exige `email`; con invitar !== false se manda la invitación.
router.post('/', async (req, res, next) => {
  try {
    const { nombre, rut, telefono, usuario, fechaIngreso, especialidades, email, accesoTerreno, invitar: quiereInvitar } = req.body || {};
    const rol = req.body?.rol || 'tecnico';
    if (!nombre || !String(nombre).trim()) return res.status(400).json({ success: false, error: 'El nombre es requerido' });
    if (!rolPermitido(req, rol)) return res.status(400).json({ success: false, error: 'Rol inválido' });
    if (accesoTerreno && !String(usuario || '').trim()) {
      return res.status(400).json({ success: false, error: 'El acceso a terreno requiere un nombre de usuario' });
    }
    const tienePanel = personasRepo.ROLES_PANEL.includes(rol);
    if (tienePanel && !personasRepo.normalizarEmail(email)) {
      return res.status(400).json({ success: false, error: 'Un rol con acceso al panel requiere un correo' });
    }

    const { persona, pin } = await personasRepo.crearPersona({
      nombre: String(nombre).trim(), rut, telefono, usuario: String(usuario || '').trim() || null,
      fechaIngreso, especialidades, rol, email, accesoTerreno: !!accesoTerreno,
    });

    let invitacion = null;
    if (tienePanel && quiereInvitar !== false) invitacion = await invitar(persona);

    auditar(req, 'crear_persona', persona.id, { nombre: persona.nombre, rol, email: persona.email, accesoTerreno: !!accesoTerreno, invitacionEnviada: invitacion?.enviada ?? null });
    res.status(201).json({
      success: true,
      data: { persona: await personasRepo.getById(persona.id), pin, invitacionEnviada: invitacion?.enviada ?? null, enlaceInvitacion: invitacion?.enlace ?? null },
    });
  } catch (err) {
    if (!manejarDuplicado(err, res)) next(err);
  }
});

// PUT /api/admin/usuarios/:id — datos, rol, email y activo. Guards:
//   - no desactivarse ni quitarse el rol de administrador a uno mismo
//   - no dejar el sistema sin ningún administrador activo
router.put('/:id', async (req, res, next) => {
  try {
    const objetivo = await cargarObjetivo(req, res);
    if (!objetivo) return;
    const { nombre, rut, telefono, usuario, fechaIngreso, especialidades, rol, email, activo } = req.body || {};

    if (rol !== undefined && !rolPermitido(req, rol)) return res.status(400).json({ success: false, error: 'Rol inválido' });
    if (nombre !== undefined && !String(nombre).trim()) return res.status(400).json({ success: false, error: 'El nombre no puede quedar vacío' });

    const rolFinal = rol ?? objetivo.rol;
    const emailFinal = email !== undefined ? personasRepo.normalizarEmail(email) : objetivo.email;
    const usuarioFinal = usuario !== undefined ? String(usuario || '').trim() : objetivo.usuario;
    if (personasRepo.ROLES_PANEL.includes(rolFinal) && !emailFinal) {
      return res.status(400).json({ success: false, error: 'Un rol con acceso al panel requiere un correo' });
    }
    if (objetivo.tiene_pin && !usuarioFinal) {
      return res.status(400).json({ success: false, error: 'Una persona con acceso a terreno necesita un nombre de usuario' });
    }

    const seDesactiva = activo === false && objetivo.activo === true;
    const pierdeAdmin = esRolAdmin(objetivo.rol) && !esRolAdmin(rolFinal);
    if (esUnoMismo(req, objetivo.id) && (seDesactiva || pierdeAdmin)) {
      return res.status(400).json({ success: false, error: 'No puedes desactivarte ni quitarte el rol de administrador a ti mismo' });
    }
    if ((seDesactiva || pierdeAdmin) && (await dejariaSinAdmins(objetivo))) {
      return res.status(400).json({ success: false, error: 'No puedes dejar el sistema sin ningún administrador activo' });
    }

    const actualizado = await personasRepo.actualizarPersona(objetivo.id, {
      nombre: nombre !== undefined ? String(nombre).trim() : undefined,
      rut, telefono, usuario, fechaIngreso, especialidades, rol, email, activo,
    });

    const cambios = {};
    for (const campo of ['nombre', 'rut', 'telefono', 'usuario', 'email', 'rol', 'activo', 'fecha_ingreso']) {
      if (String(objetivo[campo] ?? '') !== String(actualizado[campo] ?? '')) cambios[campo] = { antes: objetivo[campo] ?? null, despues: actualizado[campo] ?? null };
    }
    if (Object.keys(cambios).length > 0) auditar(req, 'editar_persona', objetivo.id, { nombre: actualizado.nombre, cambios });

    res.json({ success: true, data: actualizado });
  } catch (err) {
    if (!manejarDuplicado(err, res)) next(err);
  }
});

// POST /api/admin/usuarios/:id/pin — da acceso a terreno o resetea el PIN. Se muestra UNA vez.
router.post('/:id/pin', async (req, res, next) => {
  try {
    const objetivo = await cargarObjetivo(req, res);
    if (!objetivo) return;
    if (!objetivo.usuario) {
      return res.status(400).json({ success: false, error: 'Asigna primero un nombre de usuario para el acceso a terreno' });
    }
    const pin = await personasRepo.asignarPin(objetivo.id);
    auditar(req, objetivo.tiene_pin ? 'reset_pin' : 'dar_acceso_terreno', objetivo.id, { nombre: objetivo.nombre });
    res.json({ success: true, data: { pin } });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/usuarios/:id/pin — quita el acceso a terreno (su sesión de la PWA cae en la
// siguiente request). La persona sigue existiendo y conserva su historial de órdenes.
router.delete('/:id/pin', async (req, res, next) => {
  try {
    const objetivo = await cargarObjetivo(req, res);
    if (!objetivo) return;
    await personasRepo.quitarPin(objetivo.id);
    auditar(req, 'quitar_acceso_terreno', objetivo.id, { nombre: objetivo.nombre });
    res.json({ success: true, data: await personasRepo.getById(objetivo.id) });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/usuarios/:id/invitar — (re)envía la invitación para definir contraseña.
router.post('/:id/invitar', async (req, res, next) => {
  try {
    const objetivo = await cargarObjetivo(req, res);
    if (!objetivo) return;
    if (!personasRepo.ROLES_PANEL.includes(objetivo.rol) || !objetivo.email) {
      return res.status(400).json({ success: false, error: 'La persona necesita un correo y un rol con acceso al panel (oficina o administrador)' });
    }
    if (!objetivo.activo) return res.status(400).json({ success: false, error: 'La persona está desactivada' });
    const { enlace, enviada } = await invitar(objetivo);
    auditar(req, 'invitar_panel', objetivo.id, { email: objetivo.email, invitacionEnviada: enviada });
    res.json({ success: true, data: { invitacionEnviada: enviada, enlaceInvitacion: enlace } });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/usuarios/:id/reset-password — contraseña temporal, se muestra UNA vez.
router.post('/:id/reset-password', async (req, res, next) => {
  try {
    const objetivo = await cargarObjetivo(req, res);
    if (!objetivo) return;
    if (!personasRepo.ROLES_PANEL.includes(objetivo.rol) || !objetivo.email) {
      return res.status(400).json({ success: false, error: 'La persona necesita un correo y un rol con acceso al panel (oficina o administrador)' });
    }
    const password = generarPassword();
    await personasRepo.setPassword(objetivo.id, password);
    auditar(req, 'reset_password', objetivo.id, { email: objetivo.email });
    res.json({ success: true, data: { password } });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/usuarios/:id/panel — quita el acceso al panel (borra la contraseña).
router.delete('/:id/panel', async (req, res, next) => {
  try {
    const objetivo = await cargarObjetivo(req, res);
    if (!objetivo) return;
    if (esUnoMismo(req, objetivo.id)) return res.status(400).json({ success: false, error: 'No puedes quitarte el acceso al panel a ti mismo' });
    if (await dejariaSinAdmins(objetivo)) {
      return res.status(400).json({ success: false, error: 'No puedes dejar el sistema sin ningún administrador activo' });
    }
    await personasRepo.quitarAccesoPanel(objetivo.id);
    auditar(req, 'quitar_acceso_panel', objetivo.id, { email: objetivo.email });
    res.json({ success: true, data: await personasRepo.getById(objetivo.id) });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/usuarios/:id/desbloquear — levanta el bloqueo por intentos fallidos.
router.post('/:id/desbloquear', async (req, res, next) => {
  try {
    const objetivo = await cargarObjetivo(req, res);
    if (!objetivo) return;
    await personasRepo.desbloquear(objetivo.id);
    auditar(req, 'desbloquear', objetivo.id, { nombre: objetivo.nombre });
    res.json({ success: true, data: await personasRepo.getById(objetivo.id) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/usuarios/:id — solo personas SIN historial de órdenes (si lo tienen, se
// desactivan: borrar rompería el historial). Mismos guards que desactivar.
router.delete('/:id', async (req, res, next) => {
  try {
    const objetivo = await cargarObjetivo(req, res);
    if (!objetivo) return;
    if (esUnoMismo(req, objetivo.id)) return res.status(400).json({ success: false, error: 'No puedes eliminar tu propia cuenta' });
    if (await dejariaSinAdmins(objetivo)) {
      return res.status(400).json({ success: false, error: 'No puedes eliminar al último administrador activo' });
    }
    if (await personasRepo.tieneHistorial(objetivo.id)) {
      return res.status(409).json({ success: false, error: 'Esta persona tiene órdenes asociadas: desactívala en vez de eliminarla' });
    }
    await personasRepo.eliminarPersona(objetivo.id);
    auditar(req, 'eliminar_persona', objetivo.id, { nombre: objetivo.nombre, email: objetivo.email });
    res.json({ success: true, data: { eliminado: true } });
  } catch (err) {
    next(err);
  }
});

export default router;
