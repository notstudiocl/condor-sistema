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
