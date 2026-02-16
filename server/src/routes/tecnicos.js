import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getTecnicos } from '../services/airtable.js';

const router = Router();

router.get('/', authMiddleware, async (_req, res, next) => {
  try {
    const tecnicos = await getTecnicos();
    res.json({ success: true, data: tecnicos });
  } catch (err) {
    next(err);
  }
});

export default router;
