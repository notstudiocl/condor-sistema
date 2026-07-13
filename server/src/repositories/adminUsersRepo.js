import bcrypt from 'bcrypt';
import { pool } from '../db/pool.js';

export async function findByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM admin_users WHERE lower(email) = lower($1)', [email]);
  return rows[0] || null;
}

export async function verificarPassword(user, password) {
  return bcrypt.compare(password, user.password_hash);
}

export async function registrarLogin(id) {
  await pool.query('UPDATE admin_users SET last_login_at = now() WHERE id = $1', [id]);
}

export async function crearAdminUser({ email, password, nombre, rol = 'oficina' }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO admin_users (email, password_hash, nombre, rol) VALUES ($1,$2,$3,$4) RETURNING id, email, nombre, rol, activo, created_at`,
    [email.toLowerCase(), passwordHash, nombre, rol]
  );
  return rows[0];
}

export async function listUsers() {
  const { rows } = await pool.query(
    'SELECT id, email, nombre, rol, activo, last_login_at, created_at FROM admin_users ORDER BY nombre'
  );
  return rows;
}

export async function countAdmins() {
  const { rows } = await pool.query(`SELECT count(*)::int as n FROM admin_users WHERE rol = 'admin' AND activo = true`);
  return rows[0].n;
}

export async function getById(id) {
  const { rows } = await pool.query(
    'SELECT id, email, nombre, rol, activo, last_login_at, created_at FROM admin_users WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

export async function actualizarAdminUser(id, { nombre, rol, activo }) {
  const { rows } = await pool.query(
    `UPDATE admin_users SET
       nombre = COALESCE($2, nombre), rol = COALESCE($3, rol), activo = COALESCE($4, activo),
       updated_at = now()
     WHERE id = $1
     RETURNING id, email, nombre, rol, activo, last_login_at, created_at`,
    [id, nombre, rol, activo]
  );
  return rows[0] || null;
}

export async function cambiarPassword(id, password) {
  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query('UPDATE admin_users SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, id]);
}

export async function eliminarAdminUser(id) {
  await pool.query('DELETE FROM admin_users WHERE id = $1', [id]);
}
