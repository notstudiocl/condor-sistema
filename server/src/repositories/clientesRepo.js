import { pool } from '../db/pool.js';

function normalizarRut(rut) {
  if (!rut) return null;
  return rut.replace(/[.\-\s]/g, '').toLowerCase();
}

export async function buscarClientes(q) {
  const like = `%${q}%`;
  const rutNorm = `%${normalizarRut(q) || ''}%`;
  const { rows } = await pool.query(
    `SELECT * FROM clientes
     WHERE merged_into IS NULL
       AND (rut_normalizado ILIKE $1 OR nombre ILIKE $2 OR empresa ILIKE $2
            OR email ILIKE $2 OR telefono ILIKE $2 OR comuna ILIKE $2)
     ORDER BY empresa NULLS LAST, nombre
     LIMIT 50`,
    [rutNorm, like]
  );
  return rows;
}

export async function getClienteById(id) {
  const { rows } = await pool.query('SELECT * FROM clientes WHERE id = $1', [id]);
  return rows[0] || null;
}

// Lista completa (para ClientesPage) con total histórico CLP y count de órdenes,
// agregados en Postgres — no en JS. Excluye clientes ya fusionados (merged_into).
export async function listTodosConTotales() {
  const { rows } = await pool.query(`
    SELECT c.*,
      COUNT(o.id)::int as total_ordenes,
      COALESCE(SUM(o.total), 0) as total_historico
    FROM clientes c
    LEFT JOIN ordenes o ON o.cliente_id = c.id
    WHERE c.merged_into IS NULL
    GROUP BY c.id
    ORDER BY c.empresa NULLS LAST, c.nombre
  `);
  return rows;
}

// Ficha 360: cliente + stats + últimas órdenes.
export async function getClienteConStats(id) {
  const cliente = await getClienteById(id);
  if (!cliente) return null;
  const { rows: statsRows } = await pool.query(
    `SELECT COUNT(*)::int as total_ordenes, COALESCE(SUM(total),0) as total_historico
     FROM ordenes WHERE cliente_id = $1`,
    [id]
  );
  const { rows: ultimasOrdenes } = await pool.query(
    `SELECT id, numero_orden_display, fecha, estado, total FROM ordenes
     WHERE cliente_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [id]
  );
  return { ...cliente, ...statsRows[0], ultimasOrdenes };
}

export async function getClienteByAirtableId(airtableRecordId) {
  const { rows } = await pool.query('SELECT * FROM clientes WHERE airtable_record_id = $1', [airtableRecordId]);
  return rows[0] || null;
}

export async function crearCliente(data) {
  const { rows } = await pool.query(
    `INSERT INTO clientes (rut, nombre, tipo, empresa, email, telefono, direccion, comuna, airtable_record_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [data.rut || null, data.nombre || null, data.tipo || null, data.empresa || null,
     data.email || null, data.telefono || null, data.direccion || null, data.comuna || null,
     data.airtableRecordId || null]
  );
  return rows[0];
}

export async function upsertClienteByAirtableId(data) {
  const { rows } = await pool.query(
    `INSERT INTO clientes (rut, nombre, tipo, empresa, email, telefono, direccion, comuna, airtable_record_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (airtable_record_id) DO UPDATE SET
       rut = EXCLUDED.rut, nombre = EXCLUDED.nombre, tipo = EXCLUDED.tipo,
       empresa = EXCLUDED.empresa, email = EXCLUDED.email, telefono = EXCLUDED.telefono,
       direccion = EXCLUDED.direccion, comuna = EXCLUDED.comuna, updated_at = now()
     RETURNING *`,
    [data.rut || null, data.nombre || null, data.tipo || null, data.empresa || null,
     data.email || null, data.telefono || null, data.direccion || null, data.comuna || null,
     data.airtableRecordId]
  );
  return rows[0];
}

export async function actualizarCliente(id, data) {
  const { rows } = await pool.query(
    `UPDATE clientes SET
       rut = COALESCE($2, rut), nombre = COALESCE($3, nombre), tipo = COALESCE($4, tipo),
       empresa = COALESCE($5, empresa), email = COALESCE($6, email), telefono = COALESCE($7, telefono),
       direccion = COALESCE($8, direccion), comuna = COALESCE($9, comuna), updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, data.rut, data.nombre, data.tipo, data.empresa, data.email, data.telefono, data.direccion, data.comuna]
  );
  return rows[0] || null;
}

// Excluye los grupos ya marcados "revisado, no son duplicados" (rut_grupos_revisados)
// — ej. empresas con múltiples locales legítimos bajo el mismo RUT.
export async function listarDuplicados() {
  const { rows } = await pool.query(`
    SELECT c.rut_normalizado, array_agg(c.id) as ids, array_agg(c.nombre) as nombres,
           array_agg(c.empresa) as empresas,
           (SELECT count(*) FROM ordenes o WHERE o.cliente_id = ANY(array_agg(c.id))) as total_ordenes
    FROM clientes c
    LEFT JOIN rut_grupos_revisados rgr ON rgr.rut_normalizado = c.rut_normalizado
    WHERE c.merged_into IS NULL AND c.rut_normalizado IS NOT NULL AND rgr.rut_normalizado IS NULL
    GROUP BY c.rut_normalizado
    HAVING count(*) > 1
  `);
  return rows;
}

// Marca un grupo de RUT como revisado ("no son duplicados, son locales/contactos
// distintos") — lo saca de listarDuplicados() sin fusionar ni tocar las filas de clientes.
export async function marcarGrupoRevisado(rutNormalizado, adminUserId) {
  const { rows } = await pool.query(
    `INSERT INTO rut_grupos_revisados (rut_normalizado, revisado_por, revisado_at)
     VALUES ($1, $2, now())
     ON CONFLICT (rut_normalizado) DO UPDATE SET
       revisado_por = EXCLUDED.revisado_por, revisado_at = now()
     RETURNING *`,
    [rutNormalizado, adminUserId || null]
  );
  return rows[0];
}

// Ficha del cliente: otros locales/contactos que comparten el mismo RUT (mismo
// rut_normalizado), excluyendo el propio y los ya fusionados. Consulta simple,
// sin tabla nueva — ver decisión de diseño en el header de la migración 002.
export async function getOtrosClientesMismoRut(clienteId) {
  const cliente = await getClienteById(clienteId);
  if (!cliente || !cliente.rut_normalizado) return [];
  const { rows } = await pool.query(
    `SELECT c.id, c.nombre, c.empresa, c.comuna, c.direccion,
            (SELECT count(*)::int FROM ordenes o WHERE o.cliente_id = c.id) as total_ordenes
     FROM clientes c
     WHERE c.rut_normalizado = $1 AND c.id <> $2 AND c.merged_into IS NULL
     ORDER BY c.empresa NULLS LAST, c.nombre`,
    [cliente.rut_normalizado, clienteId]
  );
  return rows;
}

export async function fusionarClientes(client, { ganadorId, perdedorId, camposResultado }) {
  if (camposResultado) {
    await client.query(
      `UPDATE clientes SET rut=COALESCE($2,rut), nombre=COALESCE($3,nombre),
         empresa=COALESCE($4,empresa), email=COALESCE($5,email),
         telefono=COALESCE($6,telefono), direccion=COALESCE($7,direccion),
         comuna=COALESCE($8,comuna), updated_at=now()
       WHERE id=$1`,
      [ganadorId, camposResultado.rut, camposResultado.nombre, camposResultado.empresa,
       camposResultado.email, camposResultado.telefono, camposResultado.direccion, camposResultado.comuna]
    );
  }
  const { rowCount } = await client.query('UPDATE ordenes SET cliente_id = $1 WHERE cliente_id = $2', [ganadorId, perdedorId]);
  await client.query('UPDATE clientes SET merged_into = $1, updated_at = now() WHERE id = $2', [ganadorId, perdedorId]);
  return { ordenesRevinculadas: rowCount };
}
