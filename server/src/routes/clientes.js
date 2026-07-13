import { Router } from 'express';
import * as clientesRepo from '../repositories/clientesRepo.js';

const router = Router();

// Búsqueda de clientes por RUT/nombre/empresa/email/teléfono/comuna.
// Pública, sin auth — se usa en el paso 1 del wizard antes de cualquier login
// (implementación única: antes había una versión pública en index.js y otra
// autenticada aquí mismo, duplicadas y con la pública ganando siempre).
router.get('/buscar', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ success: true, data: [] });

    const clientes = await clientesRepo.buscarClientes(q);
    const data = clientes.map((c) => ({
      recordId: String(c.id),
      rut: c.rut || '',
      nombre: c.nombre || '',
      tipo: c.tipo || '',
      empresa: c.empresa || '',
      email: c.email || '',
      telefono: c.telefono || '',
      direccion: c.direccion || '',
      comuna: c.comuna || '',
    }));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
