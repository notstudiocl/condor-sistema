import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { crearOrdenEnAirtable } from '../services/airtable.js';
import { enviarWebhookOrden } from '../services/webhook.js';

const router = Router();

router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const data = req.body;
    console.log('=== NUEVA ORDEN ===');
    console.log('1. Recibiendo orden:', JSON.stringify(data).substring(0, 300));

    // Guardar en Airtable
    const record = await crearOrdenEnAirtable(data);
    console.log('2. Orden creada en Airtable:', JSON.stringify(record));

    // Enviar webhook a n8n
    let webhookOk = true;
    let webhookError = null;
    console.log('3. Enviando webhook...');
    try {
      const webhookResult = await enviarWebhookOrden(data);
      console.log('4. Webhook resultado:', JSON.stringify(webhookResult));
      if (webhookResult?.skipped) {
        webhookOk = false;
        webhookError = 'WEBHOOK_OT_N8N_URL no configurada en el servidor';
      }
      if (webhookResult?.mock) {
        console.log('4b. MOCK_MODE activo - webhook NO enviado realmente');
      }
    } catch (webhookErr) {
      console.error('4. ERROR webhook:', webhookErr.message);
      webhookOk = false;
      webhookError = webhookErr.message;
    }

    console.log('5. Respondiendo al frontend - webhookOk:', webhookOk);
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
    console.error('ERROR GENERAL en POST /api/ordenes:', err.message);
    next(err);
  }
});

export default router;
