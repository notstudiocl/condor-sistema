import { Router } from 'express';
import Airtable from 'airtable';
import { authMiddleware } from '../middleware/auth.js';
import { buscarClientes } from '../services/airtable.js';

const router = Router();

// Diagnostic endpoint — NO auth, raw Airtable response
router.get('/test', async (_req, res) => {
  try {
    if (process.env.MOCK_MODE === 'true') {
      return res.json({ success: true, mock: true, message: 'Mock mode active, no Airtable call' });
    }
    Airtable.configure({ apiKey: process.env.AIRTABLE_API_KEY });
    const base = Airtable.base(process.env.AIRTABLE_BASE_ID);
    const records = await base('Clientes').select({ maxRecords: 10 }).firstPage();
    const data = records.map((r) => ({ id: r.id, fields: r.fields }));
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, stack: err.stack });
  }
});

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
