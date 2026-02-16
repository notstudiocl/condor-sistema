const MOCK_MODE = process.env.MOCK_MODE === 'true';
const WEBHOOK_URL = process.env.WEBHOOK_OT_N8N_URL;

export async function enviarWebhookOrden(data) {
  const payload = {
    'Fecha': data.fecha,
    'Estado': 'Completada',
    'Cliente': data.clienteNombre,
    'Cliente RUT': data.clienteRut,
    'Cliente Email': data.clienteEmail,
    'Cliente Telefono': data.clienteTelefono,
    'Cliente Direccion': data.direccion,
    'Cliente Comuna': data.comuna,
    'Orden de Compra': data.ordenCompra,
    'Supervisor': data.supervisor,
    'Hora Inicio': data.horaInicio,
    'Hora Termino': data.horaTermino,
    'Trabajos Realizados': data.trabajos,
    'Descripcion Trabajo': data.descripcion,
    'Observaciones': data.observaciones,
    'Personal': data.personal,
    'Patente Vehiculo': data.patenteVehiculo,
    'Total': data.total,
    'Metodo Pago': data.metodoPago,
    'Garantia': data.garantia,
    'Requiere Factura': data.requiereFactura,
    'Firma Supervisor': data.firmaBase64,
    'Fotos Antes': data.fotosAntes || [],
    'Fotos Despues': data.fotosDespues || [],
    'Fecha Envio': new Date().toISOString(),
  };

  if (MOCK_MODE) {
    console.log('[MOCK] Webhook enviado:', JSON.stringify(payload, null, 2).slice(0, 500) + '...');
    return { success: true, mock: true };
  }

  if (!WEBHOOK_URL) {
    console.warn('WEBHOOK_OT_N8N_URL no configurada, omitiendo webhook');
    return { success: true, skipped: true };
  }

  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Webhook respondió con status ${res.status}`);
  }

  return { success: true };
}
