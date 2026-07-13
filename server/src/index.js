import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import tecnicosRoutes from './routes/tecnicos.js';
import serviciosRoutes from './routes/servicios.js';
import clientesRoutes from './routes/clientes.js';
import ordenesRoutes from './routes/ordenes.js';
import adminAuthRoutes from './routes/admin/auth.js';
import adminOrdenesRoutes from './routes/admin/ordenes.js';
import adminClientesRoutes from './routes/admin/clientes.js';
import adminEmpleadosRoutes from './routes/admin/empleados.js';
import adminServiciosRoutes from './routes/admin/servicios.js';
import adminNotificacionesRoutes from './routes/admin/notificaciones.js';
import adminPlantillasRoutes from './routes/admin/plantillas.js';
import adminUsuariosRoutes from './routes/admin/usuarios.js';
import adminDashboardRoutes from './routes/admin/dashboard.js';
import adminSettingsRoutes from './routes/admin/settings.js';
import adminAuditoriaRoutes from './routes/admin/auditoria.js';
import { errorHandler } from './middleware/errorHandler.js';
import { getSubscriptionStatus, subscriptionGate } from './middleware/subscriptionGate.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
// OBLIGATORIO: hasta 12 fotos base64 por orden (~1280x1280 JPEG 55%) pesan 2.5-4.5MB
// por request. Sin este límite, toda orden real de terreno falla con 413.
app.use(express.json({ limit: '50mb' }));

// Timeout global de seguridad (30s) — evita requests colgados indefinidamente si algún
// paso downstream (DB, R2, Gotenberg en F3) nunca responde.
app.use((req, res, next) => {
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      console.error(`[TIMEOUT] ${req.method} ${req.originalUrl} (30s)`);
      res.status(504).json({ success: false, error: 'El servidor tardó demasiado en responder. Intente nuevamente.' });
    }
  }, 30000);
  res.on('finish', () => clearTimeout(timeout));
  res.on('close', () => clearTimeout(timeout));
  next();
});

// Endpoint público consultado por la app de terreno (SubscriptionBanner.jsx) para
// mostrar el aviso de suspensión. Estado real vive en SUBSCRIPTION_ACTIVE/SUBSCRIPTION_MESSAGE.
app.get('/api/subscription-status', (_req, res) => {
  res.json({ success: true, data: getSubscriptionStatus() });
});

app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

app.use('/api/auth', authRoutes);
app.use('/api', tecnicosRoutes); // /api/tecnicos-lista (público), /api/tecnicos (auth)
app.use('/api', serviciosRoutes); // /api/servicios
app.use('/api/clientes', clientesRoutes);
app.use('/api/ordenes', ordenesRoutes);

// Kill switch: bloquea TODO /api/admin/* (incluido el login) si el servicio está
// suspendido — se monta antes de adminAuthMiddleware en cada ruta admin.
app.use('/api/admin', subscriptionGate);

app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/ordenes', adminOrdenesRoutes);
app.use('/api/admin/clientes', adminClientesRoutes);
app.use('/api/admin/empleados', adminEmpleadosRoutes);
app.use('/api/admin/servicios', adminServiciosRoutes);
app.use('/api/admin/notificaciones', adminNotificacionesRoutes);
app.use('/api/admin/plantillas', adminPlantillasRoutes);
app.use('/api/admin/usuarios', adminUsuariosRoutes);
app.use('/api/admin/dashboard', adminDashboardRoutes);
app.use('/api/admin/settings', adminSettingsRoutes);
app.use('/api/admin/auditoria', adminAuditoriaRoutes);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Condor API corriendo en http://localhost:${PORT}`);
});

export default app;
