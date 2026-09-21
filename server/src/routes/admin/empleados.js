import { Router } from 'express';
import * as empleadosRepo from '../../repositories/empleadosRepo.js';
import { adminAuthMiddleware } from '../../middleware/adminAuth.js';

const router = Router();

// SOLO LECTURA (listado + ficha con stats para la pantalla Personal). Toda escritura sobre
// personas vive en routes/admin/usuarios.js — a propósito no hay dos caminos de escritura
// sobre la misma tabla.
router.use(adminAuthMiddleware);

// Nunca salen de acá hashes ni tokens; las cuentas 'notstudio' son invisibles para otros roles.
function publico(e) {
  const { pin_hash, password_hash, invite_token, invite_expires_at, failed_attempts, ...safe } = e;
  return { ...safe, tiene_pin: !!pin_hash, tiene_panel: !!(e.email && password_hash && ['notstudio', 'admin', 'oficina'].includes(e.rol)) };
}
const visible = (req, e) => e.rol !== 'notstudio' || req.admin?.rol === 'notstudio';

// GET /api/admin/empleados — cards con stats reales (count órdenes, total generado)
router.get('/', async (req, res, next) => {
  try {
    const empleados = await empleadosRepo.listTodos();
    res.json({ success: true, data: empleados.filter((e) => visible(req, e)).map(publico) });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/empleados/:id — ficha (stats + últimas órdenes)
router.get('/:id', async (req, res, next) => {
  try {
    const empleado = await empleadosRepo.getEmpleadoConStats(Number(req.params.id));
    if (!empleado || !visible(req, empleado)) return res.status(404).json({ success: false, error: 'Técnico no encontrado' });
    res.json({ success: true, data: publico(empleado) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/stats', async (req, res, next) => {
  try {
    const empleado = await empleadosRepo.getEmpleadoConStats(Number(req.params.id));
    if (!empleado || !visible(req, empleado)) return res.status(404).json({ success: false, error: 'Técnico no encontrado' });
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

export default router;
