import bcrypt from 'bcrypt';
import { pool } from '../db/pool.js';

function normalizarRut(rut) {
  if (!rut) return null;
  return rut.replace(/[.\-\s]/g, '').toLowerCase();
}

export async function findByCredencial(input) {
  const norm = normalizarRut(input);
  const { rows } = await pool.query(
    `SELECT * FROM empleados WHERE lower(usuario) = lower($1) OR (rut IS NOT NULL AND lower(replace(replace(rut,'.',''),'-','')) = $2)`,
    [input, norm]
  );
  return rows[0] || null;
}

export async function verificarPin(empleado, pin) {
  return bcrypt.compare(String(pin), empleado.pin_hash);
}

export async function getEmpleadoById(id) {
  const { rows } = await pool.query('SELECT * FROM empleados WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function isEmpleadoActivo(id) {
  const { rows } = await pool.query('SELECT activo FROM empleados WHERE id = $1', [id]);
  return rows[0]?.activo === true;
}

export async function listActivos() {
  const { rows } = await pool.query(
    `SELECT id, nombre, usuario, telefono, codigo FROM empleados WHERE activo = true ORDER BY nombre`
  );
  return rows;
}

export async function listTodos() {
  const { rows } = await pool.query(`
    SELECT e.*,
      (SELECT count(*) FROM orden_empleados oe WHERE oe.empleado_id = e.id) as total_ordenes,
      (SELECT COALESCE(sum(o.total),0) FROM orden_empleados oe JOIN ordenes o ON o.id = oe.orden_id WHERE oe.empleado_id = e.id) as monto_generado,
      (SELECT max(o.created_at) FROM orden_empleados oe JOIN ordenes o ON o.id = oe.orden_id WHERE oe.empleado_id = e.id) as ultima_orden
    FROM empleados e ORDER BY e.nombre
  `);
  return rows;
}

function generarPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function crearEmpleado(data) {
  const pin = data.pin || generarPin();
  const pinHash = await bcrypt.hash(pin, 10);
  const { rows: seqRows } = await pool.query(
    `SELECT COALESCE(MAX(numero_secuencial), 0) + 1 as next FROM empleados`
  );
  const numeroSecuencial = seqRows[0].next;
  const { rows } = await pool.query(
    `INSERT INTO empleados (rut, nombre, activo, telefono, usuario, pin_hash, fecha_ingreso, especialidades, numero_secuencial, airtable_record_id)
     VALUES ($1,$2,COALESCE($3,true),$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [data.rut || null, data.nombre, data.activo, data.telefono || null, data.usuario,
     pinHash, data.fechaIngreso || null, data.especialidades || null, numeroSecuencial,
     data.airtableRecordId || null]
  );
  return { empleado: rows[0], pin };
}

export async function upsertEmpleadoByAirtableId(data) {
  const pinHash = await bcrypt.hash(String(data.pin || '1234'), 10);
  const { rows: seqRows } = await pool.query(
    `SELECT COALESCE(MAX(numero_secuencial), 0) + 1 as next FROM empleados WHERE airtable_record_id IS DISTINCT FROM $1`,
    [data.airtableRecordId]
  );
  const { rows } = await pool.query(
    `INSERT INTO empleados (rut, nombre, activo, telefono, usuario, pin_hash, fecha_ingreso, especialidades, numero_secuencial, airtable_record_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (airtable_record_id) DO UPDATE SET
       rut=EXCLUDED.rut, nombre=EXCLUDED.nombre, activo=EXCLUDED.activo, telefono=EXCLUDED.telefono,
       fecha_ingreso=EXCLUDED.fecha_ingreso, especialidades=EXCLUDED.especialidades, updated_at=now()
     RETURNING *`,
    [data.rut || null, data.nombre, data.activo, data.telefono || null, data.usuario,
     pinHash, data.fechaIngreso || null, data.especialidades || null, seqRows[0].next,
     data.airtableRecordId]
  );
  return rows[0];
}

export async function resetearPin(empleadoId) {
  const pin = generarPin();
  const pinHash = await bcrypt.hash(pin, 10);
  await pool.query('UPDATE empleados SET pin_hash = $1, updated_at = now() WHERE id = $2', [pinHash, empleadoId]);
  return pin;
}

export async function actualizarEmpleado(id, data) {
  const { rows } = await pool.query(
    `UPDATE empleados SET
       rut = COALESCE($2, rut), nombre = COALESCE($3, nombre), activo = COALESCE($4, activo),
       telefono = COALESCE($5, telefono), usuario = COALESCE($6, usuario),
       fecha_ingreso = COALESCE($7, fecha_ingreso), especialidades = COALESCE($8, especialidades),
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, data.rut, data.nombre, data.activo, data.telefono, data.usuario, data.fechaIngreso, data.especialidades]
  );
  return rows[0] || null;
}

// Stats + últimas órdenes para la ficha del técnico en el admin.
export async function getEmpleadoConStats(id) {
  const { rows } = await pool.query(
    `SELECT e.*,
       (SELECT count(*) FROM orden_empleados oe WHERE oe.empleado_id = e.id) as total_ordenes,
       (SELECT COALESCE(sum(o.total),0) FROM orden_empleados oe JOIN ordenes o ON o.id = oe.orden_id WHERE oe.empleado_id = e.id) as monto_generado,
       (SELECT max(o.created_at) FROM orden_empleados oe JOIN ordenes o ON o.id = oe.orden_id WHERE oe.empleado_id = e.id) as ultima_orden
     FROM empleados e WHERE e.id = $1`,
    [id]
  );
  if (!rows[0]) return null;
  const { rows: ultimasOrdenes } = await pool.query(
    `SELECT o.id, o.numero_orden_display, o.fecha, o.estado, o.cliente_empresa, o.supervisor, o.total
     FROM orden_empleados oe JOIN ordenes o ON o.id = oe.orden_id
     WHERE oe.empleado_id = $1 ORDER BY o.created_at DESC LIMIT 10`,
    [id]
  );
  return { ...rows[0], ultimasOrdenes };
}
