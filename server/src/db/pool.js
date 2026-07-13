import pg from 'pg';

const { Pool, types } = pg;

// `date` (columnas sin hora, ej. ordenes.fecha) llega del driver como string
// "YYYY-MM-DD" en vez de convertirse a un JS Date — evita que el proceso Node
// construya "medianoche local" y termine desplazando la fecha un día completo al
// mostrarla en hora de Chile (bug real corregido: TODAS las órdenes se veían con la
// fecha de ayer). Ver client/src/utils/helpers.js formatFechaAmigable, que espera
// exactamente este formato plano.
types.setTypeParser(types.builtins.DATE, (value) => value);

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL no está definida');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Fuerza la sesión Postgres a interpretar/mostrar timestamps sin offset (los que
  // llegan del <input type="datetime-local"> del wizard, ej. "2026-07-13T08:30") como
  // hora de Chile, sin depender de cómo esté configurado el servidor Postgres por
  // default (típicamente UTC en una imagen sin configurar) — bug real corregido.
  options: '-c TimeZone=America/Santiago',
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function withTransaction(fn) {
  const client = await pool.connect();
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
