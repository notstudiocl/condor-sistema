import { Router } from 'express';
import * as dashboardRepo from '../../repositories/dashboardRepo.js';
import { adminAuthMiddleware } from '../../middleware/adminAuth.js';

const router = Router();

router.use(adminAuthMiddleware);

// GET /api/admin/dashboard/kpis — todo agregado en Postgres, nada calculado en JS.
router.get('/kpis', async (_req, res, next) => {
  try {
    const [kpis, topServicios, ordenesPorDia, pendientesFacturarAntiguas] = await Promise.all([
      dashboardRepo.getKpis(),
      dashboardRepo.getTopServiciosMes(5),
      dashboardRepo.getOrdenesPorDiaSemana(),
      dashboardRepo.getPendientesFacturarAntiguas(8),
    ]);

    res.json({
      success: true,
      data: { ...kpis, topServicios, ordenesPorDia, pendientesFacturarAntiguas },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
