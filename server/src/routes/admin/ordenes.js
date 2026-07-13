import { Router } from 'express';
import * as ordenesRepo from '../../repositories/ordenesRepo.js';
import * as notificacionesRepo from '../../repositories/notificacionesRepo.js';
import * as ordenService from '../../services/ordenService.js';
import * as auditRepo from '../../repositories/auditRepo.js';
import { adminAuthMiddleware } from '../../middleware/adminAuth.js';

const router = Router();

router.use(adminAuthMiddleware);

// GET /api/admin/ordenes — paginación real (el admin necesita las 410+, a diferencia
// del técnico que solo ve las últimas 50 en GET /api/ordenes).
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, estado, q, tecnicoId, fechaDesde, fechaHasta } = req.query;
    const estadoFilter = estado ? String(estado).split(',').filter(Boolean) : undefined;

    const result = await ordenesRepo.listOrdenesAdmin({
      page: Math.max(1, Number(page) || 1),
      limit: Math.min(200, Math.max(1, Number(limit) || 50)),
      estado: estadoFilter,
      q: q ? String(q) : undefined,
      tecnicoId: tecnicoId ? Number(tecnicoId) : undefined,
      fechaDesde: fechaDesde ? String(fechaDesde) : undefined,
      fechaHasta: fechaHasta ? String(fechaHasta) : undefined,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const orden = await ordenesRepo.getOrdenById(Number(req.params.id));
    if (!orden) return res.status(404).json({ success: false, error: 'Orden no encontrada' });
    // Enriquecer cada foto con su URL pública (r2_key es solo la key en DB — la URL
    // se arma en runtime, así puede cambiar de dominio sin re-subir nada, ver ordenesRepo).
    const fotos = (orden.fotos || []).map((f) => ({ ...f, url: ordenesRepo.buildFotoUrl(f.r2_key) }));
    res.json({ success: true, data: { ...orden, fotos } });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/ordenes/:id/notificaciones — log de envíos de esta orden (email/telegram)
router.get('/:id/notificaciones', async (req, res, next) => {
  try {
    const { rows } = await notificacionesRepo.listLog({ ordenId: Number(req.params.id), limit: 50 });
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/ordenes/:id/reenviar — regenera el PDF y reenvía las notificaciones
// (misma lógica que el reenvío del técnico, reutilizada desde ordenService).
router.post('/:id/reenviar', async (req, res, next) => {
  try {
    const resultado = await ordenService.reenviarOrden(Number(req.params.id));
    if (resultado.data?.webhookError === 'Orden no encontrada') {
      return res.status(404).json(resultado);
    }
    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/ordenes/:id/estado — cambio de estado individual (usado por el
// estado clickeable inline de la tabla de órdenes, con Deshacer en el frontend)
router.patch('/:id/estado', async (req, res, next) => {
  try {
    const { estado } = req.body || {};
    if (!estado) return res.status(400).json({ success: false, error: 'estado es requerido' });

    const orden = await ordenesRepo.setEstado(Number(req.params.id), estado);
    if (!orden) return res.status(404).json({ success: false, error: 'Orden no encontrada' });
    res.json({ success: true, data: orden });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/ordenes/estado-masivo — cambio de estado en lote (selección múltiple +
// "Marcar como Facturada", el momento wow de cuadrar contra la factura del contador)
router.patch('/estado-masivo', async (req, res, next) => {
  try {
    const { ids, estado } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0 || !estado) {
      return res.status(400).json({ success: false, error: 'ids (array) y estado son requeridos' });
    }

    const resultados = await Promise.all(ids.map((id) => ordenesRepo.setEstado(Number(id), estado)));
    const actualizadas = resultados.filter(Boolean).length;

    auditRepo.registrar({
      adminUserId: req.admin?.id,
      accion: 'cambio_estado_masivo',
      entidad: 'ordenes',
      entidadId: null,
      detalle: { ids, estado, actualizadas },
    }).catch((err) => console.error('[admin/ordenes] no se pudo registrar auditoría de cambio masivo:', err.message));

    res.json({ success: true, data: { actualizadas, total: ids.length } });
  } catch (err) {
    next(err);
  }
});

export default router;
