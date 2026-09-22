import { pool } from '../db/pool.js';

// Todas las métricas del Dashboard se calculan con queries agregadas reales en Postgres
// (nunca trayendo filas al backend para sumar en JS). `fecha` es un `date` sin zona horaria
// (el día del trabajo en terreno); se compara contra "hoy" en America/Santiago.
//
// Rediseño 2026-09-22: Condor registra el TRABAJO, no la plata — de 653 órdenes reales ninguna
// tiene monto y los estados de facturación no se usan. Los KPIs son de operación (volumen,
// ritmo, horas de hidrojet, duración, carga por técnico y por cliente) y una lista de órdenes
// con problemas reales (sin PDF, sin fotos) en vez de "pendientes de facturar".
const HOY_SQL = `(now() AT TIME ZONE 'America/Santiago')::date`;

export async function getKpis() {
  const { rows } = await pool.query(`
    WITH hoy AS (SELECT ${HOY_SQL} AS d),
    sem AS (
      SELECT date_trunc('week', d)::date AS ini, (date_trunc('week', d) + interval '7 days')::date AS fin FROM hoy
    ),
    mes AS (
      SELECT date_trunc('month', d)::date AS ini, (date_trunc('month', d) + interval '1 month')::date AS fin,
             extract(day from d)::int AS dia, extract(day from (date_trunc('month', d) + interval '1 month - 1 day'))::int AS dias_mes
      FROM hoy
    )
    SELECT
      (SELECT count(*)::int FROM ordenes, sem WHERE fecha >= sem.ini AND fecha < sem.fin)                                   AS semana_actual,
      (SELECT count(*)::int FROM ordenes, sem WHERE fecha >= sem.ini - 7 AND fecha < sem.ini)                               AS semana_anterior,
      -- "a la misma altura": la semana pasada hasta el mismo día de la semana que hoy
      (SELECT count(*)::int FROM ordenes, sem, hoy WHERE fecha >= sem.ini - 7 AND fecha <= hoy.d - 7)                        AS semana_anterior_misma_altura,
      (SELECT count(*)::int FROM ordenes, mes WHERE fecha >= mes.ini AND fecha < mes.fin)                                    AS mes_actual,
      (SELECT count(*)::int FROM ordenes, mes WHERE fecha >= (mes.ini - interval '1 month')::date AND fecha < mes.ini)       AS mes_anterior,
      (SELECT count(*)::int FROM ordenes, mes, hoy WHERE fecha >= (mes.ini - interval '1 month')::date
         AND fecha <= (hoy.d - interval '1 month')::date)                                                                    AS mes_anterior_misma_altura,
      (SELECT dia FROM mes) AS dia_del_mes, (SELECT dias_mes FROM mes) AS dias_del_mes,
      (SELECT COALESCE(sum(t.cantidad),0)::int FROM orden_trabajos t JOIN servicios s ON s.id = t.servicio_id
         JOIN ordenes o ON o.id = t.orden_id, mes
        WHERE s.nombre ILIKE '%hidrojet%' AND o.fecha >= mes.ini AND o.fecha < mes.fin)                                       AS hidrojet_horas_mes,
      (SELECT count(DISTINCT t.orden_id)::int FROM orden_trabajos t JOIN servicios s ON s.id = t.servicio_id
         JOIN ordenes o ON o.id = t.orden_id, mes
        WHERE s.nombre ILIKE '%hidrojet%' AND o.fecha >= mes.ini AND o.fecha < mes.fin)                                       AS hidrojet_ordenes_mes,
      (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (hora_termino - hora_inicio)) / 60))::int
         FROM ordenes WHERE hora_termino > hora_inicio AND hora_termino - hora_inicio < interval '12 hours'
           AND fecha > ${HOY_SQL} - 90)                                                                                        AS duracion_mediana_min,
      (SELECT round(avg(extract(epoch FROM (hora_termino - hora_inicio)) / 60))::int
         FROM ordenes WHERE hora_termino > hora_inicio AND hora_termino - hora_inicio < interval '12 hours'
           AND fecha > ${HOY_SQL} - 90)                                                                                        AS duracion_promedio_min
  `);
  return rows[0];
}

export async function getTopServiciosMes(limit = 5) {
  const { rows } = await pool.query(
    `SELECT COALESCE(s.nombre, ot.nombre_personalizado) AS nombre,
       sum(ot.cantidad)::int AS usos, count(DISTINCT ot.orden_id)::int AS ordenes
     FROM orden_trabajos ot
     JOIN ordenes o ON o.id = ot.orden_id
     LEFT JOIN servicios s ON s.id = ot.servicio_id
     WHERE o.fecha >= date_trunc('month', ${HOY_SQL})::date
     GROUP BY COALESCE(s.nombre, ot.nombre_personalizado)
     ORDER BY usos DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

// Órdenes por día de la semana (Lun..Dom) acumuladas en los últimos `dias` días: muestra el
// patrón real de la operación (antes era solo la semana en curso y casi siempre eran ceros).
export async function getOrdenesPorDiaSemana(dias = 180) {
  const { rows } = await pool.query(
    `SELECT d.dow, COALESCE(o.cantidad, 0)::int AS cantidad
     FROM generate_series(1, 7) AS d(dow)
     LEFT JOIN (
       SELECT extract(isodow FROM fecha)::int AS dow, count(*) AS cantidad
       FROM ordenes WHERE fecha > ${HOY_SQL} - $1::int GROUP BY 1
     ) o ON o.dow = d.dow
     ORDER BY d.dow`,
    [dias]
  );
  return rows;
}

export async function getOrdenesPorTecnico(dias = 30, limit = 12) {
  const { rows } = await pool.query(
    `SELECT e.id, e.nombre, count(*)::int AS ordenes, max(o.fecha) AS ultima
     FROM orden_empleados oe
     JOIN empleados e ON e.id = oe.empleado_id
     JOIN ordenes o ON o.id = oe.orden_id
     WHERE o.fecha > ${HOY_SQL} - $1::int
     GROUP BY e.id, e.nombre
     ORDER BY ordenes DESC, e.nombre
     LIMIT $2`,
    [dias, limit]
  );
  return rows;
}

// Agrupado por RUT del cliente (no por el texto de cliente_empresa, que para un mismo cliente
// viene escrito de muchas formas). Las órdenes sin cliente vinculado se agrupan por texto.
export async function getTopClientes(dias = 90, limit = 6) {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(c.rut_normalizado, lower(o.cliente_empresa)) AS clave,
       COALESCE(min(c.empresa), min(o.cliente_empresa)) AS nombre,
       max(c.rut) AS rut,
       min(c.id) AS cliente_id,
       count(*)::int AS ordenes
     FROM ordenes o
     LEFT JOIN clientes c ON c.id = o.cliente_id
     WHERE o.fecha > ${HOY_SQL} - $1::int
     GROUP BY 1
     ORDER BY ordenes DESC
     LIMIT $2`,
    [dias, limit]
  );
  const { rows: tot } = await pool.query(`SELECT count(*)::int AS total FROM ordenes WHERE fecha > ${HOY_SQL} - $1::int`, [dias]);
  return { clientes: rows, total: tot[0].total };
}

// Órdenes que requieren acción de la oficina: sin PDF (no llegó al cliente) o sin fotos.
export async function getOrdenesConProblemas(limit = 8) {
  const { rows } = await pool.query(
    `SELECT o.id, o.numero_orden_display, o.fecha, o.cliente_empresa, o.supervisor, o.estado,
       NOT EXISTS (SELECT 1 FROM orden_fotos f WHERE f.orden_id = o.id AND f.tipo = 'pdf') AS sin_pdf,
       NOT EXISTS (SELECT 1 FROM orden_fotos f WHERE f.orden_id = o.id AND f.tipo IN ('antes','despues')) AS sin_fotos,
       (${HOY_SQL} - o.fecha)::int AS dias
     FROM ordenes o
     WHERE NOT EXISTS (SELECT 1 FROM orden_fotos f WHERE f.orden_id = o.id AND f.tipo = 'pdf')
        OR NOT EXISTS (SELECT 1 FROM orden_fotos f WHERE f.orden_id = o.id AND f.tipo IN ('antes','despues'))
     ORDER BY o.fecha DESC
     LIMIT $1`,
    [limit]
  );
  const { rows: c } = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM ordenes o WHERE NOT EXISTS (SELECT 1 FROM orden_fotos f WHERE f.orden_id = o.id AND f.tipo = 'pdf')) AS sin_pdf,
       (SELECT count(*)::int FROM ordenes o WHERE NOT EXISTS (SELECT 1 FROM orden_fotos f WHERE f.orden_id = o.id AND f.tipo IN ('antes','despues'))) AS sin_fotos,
       (SELECT count(*)::int FROM jobs WHERE estado = 'error' AND next_run_at = 'infinity') AS jobs_fallidos,
       (SELECT count(*)::int FROM notificacion_log WHERE ok = false AND sent_at > now() - interval '7 days') AS notif_fallidas_7d`
  );
  return { ordenes: rows, resumen: c[0] };
}
