import bcrypt from 'bcrypt';

// Lecturas de personas (login terreno, listas del wizard, stats del admin) + upsert de la
// migración histórica. Las ESCRITURAS de gestión viven en personasRepo.js.
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
  if (!empleado?.pin_hash) return false;
  return bcrypt.compare(String(pin), empleado.pin_hash);
}

export async function getEmpleadoById(id) {
  const { rows } = await pool.query('SELECT * FROM empleados WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function listActivos() {
  const { rows } = await pool.query(
    // pin_hash IS NOT NULL: tras la unificación `empleados` también guarda gente de oficina sin
    // acceso terreno — no deben aparecer como técnicos asignables en el wizard.
    `SELECT id, nombre, usuario, telefono, codigo FROM empleados WHERE activo = true AND pin_hash IS NOT NULL ORDER BY nombre`
  );
  return rows;
}

export async function listTodos() {
  const { rows } = await pool.query(`
    SELECT e.*,
      (SELECT count(*) FROM orden_empleados oe WHERE oe.empleado_id = e.id) as total_ordenes,
      (SELECT COALESCE(sum(o.total),0) FROM orden_empleados oe JOIN ordenes o ON o.id = oe.orden_id WHERE oe.empleado_id = e.id) as monto_generado,
      (SELECT max(o.fecha) FROM orden_empleados oe JOIN ordenes o ON o.id = oe.orden_id WHERE oe.empleado_id = e.id) as ultima_orden
    FROM empleados e ORDER BY e.nombre
  `);
  return rows;
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
