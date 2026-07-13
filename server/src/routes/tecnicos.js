import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as empleadosRepo from '../repositories/empleadosRepo.js';

const router = Router();

// Lista pública de técnicos activos (sin auth) — usada en el wizard, paso 3
// ("Personal asignado"), antes de que el técnico esté necesariamente logueado.
router.get('/tecnicos-lista', async (_req, res) => {
  try {
    const empleados = await empleadosRepo.listActivos();
    const data = empleados.map((e) => ({
      recordId: String(e.id),
      id: e.codigo || String(e.id),
      nombre: e.nombre,
    }));
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error listando técnicos (público):', error.message);
    res.status(500).json({ success: false, error: error.message, data: [] });
  }
});

// Lista de técnicos activos, requiere token
router.get('/tecnicos', authMiddleware, async (_req, res, next) => {
  try {
    const empleados = await empleadosRepo.listActivos();
    const data = empleados.map((e) => ({
      id: e.codigo || String(e.id),
      recordId: String(e.id),
      nombre: e.nombre,
      usuario: e.usuario,
      telefono: e.telefono,
    }));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
