import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { buscarClientes } from '../services/airtable.js';

const router = Router();

router.get('/buscar', authMiddleware, async (req, res, next) => {
  try {
    const query = req.query.q || '';
    if (query.length < 2) {
      return res.json({ success: true, data: [] });
    }
    const clientes = await buscarClientes(query);
    res.json({ success: true, data: clientes });
  } catch (err) {
    next(err);
  }
});

export default router;
