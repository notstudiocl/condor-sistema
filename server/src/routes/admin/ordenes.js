import { Router } from 'express';
import * as ordenesRepo from '../../repositories/ordenesRepo.js';
import * as notificacionesRepo from '../../repositories/notificacionesRepo.js';
import * as ordenService from '../../services/ordenService.js';
import * as auditRepo from '../../repositories/auditRepo.js';
import { uploadBuffer, deleteObject } from '../../services/storage/r2.js';
import { adminAuthMiddleware } from '../../middleware/adminAuth.js';
import { requireRole } from '../../middleware/requireRole.js';

const router = Router();

router.use(adminAuthMiddleware);

// Campos escalares comparados para armar el diff de auditoría de 'editar_orden' — no
// pretende ser exhaustivo (trabajos/empleados/fotos se auditan aparte por su propia
// naturaleza de lista), solo dar un resumen legible de qué cambió campo a campo.
const CAMPOS_DIFF_ORDEN = [
  ['fecha', 'fecha'],
  ['direccion', 'direccion'],
  ['comuna', 'comuna'],
  ['supervisor', 'supervisor'],
  ['cliente_empresa', 'clienteEmpresa'],
  ['cliente_email', 'clienteEmail'],
  ['cliente_telefono', 'clienteTelefono'],
  ['cliente_id', 'clienteId'],
  ['orden_compra', 'ordenCompra'],
  ['hora_inicio', 'horaInicio'],
  ['hora_termino', 'horaTermino'],
  ['descripcion_trabajo', 'descripcionTrabajo'],
  ['observaciones', 'observaciones'],
  ['garantia', 'garantia'],
  ['patente_vehiculo', 'patenteVehiculo'],
  ['total', 'total'],
  ['metodo_pago', 'metodoPago'],
  ['requiere_factura', 'requiereFactura'],
];

function construirDiffOrden(antes, despues) {
  const diff = {};
  for (const [col, label] of CAMPOS_DIFF_ORDEN) {
    const a = antes[col];
    const b = despues[col];
    // Comparación laxa vía String(): los tipos que vuelven de dos SELECT/UPDATE de
    // Postgres (numeric, timestamptz) no siempre calzan 1:1 en JS y no vale la pena
    // un diff tipado para un log pensado para que lo lea una persona.
    if (String(a ?? '') !== String(b ?? '')) {
      diff[label] = { de: a ?? null, a: b ?? null };
    }
  }
  return diff;
}

// GET /api/admin/ordenes — paginación real (el admin necesita las 410+, a diferencia
// del técnico que solo ve las últimas 50 en GET /api/ordenes).
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, estado, q, tecnicoId, fechaDesde, fechaHasta } = req.query;
    const estadoFilter = estado ? String(estado).split(',').filter(Boolean) : undefined;

    const result = await ordenesRepo.listOrdenesAdmin({
      page: Math.max(1, Number(page) || 1),
      limit: Math.min(200, Math.max(1, Number(limit) || 50)),
      estado: estadoFilter,
      q: q ? String(q) : undefined,
      tecnicoId: tecnicoId ? Number(tecnicoId) : undefined,
      fechaDesde: fechaDesde ? String(fechaDesde) : undefined,
      fechaHasta: fechaHasta ? String(fechaHasta) : undefined,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const orden = await ordenesRepo.getOrdenById(Number(req.params.id));
    if (!orden) return res.status(404).json({ success: false, error: 'Orden no encontrada' });
    // Enriquecer cada foto con su URL pública (r2_key es solo la key en DB — la URL
    // se arma en runtime, así puede cambiar de dominio sin re-subir nada, ver ordenesRepo).
    const fotos = (orden.fotos || []).map((f) => ({ ...f, url: ordenesRepo.buildFotoUrl(f.r2_key) }));
    res.json({ success: true, data: { ...orden, fotos } });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/ordenes — creación MANUAL desde la oficina (corrección, carga
// retroactiva, pedido telefónico). A diferencia de POST /api/ordenes (el técnico en
// terreno, que pasa por ordenService.createOrdenCompleta: genera PDF con Gotenberg,
// sube fotos a R2 y dispara notificaciones Resend/Telegram porque asume que el trabajo
// YA se hizo), esta ruta llama directo a ordenesRepo.createOrdenCompleta: crea la orden
// en estado 'Enviada' sin fotos/PDF/notificaciones — la oficina recién está tipeando
// los datos. Después, desde la ficha, la oficina puede usar "Regenerar PDF"
// (POST /:id/regenerar-pdf) y "Agregar foto" (POST /:id/fotos), ambos ya existentes.
router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const creada = await ordenesRepo.createOrdenCompleta({
      fecha: body.fecha || null,
      clienteId: body.clienteId ?? null,
      clienteEmpresa: body.clienteEmpresa,
      clienteEmail: body.clienteEmail,
      clienteTelefono: body.clienteTelefono,
      direccion: body.direccion,
      ordenCompra: body.ordenCompra,
      comuna: body.comuna,
      supervisor: body.supervisor,
      horaInicio: body.horaInicio || null,
      horaTermino: body.horaTermino || null,
      descripcionTrabajo: body.descripcionTrabajo,
      observaciones: body.observaciones,
      garantia: body.garantia,
      patenteVehiculo: body.patenteVehiculo,
      total: body.total,
      metodoPago: body.metodoPago,
      requiereFactura: body.requiereFactura,
      empleadoIds: body.empleadoIds || [],
      trabajos: body.trabajos,
    });

    auditRepo.registrar({
      adminUserId: req.admin?.id,
      accion: 'crear_orden',
      entidad: 'ordenes',
      entidadId: String(creada.id),
      detalle: {
        clienteEmpresa: body.clienteEmpresa || null,
        supervisor: body.supervisor || null,
        direccion: body.direccion || null,
        comuna: body.comuna || null,
        descripcionTrabajo: body.descripcionTrabajo || null,
      },
    }).catch((err) => console.error('[admin/ordenes] no se pudo registrar auditoría de creación:', err.message));

    const hidratada = await ordenesRepo.getOrdenById(creada.id);
    const fotos = (hidratada.fotos || []).map((f) => ({ ...f, url: ordenesRepo.buildFotoUrl(f.r2_key) }));
    res.status(201).json({ success: true, data: { ...hidratada, fotos } });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/ordenes/:id/notificaciones — log de envíos de esta orden (email/telegram)
router.get('/:id/notificaciones', async (req, res, next) => {
  try {
    const { rows } = await notificacionesRepo.listLog({ ordenId: Number(req.params.id), limit: 50 });
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/ordenes/:id/auditoria — historial de cambios de esta orden puntual
// (quién, qué acción, cuándo, detalle) — accesible a ambos roles, a diferencia de la
// vista global GET /api/admin/auditoria que es solo 'admin'.
router.get('/:id/auditoria', async (req, res, next) => {
  try {
    const result = await auditRepo.listar({ entidad: 'ordenes', entidadId: req.params.id, limit: 100 });
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/ordenes/:id — edición completa desde la ficha del admin. A diferencia
// del PUT /api/ordenes/:id del técnico (que pasa por ordenService y regenera PDF +
// notificaciones en el mismo request), este es una actualización de datos pura: el
// frontend dispara la regeneración de PDF aparte (POST /:id/regenerar-pdf) tras guardar,
// y las fotos se gestionan con sus propios endpoints (POST/DELETE /:id/fotos).
router.put('/:id', async (req, res, next) => {
  try {
    const ordenId = Number(req.params.id);
    const antes = await ordenesRepo.getOrdenById(ordenId);
    if (!antes) return res.status(404).json({ success: false, error: 'Orden no encontrada' });

    const body = req.body || {};
    const actualizada = await ordenesRepo.actualizarOrdenCompleta(ordenId, {
      fecha: body.fecha || null,
      clienteId: body.clienteId ?? null,
      unlinkCliente: !!body.unlinkCliente,
      clienteEmpresa: body.clienteEmpresa,
      clienteEmail: body.clienteEmail,
      clienteTelefono: body.clienteTelefono,
      direccion: body.direccion,
      ordenCompra: body.ordenCompra,
      comuna: body.comuna,
      supervisor: body.supervisor,
      horaInicio: body.horaInicio || null,
      horaTermino: body.horaTermino || null,
      descripcionTrabajo: body.descripcionTrabajo,
      observaciones: body.observaciones,
      garantia: body.garantia,
      patenteVehiculo: body.patenteVehiculo,
      total: body.total,
      metodoPago: body.metodoPago,
      requiereFactura: body.requiereFactura,
      empleadoIds: body.empleadoIds || [],
      trabajos: body.trabajos,
    });

    if (!actualizada) return res.status(404).json({ success: false, error: 'Orden no encontrada' });

    const diff = construirDiffOrden(antes, actualizada);
    auditRepo.registrar({
      adminUserId: req.admin?.id,
      accion: 'editar_orden',
      entidad: 'ordenes',
      entidadId: String(ordenId),
      detalle: diff,
    }).catch((err) => console.error('[admin/ordenes] no se pudo registrar auditoría de edición:', err.message));

    const hidratada = await ordenesRepo.getOrdenById(ordenId);
    const fotos = (hidratada.fotos || []).map((f) => ({ ...f, url: ordenesRepo.buildFotoUrl(f.r2_key) }));
    res.json({ success: true, data: { ...hidratada, fotos } });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/ordenes/:id/fotos — agrega 1+ fotos nuevas (base64, mismo formato que
// usa el técnico al crear una orden) de tipo 'antes'/'despues' a una orden existente.
// El índice sigue desde el máximo actual de ese tipo (no pisa r2_key de fotos ya subidas).
router.post('/:id/fotos', async (req, res, next) => {
  try {
    const ordenId = Number(req.params.id);
    const { tipo, fotos } = req.body || {};
    if (tipo !== 'antes' && tipo !== 'despues') {
      return res.status(400).json({ success: false, error: "tipo debe ser 'antes' o 'despues'" });
    }
    if (!Array.isArray(fotos) || fotos.length === 0) {
      return res.status(400).json({ success: false, error: 'fotos (array de imágenes en base64) es requerido' });
    }

    const orden = await ordenesRepo.getOrdenById(ordenId);
    if (!orden) return res.status(404).json({ success: false, error: 'Orden no encontrada' });

    let siguienteIndex = await ordenesRepo.siguienteIndiceFoto(ordenId, tipo);
    const subidas = [];
    for (const base64 of fotos) {
      const parsed = ordenService.parseBase64Image(base64);
      if (!parsed) continue; // formato inválido — se omite en vez de abortar el resto del lote
      const key = `ordenes/${orden.numero_orden_display}/${tipo}/${siguienteIndex}-foto.${parsed.ext}`;
      await uploadBuffer(key, parsed.buffer, parsed.contentType);
      const fila = await ordenesRepo.agregarFoto(ordenId, {
        tipo, r2Key: key, contentType: parsed.contentType, sizeBytes: parsed.buffer.length, ordenIndex: siguienteIndex,
      });
      subidas.push({ ...fila, url: ordenesRepo.buildFotoUrl(fila.r2_key) });
      siguienteIndex++;
    }

    if (subidas.length === 0) {
      return res.status(400).json({ success: false, error: 'Ninguna de las fotos pudo procesarse (formato inválido)' });
    }

    auditRepo.registrar({
      adminUserId: req.admin?.id,
      accion: 'agregar_foto',
      entidad: 'ordenes',
      entidadId: String(ordenId),
      detalle: { tipo, cantidad: subidas.length },
    }).catch((err) => console.error('[admin/ordenes] no se pudo registrar auditoría de foto agregada:', err.message));

    res.status(201).json({ success: true, data: subidas });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/ordenes/:id/fotos/:fotoId — elimina una foto puntual. El objeto en
// R2 se borra best-effort (no bloquea ni falla la respuesta si R2 no responde — la fila
// en Postgres, ya borrada, es la fuente de verdad).
router.delete('/:id/fotos/:fotoId', async (req, res, next) => {
  try {
    const ordenId = Number(req.params.id);
    const fotoId = Number(req.params.fotoId);
    const eliminada = await ordenesRepo.eliminarFoto(fotoId, ordenId);
    if (!eliminada) return res.status(404).json({ success: false, error: 'Foto no encontrada' });

    deleteObject(eliminada.r2_key).catch((err) =>
      console.error('[admin/ordenes] no se pudo borrar el objeto de R2:', err.message)
    );

    auditRepo.registrar({
      adminUserId: req.admin?.id,
      accion: 'eliminar_foto',
      entidad: 'ordenes',
      entidadId: String(ordenId),
      detalle: { fotoId, tipo: eliminada.tipo },
    }).catch((err) => console.error('[admin/ordenes] no se pudo registrar auditoría de foto eliminada:', err.message));

    res.json({ success: true, data: eliminada });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/ordenes/:id/regenerar-pdf — regenera SOLO el PDF con los datos actuales
// de la orden (tras una edición). No reenvía notificaciones (a diferencia de /reenviar).
router.post('/:id/regenerar-pdf', async (req, res, next) => {
  try {
    const ordenId = Number(req.params.id);
    const resultado = await ordenService.regenerarPdf(ordenId);
    if (resultado.notFound) return res.status(404).json(resultado);

    auditRepo.registrar({
      adminUserId: req.admin?.id,
      accion: 'regenerar_pdf',
      entidad: 'ordenes',
      entidadId: String(ordenId),
      detalle: { ok: resultado.success, pdfUrl: resultado.data?.pdfUrl, error: resultado.error || null },
    }).catch((err) => console.error('[admin/ordenes] no se pudo registrar auditoría de regeneración de PDF:', err.message));

    // 200 aunque el PDF haya fallado en generarse (degradación ámbar, mismo criterio que
    // el resto del pipeline): el frontend lee resultado.success para decidir el mensaje.
    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/ordenes/:id/reenviar — regenera el PDF y reenvía las notificaciones
// (misma lógica que el reenvío del técnico, reutilizada desde ordenService).
router.post('/:id/reenviar', async (req, res, next) => {
  try {
    const resultado = await ordenService.reenviarOrden(Number(req.params.id));
    if (resultado.data?.webhookError === 'Orden no encontrada') {
      return res.status(404).json(resultado);
    }
    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/ordenes/:id/estado — cambio de estado individual (usado por el
// estado clickeable inline de la tabla de órdenes, con Deshacer en el frontend)
router.patch('/:id/estado', async (req, res, next) => {
  try {
    const { estado } = req.body || {};
    if (!estado) return res.status(400).json({ success: false, error: 'estado es requerido' });

    const orden = await ordenesRepo.setEstado(Number(req.params.id), estado);
    if (!orden) return res.status(404).json({ success: false, error: 'Orden no encontrada' });
    res.json({ success: true, data: orden });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/ordenes/estado-masivo — cambio de estado en lote (selección múltiple +
// "Marcar como Facturada", el momento wow de cuadrar contra la factura del contador)
router.patch('/estado-masivo', async (req, res, next) => {
  try {
    const { ids, estado } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0 || !estado) {
      return res.status(400).json({ success: false, error: 'ids (array) y estado son requeridos' });
    }

    const resultados = await Promise.all(ids.map((id) => ordenesRepo.setEstado(Number(id), estado)));
    const actualizadas = resultados.filter(Boolean).length;

    auditRepo.registrar({
      adminUserId: req.admin?.id,
      accion: 'cambio_estado_masivo',
      entidad: 'ordenes',
      entidadId: null,
      detalle: { ids, estado, actualizadas },
    }).catch((err) => console.error('[admin/ordenes] no se pudo registrar auditoría de cambio masivo:', err.message));

    res.json({ success: true, data: { actualizadas, total: ids.length } });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/ordenes/:id — solo rol admin (matriz de permisos del plan:
// "oficina" gestiona órdenes pero no las elimina). Borrado real, cascada en DB.
router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const eliminada = await ordenesRepo.eliminarOrden(Number(req.params.id));
    if (!eliminada) return res.status(404).json({ success: false, error: 'Orden no encontrada' });

    auditRepo.registrar({
      adminUserId: req.admin?.id,
      accion: 'eliminar_orden',
      entidad: 'ordenes',
      entidadId: String(eliminada.id),
      detalle: { numeroOrden: eliminada.numero_orden_display },
    }).catch((err) => console.error('[admin/ordenes] no se pudo registrar auditoría de eliminación:', err.message));

    res.json({ success: true, data: eliminada });
  } catch (err) {
    next(err);
  }
});

export default router;
