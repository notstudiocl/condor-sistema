import { Router } from 'express';
import * as ordenesRepo from '../repositories/ordenesRepo.js';
import * as ordenService from '../services/ordenService.js';
import { authMiddleware } from '../middleware/auth.js';
import { getSubscriptionStatus } from '../middleware/subscriptionGate.js';

const router = Router();

// ---------- helpers de shape (contrato con el frontend, congelado clave por clave) ----------
// La idempotencia, creación de cliente, resolución de servicios/rec* y el pipeline
// fotos->PDF->notificaciones viven en ordenService.js (F2b/F3) — esta capa solo
// adapta HTTP <-> servicio.

function shapeOrden(orden) {
  const trabajos = (orden.trabajos || [])
    .slice()
    .sort((a, b) => (a.orden_index ?? 0) - (b.orden_index ?? 0))
    // servicioId (null si es un trabajo personalizado) se agrega para que el wizard
    // pueda reconstruir la edición sin adivinar por nombre contra el catálogo activo
    // actual — antes se perdían silenciosamente los trabajos con servicio desactivado,
    // renombrado, o personalizado al editar una orden (bug real corregido).
    .map((t) => ({
      trabajo: t.servicio_nombre || t.nombre_personalizado || '',
      cantidad: t.cantidad,
      servicioId: t.servicio_id != null ? String(t.servicio_id) : null,
    }));

  const fotos = orden.fotos || [];
  const fotosAntes = fotos.filter((f) => f.tipo === 'antes').map((f) => ({ url: ordenesRepo.buildFotoUrl(f.r2_key), filename: f.filename }));
  const fotosDespues = fotos.filter((f) => f.tipo === 'despues').map((f) => ({ url: ordenesRepo.buildFotoUrl(f.r2_key), filename: f.filename }));
  const firma = fotos.filter((f) => f.tipo === 'firma').map((f) => ({ url: ordenesRepo.buildFotoUrl(f.r2_key) }));
  const pdf = fotos.filter((f) => f.tipo === 'pdf').map((f) => ({ url: ordenesRepo.buildFotoUrl(f.r2_key), filename: f.filename }));

  return {
    recordId: String(orden.id),
    numeroOrden: orden.numero_orden_display || '',
    fecha: orden.fecha || '',
    estado: orden.estado || 'Enviada',
    clienteEmpresa: orden.cliente_empresa || '',
    clienteRut: orden.cliente?.rut || '',
    direccion: orden.direccion || '',
    comuna: orden.comuna || '',
    total: Number(orden.total) || 0,
    metodoPago: orden.metodo_pago || '',
    trabajos: JSON.stringify(trabajos),
    descripcion: orden.descripcion_trabajo || '',
    observaciones: orden.observaciones || '',
    supervisor: orden.supervisor || '',
    horaInicio: orden.hora_inicio || '',
    horaTermino: orden.hora_termino || '',
    patente: orden.patente_vehiculo || '',
    requiereFactura: orden.requiere_factura ? 'Sí' : 'No',
    garantia: orden.garantia || 'Sin garantía',
    ordenCompra: orden.orden_compra || '',
    email: orden.cliente_email || '',
    telefono: orden.cliente_telefono || '',
    empleados: (orden.empleados || []).map((e) => e.nombre),
    // ids en el mismo orden que `empleados` (arriba) — agregado para que el wizard
    // pueda restaurar el equipo real al editar en vez de perderlo (bug real corregido,
    // ver OrdenWizardPage.jsx). `empleados` se mantiene igual por compatibilidad.
    empleadosIds: (orden.empleados || []).map((e) => String(e.id)),
    fotosAntes,
    fotosDespues,
    firma,
    pdf,
    creada: orden.created_at || '',
  };
}

function checkSubscriptionOrReject(res) {
  const status = getSubscriptionStatus();
  if (!status.active) {
    res.status(403).json({
      success: false,
      error: status.message || 'Sistema suspendido.',
      code: 'SUBSCRIPTION_INACTIVE',
    });
    return false;
  }
  return true;
}

// Resuelve un :id de ruta que puede venir como bigint de Postgres O como 'rec*' de
// Airtable (links cacheados en un PWA viejo antes del corte) a la orden hidratada.
async function resolverOrdenPorParam(id) {
  return id.startsWith('rec') ? ordenesRepo.getOrdenByAirtableId(id) : ordenesRepo.getOrdenById(Number(id));
}

// ---------- rutas ----------

// GET /api/ordenes — historial, máx 50 recientes (público, igual que hoy)
router.get('/', async (_req, res) => {
  try {
    const ordenes = await ordenesRepo.listOrdenesRecientesCompletas(50);
    res.json({ success: true, data: ordenes.map(shapeOrden) });
  } catch (error) {
    console.error('Error listando ordenes:', error.message);
    res.status(500).json({ success: false, error: error.message, data: [] });
  }
});

// GET /api/ordenes/:id — detalle real (no existía antes; DetalleOrdenPage bajaba 50 y
// filtraba client-side, por eso las órdenes viejas fuera de esa ventana "no se encontraban").
router.get('/:id', async (req, res, next) => {
  try {
    const orden = await resolverOrdenPorParam(req.params.id);
    if (!orden) return res.status(404).json({ success: false, error: 'Orden no encontrada' });
    res.json({ success: true, data: shapeOrden(orden) });
  } catch (err) {
    next(err);
  }
});

// POST /api/ordenes — crear orden completa: idempotencia, cliente, orden+trabajos,
// fotos/firma a R2, PDF (Gotenberg) y notificaciones (fire-and-forget) vía ordenService.
router.post('/', authMiddleware, async (req, res) => {
  if (!checkSubscriptionOrReject(res)) return;

  try {
    const data = { ...(req.body || {}), responsableId: req.user?.recordId || null };
    const result = await ordenService.createOrdenCompleta(data);
    // Guard obligatorio (plan, resiliencia terreno #6): si el timeout global de 30s ya
    // respondió 504 mientras esta promesa seguía corriendo, escribir la respuesta acá
    // tira ERR_HTTP_HEADERS_SENT — sin este guard, y como ese throw ocurre fuera del
    // try/catch de arriba (ya estamos en el then exitoso), quedaba sin capturar y
    // tumbaba el proceso Node entero (bug real encontrado en QA: una orden lenta
    // volteaba el backend para todos los técnicos).
    if (res.headersSent) return;
    res.json(result);
  } catch (error) {
    console.error('Error creando orden:', error);
    if (res.headersSent) return;
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/ordenes/:id — editar y reenviar (regenera PDF + notificaciones vía ordenService)
router.put('/:id', authMiddleware, async (req, res) => {
  if (!checkSubscriptionOrReject(res)) return;

  try {
    const { id } = req.params;
    let ordenId = Number(id);
    if (id.startsWith('rec')) {
      const existente = await ordenesRepo.getOrdenByAirtableId(id);
      if (!existente) return res.status(404).json({ success: false, error: 'Orden no encontrada' });
      ordenId = existente.id;
    }

    const data = { ...(req.body || {}), responsableId: req.user?.recordId || null };
    const result = await ordenService.actualizarOrdenCompleta(ordenId, data);
    if (res.headersSent) return; // ver comentario en POST / — mismo guard obligatorio
    if (result.notFound) return res.status(404).json({ success: false, error: 'Orden no encontrada' });
    res.json(result);
  } catch (error) {
    console.error('Error actualizando orden:', error);
    if (res.headersSent) return;
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/ordenes/:id/reenviar — regenerar PDF + reenviar notificaciones
router.post('/:id/reenviar', authMiddleware, async (req, res) => {
  if (!checkSubscriptionOrReject(res)) return;

  try {
    const orden = await resolverOrdenPorParam(req.params.id);
    if (!orden) return res.status(404).json({ success: false, error: 'Orden no encontrada' });

    const result = await ordenService.reenviarOrden(orden.id);
    if (res.headersSent) return; // ver comentario en POST / — mismo guard obligatorio
    res.json(result);
  } catch (error) {
    console.error('Error reenviando orden:', error);
    if (res.headersSent) return;
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
