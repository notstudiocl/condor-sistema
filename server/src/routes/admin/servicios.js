import { Router } from 'express';
import * as serviciosRepo from '../../repositories/serviciosRepo.js';
import { adminAuthMiddleware } from '../../middleware/adminAuth.js';

const router = Router();

router.use(adminAuthMiddleware);

// GET /api/admin/servicios — tabla con usos reales y última vez usado (agregado en Postgres)
router.get('/', async (_req, res, next) => {
  try {
    const servicios = await serviciosRepo.listTodos();
    res.json({ success: true, data: servicios });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/servicios — alta inline
router.post('/', async (req, res, next) => {
  try {
    const { nombre } = req.body || {};
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ success: false, error: 'nombre es requerido' });
    }
    const existente = await serviciosRepo.getByNombre(nombre);
    if (existente) {
      return res.status(409).json({ success: false, error: 'Ya existe un servicio con ese nombre' });
    }
    const servicio = await serviciosRepo.crearServicio(nombre);
    res.status(201).json({ success: true, data: servicio });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/servicios/:id — editar nombre / toggle activo (optimista en el frontend)
router.put('/:id', async (req, res, next) => {
  try {
    const { nombre, activo } = req.body || {};
    const servicio = await serviciosRepo.actualizarServicio(Number(req.params.id), { nombre, activo });
    if (!servicio) return res.status(404).json({ success: false, error: 'Servicio no encontrado' });
    res.json({ success: true, data: servicio });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/servicios/:id — solo si usos=0; si no, el frontend debe desactivar (PUT)
router.delete('/:id', async (req, res, next) => {
  try {
    const resultado = await serviciosRepo.eliminarServicioSiSinUso(Number(req.params.id));
    if (!resultado.eliminado) {
      return res.status(409).json({
        success: false,
        error: `Este servicio tiene ${resultado.usos} orden(es) asociada(s); no se puede eliminar. Desactívalo en su lugar.`,
      });
    }
    res.json({ success: true, data: { eliminado: true } });
  } catch (err) {
    next(err);
  }
});

export default router;
