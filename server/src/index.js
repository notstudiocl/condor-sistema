import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import tecnicosRoutes from './routes/tecnicos.js';
import clientesRoutes from './routes/clientes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync, renameSync } from 'fs';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '50mb' }));

const uploadsDir = join(__dirname, '..', 'uploads');
if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

const uploadMulter = multer({ dest: uploadsDir });

// Cache para prevenir duplicados (race condition)
const procesandoOrdenes = new Set();

setInterval(() => {
  try {
    const files = readdirSync(uploadsDir);
    const now = Date.now();
    files.forEach(file => {
      const filepath = join(uploadsDir, file);
      const stat = statSync(filepath);
      if (now - stat.mtimeMs > 3600000) unlinkSync(filepath);
    });
  } catch (e) {}
}, 1800000);

// Upload PDF from n8n
app.post('/api/upload-pdf', uploadMulter.single('file'), (req, res) => {
  try {
    const newName = req.file.filename + '.pdf';
    const newPath = join(req.file.destination, newName);
    renameSync(req.file.path, newPath);
    const url = `https://clientes-condor-api.f8ihph.easypanel.host/uploads/${newName}`;
    console.log('PDF subido:', url);
    res.json({ success: true, url });
  } catch (e) {
    console.error('Error subiendo PDF:', e);
    res.json({ success: false, error: e.message });
  }
});

// Diagnóstico completo de webhook (DNS + fetch)
app.get('/api/diagnostico-webhook', async (req, res) => {
  const webhookUrl = process.env.WEBHOOK_OT_N8N_URL;
  const resultados = {
    webhookUrl,
    timestamp: new Date().toISOString(),
    tests: {}
  };

  // Test 1: DNS resolution
  try {
    const url = new URL(webhookUrl);
    const dns = await import('dns');
    const addresses = await dns.promises.resolve4(url.hostname);
    resultados.tests.dns = { ok: true, addresses };
  } catch (e) {
    resultados.tests.dns = { ok: false, error: e.message };
  }

  // Test 2: Fetch con timeout
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const start = Date.now();
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true, diagnostico: true, timestamp: new Date().toISOString() }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const elapsed = Date.now() - start;
    const text = await response.text();
    resultados.tests.fetch = { ok: response.ok, status: response.status, elapsed: elapsed + 'ms', response: text };
  } catch (e) {
    resultados.tests.fetch = { ok: false, error: e.message, cause: e.cause?.message || null };
  }

  res.json(resultados);
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      mock: process.env.MOCK_MODE === 'true',
      timestamp: new Date().toISOString(),
    },
  });
});

// Test envío completo (no auth, diagnostic)
app.post('/api/test-envio', async (req, res) => {
  try {
    const webhookUrl = process.env.WEBHOOK_OT_N8N_URL;
    const mockMode = process.env.MOCK_MODE === 'true';
    const testData = {
      numero_orden: 'TEST-001',
      fecha: new Date().toISOString(),
      cliente: 'Test Cliente',
      rut: '12.345.678-9',
      trabajos: [{ trabajo: 'Destape', cantidad: 1 }],
      personal: ['Test Tecnico'],
      test: true,
    };

    console.log('=== TEST ENVÍO ===');
    console.log('MOCK_MODE:', mockMode);
    console.log('WEBHOOK_URL:', webhookUrl || 'NO CONFIGURADA');

    if (!webhookUrl) {
      return res.json({ success: false, error: 'WEBHOOK_OT_N8N_URL no está configurada', mockMode });
    }
    if (mockMode) {
      return res.json({ success: false, error: 'MOCK_MODE está activado, el webhook no se envía realmente', mockMode, webhookUrl });
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData),
    });

    const text = await response.text();
    console.log('Test envío - respuesta:', response.status, text);

    res.json({ success: true, status: response.status, response: text, dataSent: testData, webhookUrl, mockMode });
  } catch (error) {
    console.error('Test envío - error:', error);
    res.json({ success: false, error: error.message, webhookUrl: process.env.WEBHOOK_OT_N8N_URL });
  }
});

// Test webhook (no auth, diagnostic)
app.get('/api/test-webhook', async (req, res) => {
  try {
    const webhookUrl = process.env.WEBHOOK_OT_N8N_URL;
    if (!webhookUrl) return res.json({ success: false, error: 'WEBHOOK_OT_N8N_URL no está configurada' });

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true, timestamp: new Date().toISOString(), mensaje: 'Test desde condor-api' }),
    });

    const text = await response.text();
    res.json({ success: true, webhookUrl, status: response.status, response: text });
  } catch (error) {
    res.json({ success: false, webhookUrl: process.env.WEBHOOK_OT_N8N_URL, error: error.message });
  }
});

// Public technicians list (no auth)
app.get('/api/tecnicos-lista', async (_req, res) => {
  try {
    if (process.env.MOCK_MODE === 'true') {
      return res.json({ success: true, data: [
        { recordId: 'mock_rec_1', id: '1', nombre: 'Carlos Méndez' },
        { recordId: 'mock_rec_2', id: '2', nombre: 'Laura Torres' },
        { recordId: 'mock_rec_3', id: '3', nombre: 'Diego Silva' },
        { recordId: 'mock_rec_4', id: '4', nombre: 'Camila Rojas' },
      ]});
    }
    const Airtable = (await import('airtable')).default;
    const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
    const records = await base('Empleados')
      .select({ filterByFormula: `{Activo} = TRUE()` })
      .firstPage();
    const data = records.map(r => ({
      recordId: r.id,
      id: r.get('ID') || r.id,
      nombre: r.get('Nombre'),
    }));
    res.json({ success: true, data });
  } catch (error) {
    res.json({ success: false, error: error.message, data: [] });
  }
});

// Servicios activos desde Airtable
app.get('/api/servicios', async (_req, res) => {
  try {
    const Airtable = (await import('airtable')).default;
    const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
    const records = await base('Servicios').select({
      filterByFormula: '{Activo} = TRUE()',
      sort: [{ field: 'Nombre', direction: 'asc' }],
    }).firstPage();
    const data = records.map(r => ({
      id: r.id,
      nombre: r.get('Nombre') || '',
    }));
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error listando servicios:', error);
    res.json({ success: false, error: error.message, data: [] });
  }
});

// Public client search (no auth, direct Airtable query)
app.get('/api/clientes/buscar', async (req, res) => {
  try {
    const q = req.query.q || '';
    if (q.length < 2) return res.json({ success: true, data: [] });

    const Airtable = (await import('airtable')).default;
    const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
    const records = await base('Clientes').select({ maxRecords: 100 }).firstPage();

    const qLimpio = q.replace(/\./g, '').replace(/-/g, '').toLowerCase();

    const resultados = records
      .filter(r => {
        const rut = (r.get('RUT') || '').replace(/\./g, '').replace(/-/g, '').toLowerCase();
        const nombre = (r.get('Nombre') || '').toLowerCase();
        return rut.includes(qLimpio) || nombre.includes(qLimpio);
      })
      .map(r => ({
        recordId: r.id,
        rut: r.get('RUT'),
        nombre: r.get('Nombre'),
        tipo: r.get('Tipo'),
        empresa: r.get('Empresa') || '',
        email: r.get('Email') || '',
        telefono: r.get('Telefono') || '',
        direccion: r.get('Direccion') || '',
        comuna: r.get('Comuna') || '',
      }));

    res.json({ success: true, data: resultados });
  } catch (error) {
    res.json({ success: false, error: error.message, data: [] });
  }
});

// GET ordenes — historial
app.get('/api/ordenes', async (req, res) => {
  try {
    const Airtable = (await import('airtable')).default;
    const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

    const records = await base('Ordenes de Trabajo').select({
      sort: [{ field: 'Creada', direction: 'desc' }],
      maxRecords: 50,
    }).firstPage();

    const data = records.map(r => ({
      recordId: r.id,
      numeroOrden: r.get('Numero orden') || '',
      fecha: r.get('Fecha') || '',
      estado: r.get('Estado') || 'Enviada',
      clienteEmpresa: r.get('Cliente / Empresa') || '',
      clienteRut: r.get('Cliente RUT') || '',
      direccion: r.get('Direccion') || '',
      comuna: r.get('Comuna') || '',
      total: r.get('Total') || 0,
      metodoPago: r.get('Metodo pago') || '',
      trabajos: r.get('Trabajos realizados') || '[]',
      descripcion: r.get('Descripcion trabajo') || '',
      observaciones: r.get('Observaciones') || '',
      supervisor: r.get('Supervisor') || '',
      horaInicio: r.get('Hora inicio') || '',
      horaTermino: r.get('Hora termino') || '',
      patente: r.get('Patente vehiculo') || '',
      requiereFactura: r.get('Requiere factura') || 'No',
      garantia: r.get('Garantia') || 'Sin garantía',
      ordenCompra: r.get('Orden compra') || '',
      email: r.get('Cliente email') || '',
      telefono: r.get('Cliente telefono') || '',
      empleados: r.get('Empleados') || [],
      fotosAntes: (r.get('Fotos Antes') || []).map(f => ({ url: f.url, filename: f.filename })),
      fotosDespues: (r.get('Fotos Despues') || []).map(f => ({ url: f.url, filename: f.filename })),
      firma: (r.get('Firma') || []).map(f => ({ url: f.url })),
      pdf: (r.get('PDF') || []).map(f => ({ url: f.url, filename: f.filename })),
      creada: r.get('Creada') || '',
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error listando ordenes:', error);
    res.json({ success: false, error: error.message, data: [] });
  }
});

// POST ordenes — Airtable + webhook
app.post('/api/ordenes', async (req, res) => {
  try {
    const data = req.body;
    console.log('=== NUEVA ORDEN ===');
    console.log('1. Recibiendo orden...');

    const Airtable = (await import('airtable')).default;
    const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

    // --- PASO 0: Idempotency check ---
    const idempotencyKey = data.idempotencyKey;

    // Check 1: Cache en memoria (previene race condition)
    if (idempotencyKey) {
      if (procesandoOrdenes.has(idempotencyKey)) {
        console.log('Orden ya está siendo procesada (cache):', idempotencyKey);
        return res.json({
          success: true,
          data: {
            airtableOk: true,
            recordId: null,
            webhookOk: true,
            webhookError: null,
            webhookData: null,
            duplicate: true,
            message: 'Orden ya está siendo procesada',
          },
        });
      }
      procesandoOrdenes.add(idempotencyKey);
      setTimeout(() => procesandoOrdenes.delete(idempotencyKey), 60000);
    }

    // Check 2: Airtable (por si el servidor se reinició)
    if (idempotencyKey) {
      try {
        const existing = await base('Ordenes de Trabajo').select({
          filterByFormula: `{Idempotency Key} = '${idempotencyKey}'`,
          maxRecords: 1,
        }).firstPage();

        if (existing.length > 0) {
          console.log('Orden duplicada encontrada en Airtable:', existing[0].id);
          procesandoOrdenes.delete(idempotencyKey);
          return res.json({
            success: true,
            data: {
              airtableOk: true,
              recordId: existing[0].id,
              webhookOk: true,
              webhookError: null,
              webhookData: null,
              duplicate: true,
              message: 'Orden ya fue creada anteriormente',
            },
          });
        }
      } catch (err) {
        console.error('Error verificando idempotency:', err.message);
      }
    }

    // --- PASO 1: Cliente ---
    let clienteRecordId = data.clienteRecordId;

    if (!clienteRecordId && data.clienteRut) {
      console.log('1a. Creando cliente nuevo...');
      try {
        const clienteRecord = await base('Clientes').create({
          'RUT': data.clienteRut || '',
          'Nombre': data.supervisor || '',
          'Email': data.clienteEmail || '',
          'Telefono': data.clienteTelefono || '',
          'Direccion': data.direccion || '',
          'Comuna': data.comuna || '',
          'Tipo': 'Particular',
          'Empresa': data.clienteEmpresa || '',
        }, { typecast: true });
        clienteRecordId = clienteRecord.id;
        console.log('1b. Cliente creado:', clienteRecordId);
      } catch (err) {
        console.error('Error creando cliente:', err.message);
      }
    }

    // --- PASO 2: Crear Orden en Airtable ---
    console.log('2. Creando orden en Airtable...');

    const ordenFields = {
      'Fecha': data.fecha || new Date().toISOString().split('T')[0],
      'Estado': 'Enviada',
      'Cliente / Empresa': data.clienteEmpresa || '',
      'Cliente email': data.clienteEmail || '',
      'Cliente telefono': data.clienteTelefono || '',
      'Direccion': data.direccion || '',
      'Comuna': data.comuna || '',
      'Orden compra': data.ordenCompra || '',
      'Supervisor': data.supervisor || '',
      'Hora inicio': data.horaInicio || '',
      'Hora termino': data.horaTermino || '',
      'Trabajos realizados': typeof data.trabajos === 'string' ? data.trabajos : JSON.stringify(data.trabajos || []),
      'Descripcion trabajo': data.descripcion || '',
      'Observaciones': data.observaciones || '',
      'Patente vehiculo': data.patenteVehiculo || '',
      'Total': Number(data.total) || 0,
      'Metodo pago': data.metodoPago || '',
      'Requiere factura': data.requiereFactura || 'No',
      'Garantia': data.garantia || 'Sin garantía',
      'Idempotency Key': idempotencyKey || '',
    };

    if (clienteRecordId) {
      ordenFields['Cliente RUT'] = [clienteRecordId];
    }

    if (data.empleadosRecordIds && data.empleadosRecordIds.length > 0) {
      ordenFields['Empleados'] = data.empleadosRecordIds;
    }
    if (data.serviciosIds && data.serviciosIds.length > 0) {
      ordenFields['Servicios'] = data.serviciosIds;
    }
    if (req.user && req.user.recordId) {
      ordenFields['Responsable Orden'] = [req.user.recordId];
    }

    const ordenRecord = await base('Ordenes de Trabajo').create(ordenFields, { typecast: true });
    const ordenRecordId = ordenRecord.id;
    console.log('2b. Orden creada:', ordenRecordId);

    // --- PASO 3: Subir fotos y firma como attachments ---
    const hasFotos = (data.fotosAntes && data.fotosAntes.length > 0) || (data.fotosDespues && data.fotosDespues.length > 0);
    const hasFirma = data.firmaBase64 && data.firmaBase64.startsWith('data:');

    if (hasFotos || hasFirma) {
      console.log('3. Subiendo archivos...');
      const baseUrl = process.env.SERVER_URL || 'https://clientes-condor-api.f8ihph.easypanel.host';

      const guardarFoto = (base64, prefix, index) => {
        try {
          const matches = base64.match(/^data:image\/(.*?);base64,(.*)$/);
          if (!matches) return null;
          const ext = matches[1] === 'png' ? 'png' : 'jpg';
          const buffer = Buffer.from(matches[2], 'base64');
          const filename = `${ordenRecordId}_${prefix}_${index}_${Date.now()}.${ext}`;
          const filepath = join(uploadsDir, filename);
          writeFileSync(filepath, buffer);
          return { url: `${baseUrl}/uploads/${filename}` };
        } catch (e) {
          console.error('Error guardando archivo:', e.message);
          return null;
        }
      };

      const attachFields = {};

      if (data.fotosAntes && data.fotosAntes.length > 0) {
        const urls = data.fotosAntes.map((f, i) => guardarFoto(f, 'antes', i)).filter(Boolean);
        if (urls.length > 0) attachFields['Fotos Antes'] = urls;
      }

      if (data.fotosDespues && data.fotosDespues.length > 0) {
        const urls = data.fotosDespues.map((f, i) => guardarFoto(f, 'despues', i)).filter(Boolean);
        if (urls.length > 0) attachFields['Fotos Despues'] = urls;
      }

      if (hasFirma) {
        const firmaFile = guardarFoto(data.firmaBase64, 'firma', 0);
        if (firmaFile) attachFields['Firma'] = [firmaFile];
      }

      if (Object.keys(attachFields).length > 0) {
        await base('Ordenes de Trabajo').update(ordenRecordId, attachFields);
        console.log('3b. Archivos subidos');
      }
    }

    // --- PASO 4: Webhook ---
    let webhookOk = false;
    let webhookError = null;
    let webhookData = null;
    const webhookUrl = process.env.WEBHOOK_OT_N8N_URL;

    if (webhookUrl) {
      console.log('4. Enviando webhook...');
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const webhookPayload = { ...data, airtableRecordId: ordenRecordId, clienteRecordId };
        // Eliminar campos binarios/base64 que no deben ir al webhook
        delete webhookPayload.fotosAntes;
        delete webhookPayload.fotosDespues;
        delete webhookPayload.firmaBase64;
        delete webhookPayload.firma;

        const payloadJson = JSON.stringify(webhookPayload);
        console.log('4a. Payload size:', payloadJson.length, 'bytes');
        console.log('4a. Webhook URL:', webhookUrl);

        const webhookResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payloadJson,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        webhookOk = webhookResponse.ok;

        try {
          webhookData = await webhookResponse.json();
        } catch (e) {
          webhookData = null;
        }

        console.log('4b. Webhook respuesta:', webhookResponse.status, JSON.stringify(webhookData));
        if (!webhookResponse.ok) {
          webhookError = webhookData?.message || `HTTP ${webhookResponse.status}`;
        }
      } catch (err) {
        console.error('4. Webhook error:', err.message);
        console.error('4b. Webhook error cause:', err.cause?.message || err.cause || 'sin causa');
        console.error('4c. Webhook error code:', err.cause?.code || err.code || 'sin código');
        webhookError = err.message;
      }
    } else {
      webhookError = 'WEBHOOK_OT_N8N_URL no configurada';
    }

    // --- RESPUESTA ---
    if (idempotencyKey) procesandoOrdenes.delete(idempotencyKey);
    console.log('5. Respondiendo - airtableOk: true, webhookOk:', webhookOk);
    res.json({
      success: true,
      data: { airtableOk: true, recordId: ordenRecordId, webhookOk, webhookError, webhookData },
    });
  } catch (error) {
    if (req.body?.idempotencyKey) procesandoOrdenes.delete(req.body.idempotencyKey);
    console.error('ERROR GENERAL:', error.message);
    res.json({ success: false, error: error.message });
  }
});

// PUT ordenes — actualizar y reenviar
app.put('/api/ordenes/:recordId', async (req, res) => {
  try {
    const { recordId } = req.params;
    const data = req.body;
    console.log('=== ACTUALIZANDO ORDEN ===', recordId);

    const Airtable = (await import('airtable')).default;
    const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

    const ordenFields = {
      'Estado': 'Enviada',
      'Cliente / Empresa': data.clienteEmpresa || '',
      'Cliente email': data.clienteEmail || '',
      'Cliente telefono': data.clienteTelefono || '',
      'Direccion': data.direccion || '',
      'Comuna': data.comuna || '',
      'Orden compra': data.ordenCompra || '',
      'Supervisor': data.supervisor || '',
      'Hora inicio': data.horaInicio || '',
      'Hora termino': data.horaTermino || '',
      'Trabajos realizados': typeof data.trabajos === 'string' ? data.trabajos : JSON.stringify(data.trabajos || []),
      'Descripcion trabajo': data.descripcion || '',
      'Observaciones': data.observaciones || '',
      'Patente vehiculo': data.patenteVehiculo || '',
      'Total': Number(data.total) || 0,
      'Metodo pago': data.metodoPago || '',
      'Requiere factura': data.requiereFactura || 'No',
      'Garantia': data.garantia || 'Sin garantía',
    };

    if (data.clienteRecordId) {
      ordenFields['Cliente RUT'] = [data.clienteRecordId];
    }
    if (data.empleadosRecordIds && data.empleadosRecordIds.length > 0) {
      ordenFields['Empleados'] = data.empleadosRecordIds;
    }
    if (data.serviciosIds && data.serviciosIds.length > 0) {
      ordenFields['Servicios'] = data.serviciosIds;
    }
    if (req.user && req.user.recordId) {
      ordenFields['Responsable Orden'] = [req.user.recordId];
    }

    await base('Ordenes de Trabajo').update(recordId, ordenFields, { typecast: true });
    console.log('Orden actualizada en Airtable');

    // Archivos (fotos + firma)
    const baseUrl = process.env.SERVER_URL || 'https://clientes-condor-api.f8ihph.easypanel.host';
    const guardarFoto = (base64, prefix, index) => {
      try {
        const matches = base64.match(/^data:image\/(.*?);base64,(.*)$/);
        if (!matches) return null;
        const ext = matches[1] === 'png' ? 'png' : 'jpg';
        const buffer = Buffer.from(matches[2], 'base64');
        const filename = `${recordId}_${prefix}_${index}_${Date.now()}.${ext}`;
        const filepath = join(uploadsDir, filename);
        writeFileSync(filepath, buffer);
        return { url: `${baseUrl}/uploads/${filename}` };
      } catch (e) { return null; }
    };

    const attachFields = {};
    if (data.fotosAntes && data.fotosAntes.length > 0 && typeof data.fotosAntes[0] === 'string' && data.fotosAntes[0].startsWith('data:')) {
      const urls = data.fotosAntes.map((f, i) => guardarFoto(f, 'antes', i)).filter(Boolean);
      if (urls.length > 0) attachFields['Fotos Antes'] = urls;
    }
    if (data.fotosDespues && data.fotosDespues.length > 0 && typeof data.fotosDespues[0] === 'string' && data.fotosDespues[0].startsWith('data:')) {
      const urls = data.fotosDespues.map((f, i) => guardarFoto(f, 'despues', i)).filter(Boolean);
      if (urls.length > 0) attachFields['Fotos Despues'] = urls;
    }
    if (data.firmaBase64 && data.firmaBase64.startsWith('data:')) {
      const firmaFile = guardarFoto(data.firmaBase64, 'firma', 0);
      if (firmaFile) attachFields['Firma'] = [firmaFile];
    }
    if (Object.keys(attachFields).length > 0) {
      await base('Ordenes de Trabajo').update(recordId, attachFields);
    }

    // Webhook
    let webhookOk = false;
    let webhookError = null;
    let webhookData = null;
    const webhookUrl = process.env.WEBHOOK_OT_N8N_URL;
    if (webhookUrl) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        const webhookPayload = { ...data, airtableRecordId: recordId, accion: 'actualizar' };
        // Eliminar campos binarios/base64 que no deben ir al webhook
        delete webhookPayload.fotosAntes;
        delete webhookPayload.fotosDespues;
        delete webhookPayload.firmaBase64;
        delete webhookPayload.firma;

        const payloadJson = JSON.stringify(webhookPayload);
        console.log('PUT webhook - Payload size:', payloadJson.length, 'bytes');
        console.log('PUT webhook - URL:', webhookUrl);

        const webhookResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payloadJson,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        webhookOk = webhookResponse.ok;

        try {
          webhookData = await webhookResponse.json();
        } catch (e) {
          webhookData = null;
        }

        if (!webhookResponse.ok) {
          webhookError = webhookData?.message || `HTTP ${webhookResponse.status}`;
        }
      } catch (err) {
        console.error('PUT webhook error:', err.message);
        console.error('PUT webhook error cause:', err.cause?.message || err.cause || 'sin causa');
        console.error('PUT webhook error code:', err.cause?.code || err.code || 'sin código');
        webhookError = err.message;
      }
    }

    res.json({ success: true, data: { airtableOk: true, recordId, webhookOk, webhookError, webhookData } });
  } catch (error) {
    console.error('Error actualizando orden:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST reenviar orden al webhook
app.post('/api/ordenes/:recordId/reenviar', async (req, res) => {
  try {
    const { recordId } = req.params;
    console.log('=== REENVIANDO ORDEN ===', recordId);

    const Airtable = (await import('airtable')).default;
    const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

    const record = await base('Ordenes de Trabajo').find(recordId);

    const webhookPayload = {
      airtableRecordId: recordId,
      accion: 'reenviar',
      fecha: record.get('Fecha'),
      clienteEmpresa: record.get('Cliente / Empresa'),
      supervisor: record.get('Supervisor'),
      email: record.get('Cliente email'),
      telefono: record.get('Cliente telefono'),
      direccion: record.get('Direccion'),
      comuna: record.get('Comuna'),
      ordenCompra: record.get('Orden compra'),
      horaInicio: record.get('Hora inicio'),
      horaTermino: record.get('Hora termino'),
      trabajos: record.get('Trabajos realizados'),
      descripcion: record.get('Descripcion trabajo'),
      observaciones: record.get('Observaciones'),
      patente: record.get('Patente vehiculo'),
      total: record.get('Total'),
      metodoPago: record.get('Metodo pago'),
      requiereFactura: record.get('Requiere factura'),
      garantia: record.get('Garantia') || 'Sin garantía',
      personal: record.get('Empleados') || [],
    };

    let webhookOk = false;
    let webhookError = null;
    let webhookData = null;
    const webhookUrl = process.env.WEBHOOK_OT_N8N_URL;

    if (webhookUrl) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const payloadJson = JSON.stringify(webhookPayload);
        console.log('Reenvío webhook - Payload size:', payloadJson.length, 'bytes');
        console.log('Reenvío webhook - URL:', webhookUrl);

        const webhookResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payloadJson,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        webhookOk = webhookResponse.ok;
        try { webhookData = await webhookResponse.json(); } catch (e) { webhookData = null; }
        if (!webhookResponse.ok) {
          webhookError = webhookData?.message || `HTTP ${webhookResponse.status}`;
        }
      } catch (err) {
        console.error('Reenvío webhook error:', err.message);
        console.error('Reenvío webhook error cause:', err.cause?.message || err.cause || 'sin causa');
        console.error('Reenvío webhook error code:', err.cause?.code || err.code || 'sin código');
        webhookError = err.message;
      }
    } else {
      webhookError = 'WEBHOOK_OT_N8N_URL no configurada';
    }

    console.log('Reenvío resultado - webhookOk:', webhookOk);
    res.json({ success: true, data: { webhookOk, webhookError, webhookData } });
  } catch (error) {
    console.error('Error reenviando orden:', error);
    res.json({ success: false, error: error.message });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tecnicos', tecnicosRoutes);
app.use('/api/clientes', clientesRoutes);

// Error handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Condor API corriendo en http://localhost:${PORT}`);
  console.log(`Mock mode: ${process.env.MOCK_MODE === 'true' ? 'ACTIVADO' : 'desactivado'}`);
});
