import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import ordenesRoutes from './routes/ordenes.js';
import tecnicosRoutes from './routes/tecnicos.js';
import clientesRoutes from './routes/clientes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '10mb' }));

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

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/ordenes', ordenesRoutes);
app.use('/api/tecnicos', tecnicosRoutes);
app.use('/api/clientes', clientesRoutes);

// Error handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Condor API corriendo en http://localhost:${PORT}`);
  console.log(`Mock mode: ${process.env.MOCK_MODE === 'true' ? 'ACTIVADO' : 'desactivado'}`);
});
