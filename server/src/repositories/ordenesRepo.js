import { pool, withTransaction } from '../db/pool.js';

// Resuelve un ID que puede venir como bigint de Postgres O como 'rec*' de Airtable
// (órdenes encoladas offline antes del corte). No resoluble -> null, nunca lanza.
export async function resolverClienteId(client, idOrRecordId) {
  if (!idOrRecordId) return null;
  if (typeof idOrRecordId === 'string' && idOrRecordId.startsWith('rec')) {
    const { rows } = await client.query('SELECT id FROM clientes WHERE airtable_record_id = $1', [idOrRecordId]);
    return rows[0]?.id || null;
  }
  return idOrRecordId;
}

export async function resolverEmpleadoIds(client, idsOrRecordIds) {
  if (!idsOrRecordIds || idsOrRecordIds.length === 0) return [];
  const resolved = [];
  for (const idOrRecordId of idsOrRecordIds) {
    if (typeof idOrRecordId === 'string' && idOrRecordId.startsWith('rec')) {
      const { rows } = await client.query('SELECT id FROM empleados WHERE airtable_record_id = $1', [idOrRecordId]);
      if (rows[0]) resolved.push(rows[0].id);
    } else if (idOrRecordId) {
      resolved.push(idOrRecordId);
    }
  }
  return resolved;
}

export async function resolverServicioIds(client, idsOrRecordIds) {
  if (!idsOrRecordIds || idsOrRecordIds.length === 0) return [];
  const resolved = [];
  for (const idOrRecordId of idsOrRecordIds) {
    if (typeof idOrRecordId === 'string' && idOrRecordId.startsWith('rec')) {
      const { rows } = await client.query('SELECT id FROM servicios WHERE airtable_record_id = $1', [idOrRecordId]);
      if (rows[0]) resolved.push(rows[0].id);
    } else if (idOrRecordId) {
      resolved.push(idOrRecordId);
    }
  }
  return resolved;
}

export async function findByIdempotencyKey(idempotencyKey) {
  if (!idempotencyKey) return null;
  const { rows } = await pool.query('SELECT * FROM ordenes WHERE idempotency_key = $1', [idempotencyKey]);
  return rows[0] || null;
}

// URL pública de una foto/PDF a partir de su r2_key. R2_PUBLIC_URL cambia a dominio propio con 1 env var.
export function buildFotoUrl(r2Key) {
  if (!r2Key) return null;
  const base = process.env.R2_PUBLIC_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/${r2Key}`;
}

async function insertEmpleados(client, ordenId, empleadoIds) {
  for (const emp of empleadoIds || []) {
    await client.query(
      'INSERT INTO orden_empleados (orden_id, empleado_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [ordenId, emp]
    );
  }
}

// trabajos: [{ trabajo, cantidad, servicioId? }] -- servicioId opcional, si no viene se intenta matchear por nombre
async function insertTrabajos(client, ordenId, trabajos) {
  let idx = 0;
  for (const t of trabajos || []) {
    let servicioId = t.servicioId || null;
    if (!servicioId && t.trabajo) {
      const { rows } = await client.query(
        'SELECT id FROM servicios WHERE lower(trim(nombre)) = lower(trim($1))',
        [t.trabajo]
      );
      servicioId = rows[0]?.id || null;
    }
    await client.query(
      `INSERT INTO orden_trabajos (orden_id, servicio_id, nombre_personalizado, cantidad, orden_index)
       VALUES ($1,$2,$3,$4,$5)`,
      [ordenId, servicioId, servicioId ? null : (t.trabajo || 'Sin nombre'), t.cantidad || 1, idx++]
    );
  }
}

/**
 * Crea una orden completa en una sola transacción: orden + orden_trabajos + orden_empleados.
 * trabajos: [{ trabajo, cantidad, servicioId? }]  -- servicioId opcional, si no viene se intenta matchear por nombre
 */
export async function createOrdenCompleta(data) {
  return withTransaction(async (client) => {
    const clienteId = await resolverClienteId(client, data.clienteId);
    const empleadoIds = await resolverEmpleadoIds(client, data.empleadoIds || []);
    const responsableId = await resolverResponsableId(client, data.responsableId);

    const { rows: ordenRows } = await client.query(
      `INSERT INTO ordenes (
         fecha, estado, cliente_id, cliente_empresa, cliente_email, cliente_telefono,
         direccion, orden_compra, comuna, supervisor, hora_inicio, hora_termino,
         descripcion_trabajo, observaciones, garantia, patente_vehiculo, total,
         metodo_pago, requiere_factura, idempotency_key, responsable_orden_id, airtable_record_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING *`,
      [
        data.fecha || null, data.estado || 'Enviada', clienteId, data.clienteEmpresa || null,
        data.clienteEmail || null, data.clienteTelefono || null, data.direccion || null,
        data.ordenCompra || null, data.comuna || null, data.supervisor || null,
        data.horaInicio || null, data.horaTermino || null, data.descripcionTrabajo || null,
        data.observaciones || null, data.garantia || null, data.patenteVehiculo || null,
        data.total || 0, data.metodoPago || null, data.requiereFactura || false,
        data.idempotencyKey || null, responsableId, data.airtableRecordId || null,
      ]
    );
    const orden = ordenRows[0];

    await insertEmpleados(client, orden.id, empleadoIds);
    await insertTrabajos(client, orden.id, data.trabajos);

    return orden;
  });
}

/**
 * Actualiza una orden existente. Usada por:
 *  - PUT /api/ordenes/:id (técnico, "editar y reenviar" vía ordenService.actualizarOrdenCompleta,
 *    que siempre pasa estado:'Enviada')
 *  - PUT /api/admin/ordenes/:id (admin, edición completa desde la ficha — no toca estado,
 *    que se gestiona aparte vía PATCH /estado)
 * Reemplaza por completo los empleados y trabajos vinculados (delete + reinsert), igual
 * semántica que el PUT actual sobre Airtable (se sobreescribe todo lo enviado).
 *
 * `estado`/`fecha` usan COALESCE: si no vienen (caso admin), se conserva el valor actual
 * en vez de pisarlo — a diferencia del resto de los campos, que SÍ se sobreescriben
 * siempre (contrato de PUT completo: el caller reenvía el valor vigente de cada campo).
 *
 * `unlinkCliente: true` fuerza cliente_id a NULL (botón "Desenlazar" del admin) sin tocar
 * el snapshot de texto (cliente_empresa/email/telefono) — a diferencia de no pasar
 * `clienteId`, que conserva el vínculo existente vía COALESCE (comportamiento histórico,
 * usado por el técnico, que nunca desvincula).
 */
export async function actualizarOrdenCompleta(ordenId, data) {
  return withTransaction(async (client) => {
    const unlinkCliente = !!data.unlinkCliente;
    const clienteId = unlinkCliente ? null : await resolverClienteId(client, data.clienteId);
    const empleadoIds = await resolverEmpleadoIds(client, data.empleadoIds || []);
    const responsableId = await resolverResponsableId(client, data.responsableId);

    const { rows } = await client.query(
      `UPDATE ordenes SET
         fecha = COALESCE($2, fecha),
         estado = COALESCE($3, estado),
         cliente_id = CASE WHEN $4::boolean THEN NULL ELSE COALESCE($5, cliente_id) END,
         cliente_empresa = $6, cliente_email = $7, cliente_telefono = $8,
         direccion = $9, orden_compra = $10, comuna = $11, supervisor = $12,
         hora_inicio = $13, hora_termino = $14, descripcion_trabajo = $15, observaciones = $16,
         garantia = $17, patente_vehiculo = $18, total = $19, metodo_pago = $20, requiere_factura = $21,
         responsable_orden_id = COALESCE($22, responsable_orden_id), updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        ordenId, data.fecha || null, data.estado || null, unlinkCliente, clienteId,
        data.clienteEmpresa || null, data.clienteEmail || null, data.clienteTelefono || null,
        data.direccion || null, data.ordenCompra || null, data.comuna || null, data.supervisor || null,
        data.horaInicio || null, data.horaTermino || null, data.descripcionTrabajo || null,
        data.observaciones || null, data.garantia || null, data.patenteVehiculo || null,
        data.total || 0, data.metodoPago || null, data.requiereFactura || false, responsableId,
      ]
    );
    const orden = rows[0];
    if (!orden) return null;

    await client.query('DELETE FROM orden_empleados WHERE orden_id = $1', [orden.id]);
    await insertEmpleados(client, orden.id, empleadoIds);

    if (data.trabajos) {
      await client.query('DELETE FROM orden_trabajos WHERE orden_id = $1', [orden.id]);
      await insertTrabajos(client, orden.id, data.trabajos);
    }

    return orden;
  });
}

async function resolverResponsableId(client, idOrRecordId) {
  if (!idOrRecordId) return null;
  if (typeof idOrRecordId === 'string' && idOrRecordId.startsWith('rec')) {
    const { rows } = await client.query('SELECT id FROM empleados WHERE airtable_record_id = $1', [idOrRecordId]);
    return rows[0]?.id || null;
  }
  return idOrRecordId;
}

export async function agregarFoto(ordenId, { tipo, r2Key, filename, contentType, sizeBytes, ordenIndex }) {
  const { rows } = await pool.query(
    `INSERT INTO orden_fotos (orden_id, tipo, r2_key, filename, content_type, size_bytes, orden_index)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [ordenId, tipo, r2Key, filename || null, contentType || null, sizeBytes || null, ordenIndex ?? null]
  );
  return rows[0];
}

// Borra las fotos de un tipo antes de re-subir (usado para 'pdf' y 'firma', que son
// 1:1 por orden — reenviar/editar puede correr N veces y no deben acumularse filas
// ambiguas en orden_fotos, ver ordenService.js). 'antes'/'despues' nunca se llama con esto,
// son evidencia acumulativa por diseño.
export async function eliminarFotosPorTipo(ordenId, tipo) {
  await pool.query('DELETE FROM orden_fotos WHERE orden_id = $1 AND tipo = $2', [ordenId, tipo]);
}

// Borra una foto puntual (usado por DELETE /api/admin/ordenes/:id/fotos/:fotoId). Alcance
// por orden_id además del id de la foto — evita que alguien borre una fila de otra orden
// adivinando el id. Devuelve la fila borrada (con r2_key) para poder limpiar R2 aparte.
export async function eliminarFoto(fotoId, ordenId) {
  const { rows } = await pool.query(
    'DELETE FROM orden_fotos WHERE id = $1 AND orden_id = $2 RETURNING *',
    [fotoId, ordenId]
  );
  return rows[0] || null;
}

// Próximo orden_index libre para un tipo de foto de una orden — usado al agregar fotos
// nuevas a una orden YA EXISTENTE (admin) para no pisar la r2_key de una foto ya subida
// (las keys son ordenes/{numero}/{tipo}/{index}-foto.ext, determinísticas por índice).
export async function siguienteIndiceFoto(ordenId, tipo) {
  const { rows } = await pool.query(
    `SELECT COALESCE(MAX(orden_index), -1) + 1 as siguiente FROM orden_fotos WHERE orden_id = $1 AND tipo = $2`,
    [ordenId, tipo]
  );
  return rows[0].siguiente;
}

export async function setEstado(ordenId, estado) {
  const { rows } = await pool.query(
    'UPDATE ordenes SET estado = $2, updated_at = now() WHERE id = $1 RETURNING *',
    [ordenId, estado]
  );
  return rows[0] || null;
}

export async function getOrdenById(id) {
  const { rows } = await pool.query('SELECT * FROM ordenes WHERE id = $1', [id]);
  if (!rows[0]) return null;
  return hydrateOrden(rows[0]);
}

export async function getOrdenByAirtableId(airtableRecordId) {
  const { rows } = await pool.query('SELECT * FROM ordenes WHERE airtable_record_id = $1', [airtableRecordId]);
  if (!rows[0]) return null;
  return hydrateOrden(rows[0]);
}

async function hydrateOrden(orden) {
  const [trabajos, empleados, fotos, clienteRows] = await Promise.all([
    pool.query(
      `SELECT ot.*, s.nombre as servicio_nombre FROM orden_trabajos ot
       LEFT JOIN servicios s ON s.id = ot.servicio_id
       WHERE ot.orden_id = $1 ORDER BY ot.orden_index`,
      [orden.id]
    ),
    pool.query(
      `SELECT e.id, e.nombre FROM orden_empleados oe JOIN empleados e ON e.id = oe.empleado_id WHERE oe.orden_id = $1`,
      [orden.id]
    ),
    pool.query('SELECT * FROM orden_fotos WHERE orden_id = $1 ORDER BY tipo, orden_index', [orden.id]),
    orden.cliente_id
      ? pool.query('SELECT id, rut, nombre, empresa FROM clientes WHERE id = $1', [orden.cliente_id])
      : Promise.resolve({ rows: [] }),
  ]);
  return {
    ...orden,
    trabajos: trabajos.rows,
    empleados: empleados.rows,
    fotos: fotos.rows,
    // snapshot vivo del cliente linkeado (RUT no vive en ordenes — solo en clientes).
    // No confundir con cliente_empresa/email/telefono, que SÍ son snapshot en ordenes.
    cliente: clienteRows.rows[0] || null,
  };
}

export async function listOrdenesRecientes(limit = 50) {
  const { rows } = await pool.query('SELECT * FROM ordenes ORDER BY created_at DESC LIMIT $1', [limit]);
  return rows;
}

// Igual que listOrdenesRecientes pero hidratada (trabajos/empleados/fotos/cliente) —
// usada por GET /api/ordenes del técnico, que necesita el mismo shape que el detalle.
export async function listOrdenesRecientesCompletas(limit = 50) {
  const recientes = await listOrdenesRecientes(limit);
  return Promise.all(recientes.map((o) => hydrateOrden(o)));
}

export async function listOrdenesAdmin({ page = 1, limit = 50, estado, q, tecnicoId, fechaDesde, fechaHasta }) {
  const conditions = [];
  const params = [];
  let i = 1;

  if (estado) {
    conditions.push(`o.estado = ANY($${i++})`);
    params.push(Array.isArray(estado) ? estado : [estado]);
  }
  if (q) {
    conditions.push(`(o.numero_orden_display ILIKE $${i} OR o.cliente_empresa ILIKE $${i} OR o.supervisor ILIKE $${i} OR o.direccion ILIKE $${i} OR o.comuna ILIKE $${i} OR o.descripcion_trabajo ILIKE $${i})`);
    params.push(`%${q}%`);
    i++;
  }
  if (tecnicoId) {
    conditions.push(`EXISTS (SELECT 1 FROM orden_empleados oe WHERE oe.orden_id = o.id AND oe.empleado_id = $${i++})`);
    params.push(tecnicoId);
  }
  if (fechaDesde) {
    conditions.push(`o.fecha >= $${i++}`);
    params.push(fechaDesde);
  }
  if (fechaHasta) {
    conditions.push(`o.fecha <= $${i++}`);
    params.push(fechaHasta);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const { rows } = await pool.query(
    `SELECT o.* FROM ordenes o ${where} ORDER BY o.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
    [...params, limit, offset]
  );
  const { rows: countRows } = await pool.query(`SELECT count(*)::int as total FROM ordenes o ${where}`, params);

  return { ordenes: rows, total: countRows[0].total, page, limit };
}

// Elimina la orden y todo lo relacionado (orden_trabajos/orden_empleados/orden_fotos
// vía ON DELETE CASCADE, ver 001_init.sql). Los objetos en R2 quedan huérfanos
// deliberadamente (limpieza de storage no es crítica, no vale la latencia/complejidad
// de borrarlos en el mismo request de una acción admin poco frecuente).
export async function eliminarOrden(id) {
  const { rows } = await pool.query('DELETE FROM ordenes WHERE id = $1 RETURNING id, numero_orden_display', [id]);
  return rows[0] || null;
}
