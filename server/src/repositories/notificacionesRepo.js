import { pool } from '../db/pool.js';

// Cifrado simétrico con pgcrypto (extensión ya habilitada en 001_init.sql).
// El secreto NUNCA sale de este módulo en claro hacia routes/.

export async function getChannel(canal) {
  const { rows } = await pool.query(
    'SELECT id, canal, activo, config, secret_last4, updated_by, updated_at FROM notification_channels WHERE canal = $1',
    [canal]
  );
  return rows[0] || null;
}

export async function listChannels() {
  const { rows } = await pool.query(
    'SELECT id, canal, activo, config, secret_last4, updated_by, updated_at FROM notification_channels ORDER BY canal'
  );
  return rows;
}

export async function upsertChannel({ canal, activo, config, secret, updatedBy }) {
  const encryptionKey = requireEncryptionKey();
  if (secret) {
    const last4 = secret.slice(-4);
    const { rows } = await pool.query(
      `INSERT INTO notification_channels (canal, activo, config, secret_encrypted, secret_last4, updated_by, updated_at)
       VALUES ($1,$2,$3, pgp_sym_encrypt($4,$5), $6, $7, now())
       ON CONFLICT (canal) DO UPDATE SET
         activo = EXCLUDED.activo, config = EXCLUDED.config,
         secret_encrypted = EXCLUDED.secret_encrypted, secret_last4 = EXCLUDED.secret_last4,
         updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING id, canal, activo, config, secret_last4, updated_by, updated_at`,
      [canal, activo, JSON.stringify(config || {}), secret, encryptionKey, last4, updatedBy]
    );
    return rows[0];
  }
  // Sin secret nuevo: conserva el secreto existente, solo actualiza activo/config
  const { rows } = await pool.query(
    `INSERT INTO notification_channels (canal, activo, config, updated_by, updated_at)
     VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (canal) DO UPDATE SET
       activo = EXCLUDED.activo, config = EXCLUDED.config, updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING id, canal, activo, config, secret_last4, updated_by, updated_at`,
    [canal, activo, JSON.stringify(config || {}), updatedBy]
  );
  return rows[0];
}

// SOLO consumido por services/notifications/*, nunca por una ruta HTTP directamente.
export async function getDecryptedSecret(canal) {
  const encryptionKey = requireEncryptionKey();
  const { rows } = await pool.query(
    `SELECT pgp_sym_decrypt(secret_encrypted, $2) as secret, activo, config
     FROM notification_channels WHERE canal = $1 AND secret_encrypted IS NOT NULL`,
    [canal, encryptionKey]
  );
  return rows[0] || null;
}

function requireEncryptionKey() {
  const key = process.env.APP_ENCRYPTION_KEY;
  if (!key) throw new Error('APP_ENCRYPTION_KEY no está definida');
  return key;
}

export async function logNotificacion({ ordenId, canal, plantilla, destinatario, ok, error }) {
  await pool.query(
    `INSERT INTO notificacion_log (orden_id, canal, plantilla, destinatario, ok, error)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [ordenId, canal, plantilla || null, destinatario || null, ok, error || null]
  );
}

export async function listLog({ page = 1, limit = 50, canal, soloFallidas, ordenId }) {
  const conditions = [];
  const params = [];
  let i = 1;
  if (canal) { conditions.push(`nl.canal = $${i++}`); params.push(canal); }
  if (soloFallidas) { conditions.push(`nl.ok = false`); }
  if (ordenId) { conditions.push(`nl.orden_id = $${i++}`); params.push(ordenId); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;
  const { rows } = await pool.query(
    `SELECT nl.*, o.numero_orden_display
     FROM notificacion_log nl JOIN ordenes o ON o.id = nl.orden_id
     ${where} ORDER BY nl.sent_at DESC LIMIT $${i} OFFSET $${i + 1}`,
    [...params, limit, offset]
  );
  const { rows: countRows } = await pool.query(
    `SELECT count(*)::int as total FROM notificacion_log nl ${where}`,
    params
  );
  return { rows, total: countRows[0].total };
}

export async function getTemplate(templateKey) {
  const { rows } = await pool.query('SELECT * FROM notification_templates WHERE template_key = $1', [templateKey]);
  return rows[0] || null;
}

export async function upsertTemplate({ templateKey, asunto, bloques, activo, updatedBy }) {
  const { rows } = await pool.query(
    `INSERT INTO notification_templates (template_key, asunto, bloques, activo, updated_by, updated_at)
     VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (template_key) DO UPDATE SET
       asunto = EXCLUDED.asunto, bloques = EXCLUDED.bloques, activo = EXCLUDED.activo,
       updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING *`,
    [templateKey, asunto || null, JSON.stringify(bloques || []), activo, updatedBy]
  );
  return rows[0];
}

export async function eliminarTemplateOverride(templateKey) {
  await pool.query('DELETE FROM notification_templates WHERE template_key = $1', [templateKey]);
}

// Config genérica key/value en app_settings — usada por config operativa editable desde
// el admin (p.ej. el logo de los correos, key 'logo_email_url'). NO confundir con el kill
// switch de suscripción, que vive en variables de entorno de EasyPanel a propósito
// (ver middleware/subscriptionGate.js) — ninguna de las dos apps puede leerlo ni editarlo.
export async function getSetting(key) {
  const { rows } = await pool.query('SELECT value FROM app_settings WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}

export async function setSetting(key, value, updatedBy) {
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ($1,$2,$3, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [key, JSON.stringify(value), updatedBy]
  );
}
