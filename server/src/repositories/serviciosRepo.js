import { pool } from '../db/pool.js';

export async function listActivos() {
  const { rows } = await pool.query('SELECT id, nombre FROM servicios WHERE activo = true ORDER BY nombre');
  return rows;
}

export async function listTodos() {
  const { rows } = await pool.query(`
    SELECT s.*,
      (SELECT count(*) FROM orden_trabajos ot WHERE ot.servicio_id = s.id) as usos,
      (SELECT max(o.created_at) FROM orden_trabajos ot JOIN ordenes o ON o.id = ot.orden_id WHERE ot.servicio_id = s.id) as ultimo_uso
    FROM servicios s ORDER BY s.activo DESC, s.nombre
  `);
  return rows;
}

export async function getByNombre(nombre) {
  const { rows } = await pool.query('SELECT * FROM servicios WHERE lower(nombre) = lower($1)', [nombre.trim()]);
  return rows[0] || null;
}

export async function crearServicio(nombre) {
  const { rows } = await pool.query(
    'INSERT INTO servicios (nombre, activo) VALUES ($1, true) RETURNING *',
    [nombre.trim()]
  );
  return rows[0];
}

export async function upsertServicioByAirtableId(data) {
  const { rows } = await pool.query(
    `INSERT INTO servicios (nombre, activo, airtable_record_id) VALUES ($1,$2,$3)
     ON CONFLICT (airtable_record_id) DO UPDATE SET nombre=EXCLUDED.nombre, activo=EXCLUDED.activo
     RETURNING *`,
    [data.nombre.trim(), data.activo, data.airtableRecordId]
  );
  return rows[0];
}

export async function actualizarServicio(id, { nombre, activo }) {
  const { rows } = await pool.query(
    'UPDATE servicios SET nombre = COALESCE($2, nombre), activo = COALESCE($3, activo) WHERE id = $1 RETURNING *',
    [id, nombre, activo]
  );
  return rows[0] || null;
}

export async function eliminarServicioSiSinUso(id) {
  const { rows } = await pool.query('SELECT count(*)::int as n FROM orden_trabajos WHERE servicio_id = $1', [id]);
  if (rows[0].n > 0) {
    return { eliminado: false, usos: rows[0].n };
  }
  await pool.query('DELETE FROM servicios WHERE id = $1', [id]);
  return { eliminado: true };
}
