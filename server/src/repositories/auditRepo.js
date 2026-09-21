import { pool } from '../db/pool.js';

// audit_log — merges de clientes, resets de PIN, cambios de estado masivos, cambios
// de config/usuarios. Nunca debe tumbar la operación principal si falla (se llama
// "best effort" desde las rutas: try/catch + log, jamás awaited de forma que un
// fallo de auditoría revierta una transacción de negocio ya confirmada).
// Claves cuyo valor NUNCA debe quedar en claro en audit_log. `pin`/`clave` por igualdad exacta
// (evita falsos positivos tipo "shipping"); el resto por contención (password/passwordHash,
// invite_token/botToken, apiKey/api_key, secret...). Se aplica a TODO detalle, recursivo, aunque
// el endpoint que audita ni siquiera use ese campo.
const CLAVES_EXACTAS = new Set(['pin', 'clave', 'pinhash', 'newpin', 'pinnuevo']);
const CLAVES_PARCIALES = ['password', 'passwd', 'contrasena', 'contraseña', 'token', 'secret', 'apikey', 'authorization'];
const MAX_PROFUNDIDAD = 8;

function esClaveSensible(key) {
  const k = String(key).toLowerCase().replace(/[_\-\s]/g, '');
  return CLAVES_EXACTAS.has(k) || CLAVES_PARCIALES.some((s) => k.includes(s));
}

export function redactarSecretos(valor, profundidad = 0) {
  if (valor === null || typeof valor !== 'object') return valor;
  if (profundidad >= MAX_PROFUNDIDAD) return '[…]';
  if (Array.isArray(valor)) return valor.map((v) => redactarSecretos(v, profundidad + 1));
  const salida = {};
  for (const [key, v] of Object.entries(valor)) {
    if (esClaveSensible(key)) salida[key] = v === null || v === undefined || v === '' ? v : '[oculto]';
    else salida[key] = redactarSecretos(v, profundidad + 1);
  }
  return salida;
}

export async function registrar({ adminUserId, accion, entidad, entidadId, detalle }) {
  await pool.query(
    `INSERT INTO audit_log (admin_user_id, accion, entidad, entidad_id, detalle)
     VALUES ($1,$2,$3,$4,$5)`,
    [adminUserId || null, accion, entidad, entidadId != null ? String(entidadId) : null, detalle ? JSON.stringify(redactarSecretos(detalle)) : null]
  );
}

// Lista paginada con filtros opcionales. Usada tanto por la vista global
// (GET /api/admin/auditoria, todos los filtros) como por el historial de una orden
// puntual (GET /api/admin/ordenes/:id/auditoria, solo entidad+entidadId).
export async function listar({ page = 1, limit = 50, entidad, entidadId, adminUserId, fechaDesde, fechaHasta } = {}) {
  const conditions = [];
  const params = [];
  let i = 1;
  if (entidad) { conditions.push(`a.entidad = $${i++}`); params.push(entidad); }
  if (entidadId != null) { conditions.push(`a.entidad_id = $${i++}`); params.push(String(entidadId)); }
  if (adminUserId) { conditions.push(`a.admin_user_id = $${i++}`); params.push(adminUserId); }
  // fechaHasta llega como fecha pura ("2026-07-13") desde un <input type="date"> — comparar
  // con <= la trata como medianoche y excluye cualquier evento de ese mismo día (bug real:
  // filtrar "Hasta: hoy" devolvía 0 resultados aunque hubiera actividad hoy). Se compara
  // contra el inicio del día siguiente para incluir el día completo.
  if (fechaDesde) { conditions.push(`a.created_at >= $${i++}`); params.push(fechaDesde); }
  if (fechaHasta) { conditions.push(`a.created_at < ($${i++}::date + interval '1 day')`); params.push(fechaHasta); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;
  const { rows } = await pool.query(
    `SELECT a.*, u.email as admin_email, u.nombre as admin_nombre
     FROM audit_log a LEFT JOIN empleados u ON u.id = a.admin_user_id
     ${where} ORDER BY a.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
    [...params, limit, offset]
  );
  const { rows: countRows } = await pool.query(`SELECT count(*)::int as total FROM audit_log a ${where}`, params);
  return { rows, total: countRows[0].total, page, limit };
}
