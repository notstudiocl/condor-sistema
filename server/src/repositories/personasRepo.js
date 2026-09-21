import bcrypt from 'bcrypt';
import { randomBytes, randomInt } from 'node:crypto';
import { pool } from '../db/pool.js';

// Personas del sistema — tras la unificación (003_unify_usuarios.sql) TODAS viven en
// `empleados`: técnicos de terreno, gente de oficina, administradores y soporte NotStudio.
//
// Una persona = un perfil, con accesos por contexto:
//   - Acceso terreno (PWA): tiene pin_hash           -> usuario/RUT + PIN.
//   - Acceso panel:          email + password_hash + rol con panel (SQL_TIENE_PANEL).
//
// Este repo es la ÚNICA vía de escritura sobre personas (lo usa solo routes/admin/usuarios.js
// y los dos logins). empleadosRepo.js queda para lecturas/stats y el upsert de la migración.
//
// Los ids llegan de pg como string (bigint) — comparar siempre con String().

export const ROLES_VALIDOS = ['tecnico', 'oficina', 'admin', 'notstudio'];
export const ROLES_PANEL = ['notstudio', 'admin', 'oficina'];

// Condición de acceso al panel — una sola expresión reutilizada en todo el repo. Si a alguien
// le quitan el rol de panel o la contraseña, se vuelve falsa en la siguiente request aunque su
// JWT siga técnicamente vigente.
export const SQL_TIENE_PANEL = `(email IS NOT NULL AND password_hash IS NOT NULL AND rol = ANY('{notstudio,admin,oficina}'))`;

const MAX_INTENTOS_LOGIN = 5;
const BLOQUEO_MINUTOS = 15;
const INVITACION_HORAS = 72;

// Columnas seguras de exponer (nunca pin_hash / password_hash / invite_token).
const COLUMNAS_PUBLICAS = `
  id, nombre, rut, telefono, usuario, email, rol, activo, codigo, fecha_ingreso, especialidades,
  last_login_at, last_login_terreno_at, locked_until, created_at, updated_at,
  (pin_hash IS NOT NULL) AS tiene_pin,
  ${SQL_TIENE_PANEL} AS tiene_panel,
  (invite_token IS NOT NULL AND invite_expires_at > now()) AS invitacion_pendiente`;

export function normalizarEmail(email) {
  if (email === null || email === undefined) return null;
  const e = String(email).trim().toLowerCase();
  return e || null;
}

function generarPin() {
  return String(randomInt(1000, 10000));
}

// ─── Lecturas ───

// Estado mínimo que ambos middlewares releen en CADA request (nunca confían en el JWT).
export async function obtenerEstadoAcceso(id) {
  const { rows } = await pool.query(
    `SELECT id, nombre, email, rol, activo, (pin_hash IS NOT NULL) AS tiene_pin, ${SQL_TIENE_PANEL} AS tiene_panel
     FROM empleados WHERE id = $1`,
    [id]
  );
  const r = rows[0];
  if (!r) return null;
  return { id: r.id, nombre: r.nombre, email: r.email, rol: r.rol, activo: r.activo === true, tienePin: r.tiene_pin, tienePanel: r.tiene_panel };
}

// Fila completa (con hashes) — solo para los logins.
export async function findByEmail(email) {
  const norm = normalizarEmail(email);
  if (!norm) return null;
  const { rows } = await pool.query('SELECT * FROM empleados WHERE lower(email) = $1', [norm]);
  return rows[0] || null;
}

export async function getById(id) {
  const { rows } = await pool.query(`SELECT ${COLUMNAS_PUBLICAS} FROM empleados WHERE id = $1`, [id]);
  return rows[0] || null;
}

// incluirNotstudio=false oculta al soporte de NotStudio: para los demás roles esas cuentas
// no existen (ni en listados ni por id — ver routes/admin/usuarios.js).
export async function listar({ incluirNotstudio = false } = {}) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNAS_PUBLICAS},
       (SELECT count(*)::int FROM orden_empleados oe WHERE oe.empleado_id = e.id) AS total_ordenes
     FROM empleados e
     ${incluirNotstudio ? '' : `WHERE rol <> 'notstudio'`}
     ORDER BY nombre`
  );
  return rows;
}

export async function contarAdminsActivos() {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM empleados WHERE activo = true AND rol IN ('admin','notstudio') AND ${SQL_TIENE_PANEL}`
  );
  return rows[0].n;
}

export async function tieneHistorial(id) {
  const { rows } = await pool.query(
    `SELECT (EXISTS (SELECT 1 FROM orden_empleados WHERE empleado_id = $1)
          OR EXISTS (SELECT 1 FROM ordenes WHERE responsable_orden_id = $1)) AS tiene`,
    [id]
  );
  return rows[0].tiene === true;
}

// ─── Bloqueo por intentos fallidos (compartido por terreno y panel) ───

export function estaBloqueada(persona) {
  return !!persona?.locked_until && new Date(persona.locked_until) > new Date();
}

// Suma un fallo; al 5º bloquea 15 min y reinicia el contador. Atómico en un solo UPDATE.
export async function registrarFalloLogin(id) {
  const { rows } = await pool.query(
    `UPDATE empleados SET
       locked_until    = CASE WHEN failed_attempts + 1 >= $2 THEN now() + ($3 || ' minutes')::interval ELSE locked_until END,
       failed_attempts = CASE WHEN failed_attempts + 1 >= $2 THEN 0 ELSE failed_attempts + 1 END
     WHERE id = $1
     RETURNING locked_until, failed_attempts`,
    [id, MAX_INTENTOS_LOGIN, String(BLOQUEO_MINUTOS)]
  );
  return rows[0] || null;
}

export async function registrarLoginOk(id, contexto) {
  const columna = contexto === 'panel' ? 'last_login_at' : 'last_login_terreno_at';
  await pool.query(`UPDATE empleados SET ${columna} = now(), failed_attempts = 0, locked_until = NULL WHERE id = $1`, [id]);
}

export async function verificarPassword(persona, password) {
  if (!persona?.password_hash) return false;
  return bcrypt.compare(String(password), persona.password_hash);
}

// ─── Escrituras ───

export async function crearPersona({ nombre, rut, telefono, usuario, fechaIngreso, especialidades, rol = 'tecnico', email, accesoTerreno = false }) {
  const pin = accesoTerreno ? generarPin() : null;
  const pinHash = pin ? await bcrypt.hash(pin, 10) : null;
  // El código TCN### es de técnicos; la gente de oficina no consume correlativo.
  let numeroSecuencial = null;
  if (accesoTerreno || rol === 'tecnico') {
    const { rows: seq } = await pool.query('SELECT COALESCE(MAX(numero_secuencial), 0) + 1 AS next FROM empleados');
    numeroSecuencial = seq[0].next;
  }
  const { rows } = await pool.query(
    `INSERT INTO empleados (nombre, rut, telefono, usuario, fecha_ingreso, especialidades, rol, email, pin_hash, numero_secuencial)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [nombre, rut || null, telefono || null, usuario || null, fechaIngreso || null, especialidades || null,
     rol, normalizarEmail(email), pinHash, numeroSecuencial]
  );
  return { persona: await getById(rows[0].id), pin };
}

// Solo toca los campos presentes en `data` (undefined = no tocar; null/'' = vaciar donde aplica).
const CAMPOS_EDITABLES = {
  nombre: 'nombre', rut: 'rut', telefono: 'telefono', usuario: 'usuario',
  fechaIngreso: 'fecha_ingreso', especialidades: 'especialidades', rol: 'rol', activo: 'activo', email: 'email',
};

export async function actualizarPersona(id, data) {
  const sets = [];
  const params = [id];
  for (const [key, columna] of Object.entries(CAMPOS_EDITABLES)) {
    if (data[key] === undefined) continue;
    let valor = data[key];
    if (key === 'email') valor = normalizarEmail(valor);
    else if (typeof valor === 'string' && key !== 'nombre') valor = valor.trim() || null;
    params.push(valor);
    sets.push(`${columna} = $${params.length}`);
  }
  if (sets.length === 0) return getById(id);
  await pool.query(`UPDATE empleados SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, params);
  return getById(id);
}

// PIN nuevo (alta o reset de acceso terreno) — se devuelve en claro UNA sola vez.
export async function asignarPin(id) {
  const pin = generarPin();
  const pinHash = await bcrypt.hash(pin, 10);
  await pool.query(
    `UPDATE empleados SET pin_hash = $2,
       numero_secuencial = COALESCE(numero_secuencial, (SELECT COALESCE(MAX(numero_secuencial), 0) + 1 FROM empleados)),
       failed_attempts = 0, locked_until = NULL, updated_at = now()
     WHERE id = $1`,
    [id, pinHash]
  );
  return pin;
}

export async function quitarPin(id) {
  await pool.query('UPDATE empleados SET pin_hash = NULL, updated_at = now() WHERE id = $1', [id]);
}

export async function setPassword(id, password) {
  const passwordHash = await bcrypt.hash(String(password), 10);
  await pool.query(
    `UPDATE empleados SET password_hash = $2, invite_token = NULL, invite_expires_at = NULL,
       failed_attempts = 0, locked_until = NULL, updated_at = now() WHERE id = $1`,
    [id, passwordHash]
  );
}

// Quita la contraseña (corta la sesión del panel en la siguiente request). El email se conserva
// como dato de contacto y para poder re-invitar.
export async function quitarAccesoPanel(id) {
  await pool.query(
    'UPDATE empleados SET password_hash = NULL, invite_token = NULL, invite_expires_at = NULL, updated_at = now() WHERE id = $1',
    [id]
  );
}

export async function desbloquear(id) {
  await pool.query('UPDATE empleados SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [id]);
}

// ─── Invitaciones (enlace de 72 h para definir la propia contraseña) ───

export async function crearInvitacion(id) {
  const token = randomBytes(32).toString('base64url');
  await pool.query(
    `UPDATE empleados SET invite_token = $2, invite_expires_at = now() + ($3 || ' hours')::interval, updated_at = now() WHERE id = $1`,
    [id, token, String(INVITACION_HORAS)]
  );
  return token;
}

export async function findByInviteToken(token) {
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT id, nombre, email, rol, activo FROM empleados
     WHERE invite_token = $1 AND invite_expires_at > now() AND activo = true`,
    [token]
  );
  return rows[0] || null;
}

export async function eliminarPersona(id) {
  await pool.query('DELETE FROM empleados WHERE id = $1', [id]);
}
