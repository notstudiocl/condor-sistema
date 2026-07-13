import { Router } from 'express';
import * as serviciosRepo from '../repositories/serviciosRepo.js';

const router = Router();

// Servicios activos — público, sin auth (usado por el wizard al montar, paso 2)
router.get('/servicios', async (_req, res) => {
  try {
    const servicios = await serviciosRepo.listActivos();
    const data = servicios.map((s) => ({ id: String(s.id), nombre: s.nombre }));
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error listando servicios:', error.message);
    res.status(500).json({ success: false, error: error.message, data: [] });
  }
});

export default router;
