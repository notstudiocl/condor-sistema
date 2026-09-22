import { pool, withTransaction } from '../db/pool.js';

// Cola de trabajos (tabla jobs, ver 004_jobs.sql). Backoff por intento: 1, 5 y 25 minutos;
// max_intentos = 3 por defecto, así el tercer fallo cae en el último valor.
const BACKOFF_MINUTOS = [1, 5, 25];

function backoffMs(intentos) {
  return BACKOFF_MINUTOS[Math.min(Math.max(intentos - 1, 0), BACKOFF_MINUTOS.length - 1)] * 60 * 1000;
}

// Encola; si ya hay un job activo del mismo tipo para la misma orden, devuelve null (índice
// único parcial idx_jobs_orden_activa) — reintentar no debe duplicar trabajo.
export async function encolar(tipo, payload = {}, delaySeconds = 0) {
  const { rows } = await pool.query(
    `INSERT INTO jobs (tipo, payload, next_run_at)
     VALUES ($1, $2::jsonb, now() + ($3 || ' seconds')::interval)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [tipo, JSON.stringify(payload), String(Math.max(delaySeconds, 0))]
  );
  return rows[0] || null;
}

// Toma el próximo job listo (FOR UPDATE SKIP LOCKED en una transacción corta), lo marca
// 'procesando' y ejecuta fn(job) FUERA de la transacción (hace I/O externo lento).
// Devuelve null si no había nada, o { job, estado: 'ok'|'error', definitivo, error }.
export async function reclamarSiguiente(fn) {
  let job = null;
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM jobs WHERE estado IN ('pendiente','error') AND next_run_at <= now()
       ORDER BY next_run_at LIMIT 1 FOR UPDATE SKIP LOCKED`
    );
    if (rows.length === 0) return;
    job = rows[0];
    await client.query(`UPDATE jobs SET estado = 'procesando', updated_at = now() WHERE id = $1`, [job.id]);
  });
  if (!job) return null;

  try {
    const resultado = await fn(job);
    await pool.query(
      `UPDATE jobs SET estado = 'ok', resultado = $2::jsonb, last_error = NULL, updated_at = now() WHERE id = $1`,
      [job.id, JSON.stringify(resultado ?? null)]
    );
    return { job, estado: 'ok', resultado };
  } catch (err) {
    const intentos = job.intentos + 1;
    const definitivo = intentos >= job.max_intentos;
    const mensaje = (err?.message || String(err)).slice(0, 1000);
    await pool.query(
      `UPDATE jobs SET estado = 'error', intentos = $2, last_error = $3,
         next_run_at = CASE WHEN $4 THEN 'infinity'::timestamptz ELSE now() + ($5 || ' milliseconds')::interval END,
         updated_at = now()
       WHERE id = $1`,
      [job.id, intentos, mensaje, definitivo, String(backoffMs(intentos))]
    );
    console.error(`[jobs] ${job.tipo} #${job.id} falló (intento ${intentos}/${job.max_intentos}${definitivo ? ', DEFINITIVO' : ''}):`, mensaje);
    return { job: { ...job, intentos }, estado: 'error', definitivo, error: mensaje };
  }
}

export async function listar({ limit = 50 } = {}) {
  const { rows } = await pool.query(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT $1`, [limit]);
  return rows;
}

// Re-encola un job en error definitivo (desde el panel de NotStudio).
export async function reintentar(id) {
  const { rows } = await pool.query(
    `UPDATE jobs SET estado = 'pendiente', intentos = 0, next_run_at = now(), updated_at = now()
     WHERE id = $1 AND estado = 'error' RETURNING *`,
    [id]
  );
  return rows[0] || null;
}
