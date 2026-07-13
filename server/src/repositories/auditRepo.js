import { pool } from '../db/pool.js';

// audit_log — merges de clientes, resets de PIN, cambios de estado masivos, cambios
// de config/usuarios. Nunca debe tumbar la operación principal si falla (se llama
// "best effort" desde las rutas: try/catch + log, jamás awaited de forma que un
// fallo de auditoría revierta una transacción de negocio ya confirmada).
export async function registrar({ adminUserId, accion, entidad, entidadId, detalle }) {
  await pool.query(
    `INSERT INTO audit_log (admin_user_id, accion, entidad, entidad_id, detalle)
     VALUES ($1,$2,$3,$4,$5)`,
    [adminUserId || null, accion, entidad, entidadId != null ? String(entidadId) : null, detalle ? JSON.stringify(detalle) : null]
  );
}

export async function listar({ page = 1, limit = 50, entidad }) {
  const conditions = [];
  const params = [];
  let i = 1;
  if (entidad) { conditions.push(`entidad = $${i++}`); params.push(entidad); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;
  const { rows } = await pool.query(
    `SELECT a.*, u.email as admin_email, u.nombre as admin_nombre
     FROM audit_log a LEFT JOIN admin_users u ON u.id = a.admin_user_id
     ${where} ORDER BY a.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
    [...params, limit, offset]
  );
  return rows;
}
