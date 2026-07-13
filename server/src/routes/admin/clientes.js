import { Router } from 'express';
import * as clientesRepo from '../../repositories/clientesRepo.js';
import * as auditRepo from '../../repositories/auditRepo.js';
import { pool, withTransaction } from '../../db/pool.js';
import { adminAuthMiddleware } from '../../middleware/adminAuth.js';

const router = Router();

router.use(adminAuthMiddleware);

// GET /api/admin/clientes — lista completa con total histórico CLP (agregado en Postgres)
router.get('/', async (_req, res, next) => {
  try {
    const clientes = await clientesRepo.listTodosConTotales();
    res.json({ success: true, data: clientes });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/clientes/buscar?q= — buscador usado para reasignar el cliente de una
// orden desde su ficha (mismo mecanismo de búsqueda que /api/clientes/buscar del técnico,
// clientesRepo.buscarClientes, expuesto acá detrás de adminAuthMiddleware).
router.get('/buscar', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ success: true, data: [] });
    const clientes = await clientesRepo.buscarClientes(q);
    res.json({ success: true, data: clientes });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/clientes/duplicados — grupos con rut_normalizado repetido (detección
// server-side, ver plan: 7 grupos reales detectados en la auditoría de Airtable)
router.get('/duplicados', async (_req, res, next) => {
  try {
    const duplicados = await clientesRepo.listarDuplicados();
    res.json({ success: true, data: duplicados });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/clientes/duplicados/:rutNormalizado/descartar — marca el grupo
// como "revisado, no son duplicados" (ej. empresa con múltiples locales legítimos).
// No requiere rol admin: es una acción sobre datos, no de configuración sensible.
router.post('/duplicados/:rutNormalizado/descartar', async (req, res, next) => {
  try {
    const rutNormalizado = req.params.rutNormalizado;
    const revisado = await clientesRepo.marcarGrupoRevisado(rutNormalizado, req.admin?.id);

    await auditRepo.registrar({
      adminUserId: req.admin?.id,
      accion: 'descartar_duplicado_cliente',
      entidad: 'clientes',
      entidadId: rutNormalizado,
      detalle: { rutNormalizado },
    }).catch((err) => console.error('[admin/clientes] no se pudo registrar auditoría de descarte:', err.message));

    res.json({ success: true, data: revisado });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/clientes/fusionar — soft merge (merged_into) dentro de una
// transacción: revincula las órdenes del perdedor al ganador y lo marca fusionado.
router.post('/fusionar', async (req, res, next) => {
  try {
    const { ganadorId, perdedorId, camposResultado } = req.body || {};
    if (!ganadorId || !perdedorId) {
      return res.status(400).json({ success: false, error: 'ganadorId y perdedorId son requeridos' });
    }
    if (String(ganadorId) === String(perdedorId)) {
      return res.status(400).json({ success: false, error: 'ganadorId y perdedorId no pueden ser el mismo cliente' });
    }

    const resultado = await withTransaction((client) =>
      clientesRepo.fusionarClientes(client, { ganadorId, perdedorId, camposResultado })
    );

    await auditRepo.registrar({
      adminUserId: req.admin?.id,
      accion: 'fusionar_clientes',
      entidad: 'clientes',
      entidadId: ganadorId,
      detalle: { ganadorId, perdedorId, ordenesRevinculadas: resultado.ordenesRevinculadas, camposResultado },
    }).catch((err) => console.error('[admin/clientes] no se pudo registrar auditoría de fusión:', err.message));

    res.json({ success: true, data: resultado });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/clientes/:id — ficha 360 (stats + últimas órdenes)
router.get('/:id', async (req, res, next) => {
  try {
    const cliente = await clientesRepo.getClienteConStats(Number(req.params.id));
    if (!cliente) return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    res.json({ success: true, data: cliente });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/clientes/:id/ordenes — historial completo de órdenes del cliente
router.get('/:id/ordenes', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, numero_orden_display, fecha, estado, total FROM ordenes
       WHERE cliente_id = $1 ORDER BY created_at DESC`,
      [Number(req.params.id)]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/clientes/:id/mismo-rut — otros locales/contactos con el mismo RUT
// (consulta directa por rut_normalizado, sin tabla nueva — ver plan de RUT compartido)
router.get('/:id/mismo-rut', async (req, res, next) => {
  try {
    const otros = await clientesRepo.getOtrosClientesMismoRut(Number(req.params.id));
    res.json({ success: true, data: otros });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/clientes/:id/stats — solo el bloque de stats (usado por widgets sueltos)
router.get('/:id/stats', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int as total_ordenes, COALESCE(SUM(total),0) as total_historico
       FROM ordenes WHERE cliente_id = $1`,
      [Number(req.params.id)]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/clientes — alta manual desde el admin (misma capacidad de
// CRUD completo que ya tiene Personal/Servicios: la oficina puede crear/editar
// clientes igual que un técnico los crea implícitamente al enviar una orden nueva).
router.post('/', async (req, res, next) => {
  try {
    const { rut, nombre, tipo, empresa, email, telefono, direccion, comuna } = req.body || {};
    if (!nombre) return res.status(400).json({ success: false, error: 'nombre es requerido' });
    const cliente = await clientesRepo.crearCliente({ rut, nombre, tipo, empresa, email, telefono, direccion, comuna });

    auditRepo.registrar({
      adminUserId: req.admin?.id,
      accion: 'crear_cliente',
      entidad: 'clientes',
      entidadId: String(cliente.id),
      detalle: { nombre, empresa },
    }).catch((err) => console.error('[admin/clientes] no se pudo registrar auditoría de creación:', err.message));

    res.status(201).json({ success: true, data: cliente });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/clientes/:id — edición inline por campo desde la ficha 360
router.put('/:id', async (req, res, next) => {
  try {
    const { rut, nombre, tipo, empresa, email, telefono, direccion, comuna } = req.body || {};
    const cliente = await clientesRepo.actualizarCliente(Number(req.params.id), {
      rut, nombre, tipo, empresa, email, telefono, direccion, comuna,
    });
    if (!cliente) return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    res.json({ success: true, data: cliente });
  } catch (err) {
    next(err);
  }
});

export default router;
