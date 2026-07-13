import { Router } from 'express';
import * as empleadosRepo from '../../repositories/empleadosRepo.js';
import * as auditRepo from '../../repositories/auditRepo.js';
import { adminAuthMiddleware } from '../../middleware/adminAuth.js';

const router = Router();

router.use(adminAuthMiddleware);

// GET /api/admin/empleados — cards con stats reales (count órdenes, total generado)
router.get('/', async (_req, res, next) => {
  try {
    const empleados = await empleadosRepo.listTodos();
    res.json({ success: true, data: empleados });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/empleados/:id — ficha (stats + últimas órdenes)
router.get('/:id', async (req, res, next) => {
  try {
    const empleado = await empleadosRepo.getEmpleadoConStats(Number(req.params.id));
    if (!empleado) return res.status(404).json({ success: false, error: 'Técnico no encontrado' });
    const { pin_hash, ...safe } = empleado; // el hash del PIN nunca sale de este módulo
    res.json({ success: true, data: safe });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/stats', async (req, res, next) => {
  try {
    const empleado = await empleadosRepo.getEmpleadoConStats(Number(req.params.id));
    if (!empleado) return res.status(404).json({ success: false, error: 'Técnico no encontrado' });
    res.json({
      success: true,
      data: {
        totalOrdenes: Number(empleado.total_ordenes),
        montoGenerado: Number(empleado.monto_generado),
        ultimasOrdenes: empleado.ultimasOrdenes,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/empleados — alta: PIN aleatorio, se muestra UNA vez en la respuesta
router.post('/', async (req, res, next) => {
  try {
    const { rut, nombre, telefono, usuario, fechaIngreso, especialidades } = req.body || {};
    if (!nombre || !usuario) {
      return res.status(400).json({ success: false, error: 'nombre y usuario son requeridos' });
    }
    const { empleado, pin } = await empleadosRepo.crearEmpleado({
      rut, nombre, telefono, usuario, fechaIngreso, especialidades, activo: true,
    });
    const { pin_hash, ...safe } = empleado;
    res.status(201).json({ success: true, data: { empleado: safe, pin } });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Ya existe un técnico con ese usuario o RUT' });
    }
    next(err);
  }
});

// Compara antes/después solo para los campos que vinieron en el body (evita
// registrar en auditoría campos que ni siquiera se intentaron cambiar).
function diffCamposEmpleado(antes, despues, enviados) {
  const cambios = {};
  for (const [campo, key] of Object.entries({
    rut: 'rut', nombre: 'nombre', activo: 'activo', telefono: 'telefono',
    usuario: 'usuario', fecha_ingreso: 'fechaIngreso', especialidades: 'especialidades',
  })) {
    if (enviados[key] === undefined) continue;
    const a = antes[campo];
    const b = despues[campo];
    const iguales = Array.isArray(a) || Array.isArray(b)
      ? JSON.stringify(a || []) === JSON.stringify(b || [])
      : String(a ?? '') === String(b ?? '');
    if (!iguales) cambios[campo] = { antes: a ?? null, despues: b ?? null };
  }
  return cambios;
}

// PUT /api/admin/empleados/:id — edición de datos (incluye activar/desactivar)
router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rut, nombre, activo, telefono, usuario, fechaIngreso, especialidades } = req.body || {};

    const antes = await empleadosRepo.getEmpleadoById(id);
    if (!antes) return res.status(404).json({ success: false, error: 'Técnico no encontrado' });

    const empleado = await empleadosRepo.actualizarEmpleado(id, {
      rut, nombre, activo, telefono, usuario, fechaIngreso, especialidades,
    });
    if (!empleado) return res.status(404).json({ success: false, error: 'Técnico no encontrado' });

    const cambios = diffCamposEmpleado(antes, empleado, { rut, nombre, activo, telefono, usuario, fechaIngreso, especialidades });
    if (Object.keys(cambios).length > 0) {
      auditRepo.registrar({
        adminUserId: req.admin?.id,
        accion: 'editar_empleado',
        entidad: 'empleados',
        entidadId: id,
        detalle: { nombre: empleado.nombre, cambios },
      }).catch((err) => console.error('[admin/empleados] no se pudo registrar auditoría de edición:', err.message));
    }

    const { pin_hash, ...safe } = empleado;
    res.json({ success: true, data: safe });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Ya existe otro técnico con ese usuario o RUT' });
    }
    next(err);
  }
});

// POST /api/admin/empleados/:id/reset-pin — PIN nuevo, se muestra UNA vez, queda en auditoría
router.post('/:id/reset-pin', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const empleado = await empleadosRepo.getEmpleadoById(id);
    if (!empleado) return res.status(404).json({ success: false, error: 'Técnico no encontrado' });

    const pin = await empleadosRepo.resetearPin(id);

    await auditRepo.registrar({
      adminUserId: req.admin?.id,
      accion: 'reset_pin',
      entidad: 'empleados',
      entidadId: id,
      detalle: { nombre: empleado.nombre },
    }).catch((err) => console.error('[admin/empleados] no se pudo registrar auditoría de reset-pin:', err.message));

    res.json({ success: true, data: { pin } });
  } catch (err) {
    next(err);
  }
});

export default router;
