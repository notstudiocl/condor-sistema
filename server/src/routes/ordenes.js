import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { crearOrdenEnAirtable } from '../services/airtable.js';
import { enviarWebhookOrden } from '../services/webhook.js';

const router = Router();

router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const data = req.body;

    // Validación básica
    if (!data.clienteNombre || !data.direccion || !data.descripcion) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos: cliente, dirección y descripción del trabajo',
      });
    }

    if (!data.personal || data.personal.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Debe incluir al menos una persona en el equipo',
      });
    }

    // Guardar en Airtable
    const record = await crearOrdenEnAirtable(data);

    // Enviar webhook a n8n
    try {
      await enviarWebhookOrden(data);
    } catch (webhookErr) {
      console.error('Error al enviar webhook (orden guardada):', webhookErr.message);
    }

    res.status(201).json({
      success: true,
      data: { id: record.id, message: 'Orden creada exitosamente' },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
