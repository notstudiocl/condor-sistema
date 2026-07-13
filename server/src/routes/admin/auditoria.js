import { Router } from 'express';
import * as auditRepo from '../../repositories/auditRepo.js';
import { adminAuthMiddleware } from '../../middleware/adminAuth.js';
import { requireRole } from '../../middleware/requireRole.js';

const router = Router();

// Vista global de auditoría — solo rol 'admin' (matriz de permisos del plan: 'oficina'
// ve el historial de una orden puntual desde su ficha, pero no el log completo del sistema).
router.use(adminAuthMiddleware, requireRole('admin'));

// GET /api/admin/auditoria — paginado, filtros opcionales (entidad, adminUserId, rango de fechas)
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, entidad, adminUserId, fechaDesde, fechaHasta } = req.query;
    const result = await auditRepo.listar({
      page: Math.max(1, Number(page) || 1),
      limit: Math.min(200, Math.max(1, Number(limit) || 50)),
      entidad: entidad ? String(entidad) : undefined,
      adminUserId: adminUserId ? Number(adminUserId) : undefined,
      fechaDesde: fechaDesde ? String(fechaDesde) : undefined,
      fechaHasta: fechaHasta ? String(fechaHasta) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
