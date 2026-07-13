// Capa mínima de Postgres para el migrador. migration/ es un paquete npm separado de
// server/ (sin acceso a server/node_modules ni a server/src/repositories/*.js — otro
// proceso npm), así que estas son las queries INSERT/UPSERT estrictamente necesarias,
// escritas con la MISMA filosofía que los repos de server/ (ON CONFLICT (airtable_record_id)
// DO UPDATE, nunca escribir columnas GENERATED) pero duplicadas acá a propósito.
import pg from 'pg';
import bcrypt from 'bcrypt';

const { Pool } = pg;

let pool;
export function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL no está definida');
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================
// servicios
// ============================================================
export async function upsertServicio({ nombre, activo, airtableRecordId }) {
  const { rows } = await getPool().query(
    `INSERT INTO servicios (nombre, activo, airtable_record_id)
     VALUES ($1,$2,$3)
     ON CONFLICT (airtable_record_id) DO UPDATE SET nombre = EXCLUDED.nombre, activo = EXCLUDED.activo
     RETURNING *`,
    [nombre, activo, airtableRecordId]
  );
  return rows[0];
}

export async function findServicioByNombre(nombre) {
  const { rows } = await getPool().query(
    'SELECT id, nombre FROM servicios WHERE lower(trim(nombre)) = lower(trim($1))',
    [nombre]
  );
  return rows[0] || null;
}

// ============================================================
// empleados
// ============================================================
export async function upsertEmpleado({ rut, nombre, activo, telefono, usuario, pin, fechaIngreso, especialidades, numeroSecuencial, airtableRecordId }) {
  const pinHash = await bcrypt.hash(String(pin || '1234'), 10);
  const { rows } = await getPool().query(
    `INSERT INTO empleados (rut, nombre, activo, telefono, usuario, pin_hash, fecha_ingreso, especialidades, numero_secuencial, airtable_record_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (airtable_record_id) DO UPDATE SET
       rut = EXCLUDED.rut, nombre = EXCLUDED.nombre, activo = EXCLUDED.activo,
       telefono = EXCLUDED.telefono, fecha_ingreso = EXCLUDED.fecha_ingreso,
       especialidades = EXCLUDED.especialidades, numero_secuencial = EXCLUDED.numero_secuencial,
       updated_at = now()
     RETURNING *`,
    [rut, nombre, activo, telefono, usuario, pinHash, fechaIngreso, especialidades, numeroSecuencial, airtableRecordId]
  );
  return rows[0];
}

export async function getEmpleadoIdByAirtableId(airtableRecordId) {
  const { rows } = await getPool().query('SELECT id FROM empleados WHERE airtable_record_id = $1', [airtableRecordId]);
  return rows[0]?.id || null;
}

// ============================================================
// clientes
// ============================================================
export async function upsertCliente({ rut, nombre, tipo, empresa, email, telefono, direccion, comuna, airtableRecordId }) {
  const { rows } = await getPool().query(
    `INSERT INTO clientes (rut, nombre, tipo, empresa, email, telefono, direccion, comuna, airtable_record_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (airtable_record_id) DO UPDATE SET
       rut = EXCLUDED.rut, nombre = EXCLUDED.nombre, tipo = EXCLUDED.tipo, empresa = EXCLUDED.empresa,
       email = EXCLUDED.email, telefono = EXCLUDED.telefono, direccion = EXCLUDED.direccion,
       comuna = EXCLUDED.comuna, updated_at = now()
     RETURNING *`,
    [rut, nombre, tipo, empresa, email, telefono, direccion, comuna, airtableRecordId]
  );
  return rows[0];
}

export async function getClienteIdByAirtableId(airtableRecordId) {
  const { rows } = await getPool().query('SELECT id FROM clientes WHERE airtable_record_id = $1', [airtableRecordId]);
  return rows[0]?.id || null;
}

export async function listClienteRutDuplicados() {
  const { rows } = await getPool().query(`
    SELECT rut_normalizado, array_agg(id) as ids, array_agg(empresa) as empresas, count(*)::int as n
    FROM clientes
    WHERE merged_into IS NULL AND rut_normalizado IS NOT NULL
    GROUP BY rut_normalizado
    HAVING count(*) > 1
  `);
  return rows;
}

// ============================================================
// ordenes (histórica — numero_orden EXPLÍCITO desde el autoNumber real de
// Airtable, nunca desde el DEFAULT nextval('ordenes_numero_seq'))
// ============================================================
export async function upsertOrdenHistorica(client, data) {
  const { rows } = await client.query(
    `INSERT INTO ordenes (
       numero_orden, fecha, estado, cliente_id, cliente_empresa, cliente_email, cliente_telefono,
       direccion, orden_compra, comuna, supervisor, hora_inicio, hora_termino,
       descripcion_trabajo, observaciones, garantia, patente_vehiculo, total,
       metodo_pago, requiere_factura, idempotency_key, responsable_orden_id, airtable_record_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     ON CONFLICT (airtable_record_id) DO UPDATE SET
       numero_orden = EXCLUDED.numero_orden, fecha = EXCLUDED.fecha, estado = EXCLUDED.estado,
       cliente_id = EXCLUDED.cliente_id, cliente_empresa = EXCLUDED.cliente_empresa,
       cliente_email = EXCLUDED.cliente_email, cliente_telefono = EXCLUDED.cliente_telefono,
       direccion = EXCLUDED.direccion, orden_compra = EXCLUDED.orden_compra, comuna = EXCLUDED.comuna,
       supervisor = EXCLUDED.supervisor, hora_inicio = EXCLUDED.hora_inicio, hora_termino = EXCLUDED.hora_termino,
       descripcion_trabajo = EXCLUDED.descripcion_trabajo, observaciones = EXCLUDED.observaciones,
       garantia = EXCLUDED.garantia, patente_vehiculo = EXCLUDED.patente_vehiculo, total = EXCLUDED.total,
       metodo_pago = EXCLUDED.metodo_pago, requiere_factura = EXCLUDED.requiere_factura,
       idempotency_key = EXCLUDED.idempotency_key, responsable_orden_id = EXCLUDED.responsable_orden_id,
       updated_at = now()
     RETURNING *`,
    [
      data.numeroOrden, data.fecha, data.estado, data.clienteId, data.clienteEmpresa, data.clienteEmail,
      data.clienteTelefono, data.direccion, data.ordenCompra, data.comuna, data.supervisor, data.horaInicio,
      data.horaTermino, data.descripcionTrabajo, data.observaciones, data.garantia, data.patenteVehiculo,
      data.total, data.metodoPago, data.requiereFactura, data.idempotencyKey, data.responsableOrdenId,
      data.airtableRecordId,
    ]
  );
  return rows[0];
}

export async function relinkOrdenEmpleados(client, ordenId, empleadoIds) {
  await client.query('DELETE FROM orden_empleados WHERE orden_id = $1', [ordenId]);
  for (const empId of empleadoIds) {
    await client.query(
      'INSERT INTO orden_empleados (orden_id, empleado_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [ordenId, empId]
    );
  }
}

export async function relinkOrdenTrabajos(client, ordenId, trabajos) {
  await client.query('DELETE FROM orden_trabajos WHERE orden_id = $1', [ordenId]);
  let idx = 0;
  for (const t of trabajos) {
    await client.query(
      `INSERT INTO orden_trabajos (orden_id, servicio_id, nombre_personalizado, cantidad, orden_index)
       VALUES ($1,$2,$3,$4,$5)`,
      [ordenId, t.servicioId || null, t.servicioId ? null : t.nombrePersonalizado, t.cantidad, idx++]
    );
  }
}

export async function relinkOrdenFotos(ordenId, fotos) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM orden_fotos WHERE orden_id = $1', [ordenId]);
    let idx = { antes: 0, despues: 0, firma: 0, pdf: 0 };
    for (const f of fotos) {
      const ordenIndex = idx[f.tipo]++;
      await client.query(
        `INSERT INTO orden_fotos (orden_id, tipo, r2_key, filename, content_type, size_bytes, orden_index)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [ordenId, f.tipo, f.r2Key, f.filename || null, f.contentType || null, f.sizeBytes || null, ordenIndex]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================
// numeración — GREATEST contra el valor actual, nunca hacia atrás.
// Solo se invoca con --finalize (F4, corrida completa). En pruebas parciales
// (esta F2d con --limit=5) NO se llama: 5 órdenes de prueba no representan el
// numero_orden máximo real y bajarían el contador si se ejecutara.
// ============================================================
export async function finalizarSecuenciaNumeroOrden() {
  const { rows } = await getPool().query(`
    SELECT setval(
      'ordenes_numero_seq',
      GREATEST(
        (SELECT last_value FROM ordenes_numero_seq),
        (SELECT COALESCE(MAX(numero_orden), 0) FROM ordenes)
      )
    ) as nuevo_valor
  `);
  return rows[0].nuevo_valor;
}

export async function closePool() {
  if (pool) await pool.end();
}
