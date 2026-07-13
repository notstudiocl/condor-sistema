import { pool } from '../db/pool.js';

// Todas las métricas del Dashboard se calculan con queries agregadas reales en
// Postgres (nunca trayendo filas al backend para sumar en JS). `fecha` es un
// `date` sin zona horaria (el día del trabajo en terreno); se compara contra
// "hoy" en America/Santiago para que el corte de día sea el correcto para Chile.
const HOY_SQL = `(now() AT TIME ZONE 'America/Santiago')::date`;

export async function getKpis() {
  const { rows: hoyRows } = await pool.query(
    `SELECT count(*)::int as cantidad, COALESCE(sum(total),0) as total
     FROM ordenes WHERE fecha = ${HOY_SQL}`
  );

  const { rows: semanaRows } = await pool.query(
    `SELECT count(*)::int as cantidad, COALESCE(sum(total),0) as total
     FROM ordenes
     WHERE fecha >= date_trunc('week', ${HOY_SQL})::date
       AND fecha < (date_trunc('week', ${HOY_SQL}) + interval '7 days')::date`
  );

  const { rows: porFacturarRows } = await pool.query(
    `SELECT count(*)::int as cantidad, COALESCE(sum(total),0) as total
     FROM ordenes WHERE estado = 'Facturacion pendiente'`
  );

  // "Facturado del mes": órdenes marcadas Facturada cuya última actualización
  // (updated_at, momento del cambio de estado) cae en el mes calendario actual.
  const { rows: facturadoMesRows } = await pool.query(
    `SELECT count(*)::int as cantidad, COALESCE(sum(total),0) as total
     FROM ordenes
     WHERE estado = 'Facturada'
       AND date_trunc('month', updated_at AT TIME ZONE 'America/Santiago')
         = date_trunc('month', now() AT TIME ZONE 'America/Santiago')`
  );

  return {
    hoy: hoyRows[0],
    semana: semanaRows[0],
    porFacturar: porFacturarRows[0],
    facturadoMes: facturadoMesRows[0],
  };
}

export async function getTopServiciosMes(limit = 5) {
  const { rows } = await pool.query(
    `SELECT COALESCE(s.nombre, ot.nombre_personalizado) as nombre, count(*)::int as usos
     FROM orden_trabajos ot
     JOIN ordenes o ON o.id = ot.orden_id
     LEFT JOIN servicios s ON s.id = ot.servicio_id
     WHERE date_trunc('month', o.created_at AT TIME ZONE 'America/Santiago')
       = date_trunc('month', now() AT TIME ZONE 'America/Santiago')
     GROUP BY COALESCE(s.nombre, ot.nombre_personalizado)
     ORDER BY usos DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

// Órdenes por día de la semana actual (Lun..Dom) — para el gráfico de barras.
export async function getOrdenesPorDiaSemana() {
  const { rows } = await pool.query(
    `SELECT dia::date as fecha, COALESCE(o.cantidad, 0)::int as cantidad
     FROM generate_series(
       date_trunc('week', ${HOY_SQL})::date,
       (date_trunc('week', ${HOY_SQL}) + interval '6 days')::date,
       interval '1 day'
     ) as dia
     LEFT JOIN (
       SELECT fecha, count(*) as cantidad FROM ordenes
       WHERE fecha >= date_trunc('week', ${HOY_SQL})::date
         AND fecha < (date_trunc('week', ${HOY_SQL}) + interval '7 days')::date
       GROUP BY fecha
     ) o ON o.fecha = dia::date
     ORDER BY dia`
  );
  return rows;
}

export async function getPendientesFacturarAntiguas(limit = 8) {
  const { rows } = await pool.query(
    `SELECT id, numero_orden_display, fecha, cliente_empresa, supervisor, total,
       (${HOY_SQL} - fecha)::int as dias
     FROM ordenes
     WHERE estado = 'Facturacion pendiente'
     ORDER BY fecha ASC NULLS LAST
     LIMIT $1`,
    [limit]
  );
  return rows;
}
