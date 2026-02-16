import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { crearOrdenEnAirtable } from '../services/airtable.js';
import { enviarWebhookOrden } from '../services/webhook.js';

const router = Router();

router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const data = req.body;

    // Guardar en Airtable
    const record = await crearOrdenEnAirtable(data);

    // Enviar webhook a n8n
    let webhookOk = true;
    let webhookError = null;
    try {
      const webhookResult = await enviarWebhookOrden(data);
      if (webhookResult?.skipped) {
        webhookOk = false;
        webhookError = 'WEBHOOK_OT_N8N_URL no configurada en el servidor';
      }
    } catch (webhookErr) {
      console.error('Error al enviar webhook (orden guardada):', webhookErr.message);
      webhookOk = false;
      webhookError = webhookErr.message;
    }

    res.status(201).json({
      success: true,
      data: {
        id: record.id,
        message: 'Orden creada exitosamente',
        webhookOk,
        webhookError,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
