import { Router } from 'express';
import * as ordenesRepo from '../repositories/ordenesRepo.js';
import * as ordenService from '../services/ordenService.js';
import { authMiddleware } from '../middleware/auth.js';
import { subscriptionGate } from '../middleware/subscriptionGate.js';

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

// Resuelve un :id de ruta que puede venir como bigint de Postgres O como 'rec*' de
// Airtable (links cacheados en un PWA viejo antes del corte) a la orden hidratada.
async function resolverOrdenPorParam(id) {
  if (id.startsWith('rec')) return ordenesRepo.getOrdenByAirtableId(id);
  if (!/^\d+$/.test(id)) return null; // 'abc' -> 404, no un 500 de Postgres por bigint 'NaN'
  return ordenesRepo.getOrdenById(Number(id));
}

// Mínimos que exige el wizard, ahora también en el servidor: con AUTH_ENFORCE=warn cualquiera
// puede hacer POST sin token, y sin esto una orden vacía se creaba, generaba PDF y notificaba
// al grupo de Telegram (bug real de QA). En edición no se exigen fotos/firma nuevas (pueden
// venir de la orden existente).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validarPayloadOrden(data, { edicion = false } = {}) {
  const errores = [];
  if (!String(data.clienteEmpresa || '').trim()) errores.push('cliente/empresa');
  if (!String(data.supervisor || '').trim()) errores.push('supervisor');
  if (!EMAIL_RE.test(String(data.clienteEmail || '').trim())) errores.push('email del cliente');
  if (!String(data.direccion || '').trim()) errores.push('dirección');
  let trabajos = data.trabajos;
  if (typeof trabajos === 'string') {
    try { trabajos = JSON.parse(trabajos); } catch { trabajos = []; }
  }
  if (!Array.isArray(trabajos) || trabajos.length === 0) errores.push('al menos un trabajo');
  else if (trabajos.some((t) => !String(t?.trabajo || '').trim() || !(Number(t?.cantidad) > 0))) errores.push('cantidad válida en cada trabajo');
  if (!edicion) {
    if (!Array.isArray(data.fotosAntes) || data.fotosAntes.length === 0) errores.push('al menos una foto del antes');
    if (!Array.isArray(data.fotosDespues) || data.fotosDespues.length === 0) errores.push('al menos una foto del después');
    if (!String(data.firmaBase64 || '').startsWith('data:image')) errores.push('firma');
  }
  return errores;
}

const MSG_ERROR_GENERICO = 'No se pudo guardar la orden. Intente nuevamente o contacte a la oficina.';

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
router.post('/', authMiddleware, subscriptionGate, async (req, res) => {

  try {
    const data = { ...(req.body || {}), responsableId: req.user?.recordId || null };
    const faltan = validarPayloadOrden(data);
    if (faltan.length > 0) {
      return res.status(400).json({ success: false, error: `Faltan datos obligatorios: ${faltan.join(', ')}` });
    }
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
    res.status(500).json({ success: false, error: MSG_ERROR_GENERICO });
  }
});

// PUT /api/ordenes/:id — editar y reenviar (regenera PDF + notificaciones vía ordenService)
router.put('/:id', authMiddleware, subscriptionGate, async (req, res) => {

  try {
    const { id } = req.params;
    let ordenId = Number(id);
    if (id.startsWith('rec')) {
      const existente = await ordenesRepo.getOrdenByAirtableId(id);
      if (!existente) return res.status(404).json({ success: false, error: 'Orden no encontrada' });
      ordenId = existente.id;
    } else if (!/^\d+$/.test(id)) {
      return res.status(404).json({ success: false, error: 'Orden no encontrada' });
    }

    const data = { ...(req.body || {}), responsableId: req.user?.recordId || null };
    const faltan = validarPayloadOrden(data, { edicion: true });
    if (faltan.length > 0) {
      return res.status(400).json({ success: false, error: `Faltan datos obligatorios: ${faltan.join(', ')}` });
    }
    const result = await ordenService.actualizarOrdenCompleta(ordenId, data);
    if (res.headersSent) return; // ver comentario en POST / — mismo guard obligatorio
    if (result.notFound) return res.status(404).json({ success: false, error: 'Orden no encontrada' });
    res.json(result);
  } catch (error) {
    console.error('Error actualizando orden:', error);
    if (res.headersSent) return;
    res.status(500).json({ success: false, error: MSG_ERROR_GENERICO });
  }
});

// POST /api/ordenes/:id/reenviar — regenerar PDF + reenviar notificaciones
router.post('/:id/reenviar', authMiddleware, subscriptionGate, async (req, res) => {

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
