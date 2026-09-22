import { Router } from 'express';
import * as dashboardRepo from '../../repositories/dashboardRepo.js';
import { adminAuthMiddleware } from '../../middleware/adminAuth.js';

const router = Router();

router.use(adminAuthMiddleware);

// GET /api/admin/dashboard/kpis — todo agregado en Postgres, nada calculado en JS.
router.get('/kpis', async (_req, res, next) => {
  try {
    const [kpis, topServicios, ordenesPorDia, porTecnico, topClientes, problemas] = await Promise.all([
      dashboardRepo.getKpis(),
      dashboardRepo.getTopServiciosMes(5),
      dashboardRepo.getOrdenesPorDiaSemana(180),
      dashboardRepo.getOrdenesPorTecnico(30),
      dashboardRepo.getTopClientes(90, 6),
      dashboardRepo.getOrdenesConProblemas(8),
    ]);

    res.json({
      success: true,
      data: { ...kpis, topServicios, ordenesPorDia, porTecnico, topClientes, problemas },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
