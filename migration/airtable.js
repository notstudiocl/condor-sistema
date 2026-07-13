// Capa mínima de acceso a Airtable REST para el migrador. Usa fetch nativo (Node 18+)
// en vez de la librería 'airtable' para tener control fino sobre paginación y throttle;
// la dependencia 'airtable' del package.json queda disponible por si se necesita, pero
// esta capa no depende de ella para las listas paginadas.
import { sleep } from './utils.js';

const AIRTABLE_API_BASE = 'https://api.airtable.com/v0';

// Throttle global <= 5 req/s contra la API de Airtable (todas las tablas comparten
// el mismo límite de cuenta). 220ms de espacio mínimo entre requests -> ~4.5 req/s,
// con margen bajo el límite real de Airtable (5 req/s).
const MIN_INTERVAL_MS = 220;
let lastRequestAt = 0;

async function throttle() {
  const now = Date.now();
  const wait = lastRequestAt + MIN_INTERVAL_MS - now;
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

function getConfig() {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) {
    throw new Error('AIRTABLE_API_KEY / AIRTABLE_BASE_ID no están definidas');
  }
  return { apiKey, baseId };
}

async function airtableRequest(pathAndQuery, { retries = 3 } = {}) {
  const { apiKey, baseId } = getConfig();
  const url = `${AIRTABLE_API_BASE}/${baseId}/${pathAndQuery}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    await throttle();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (res.status === 429) {
      // Rate limited por Airtable pese al throttle local: backoff y reintento.
      const backoffMs = 1000 * attempt;
      console.warn(`  [airtable] 429 recibido, reintentando en ${backoffMs}ms (intento ${attempt}/${retries})`);
      await sleep(backoffMs);
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Airtable ${res.status} ${res.statusText} en ${pathAndQuery}: ${body.slice(0, 300)}`);
    }
    return res.json();
  }
  throw new Error(`Airtable: agotados los reintentos por rate limit en ${pathAndQuery}`);
}

function buildQuery({ fields, filterByFormula, sort, pageSize, offset }) {
  const params = new URLSearchParams();
  if (fields) fields.forEach((f) => params.append('fields[]', f));
  if (filterByFormula) params.set('filterByFormula', filterByFormula);
  if (sort) sort.forEach((s, i) => {
    params.set(`sort[${i}][field]`, s.field);
    params.set(`sort[${i}][direction]`, s.direction || 'asc');
  });
  if (pageSize) params.set('pageSize', String(pageSize));
  if (offset) params.set('offset', offset);
  return params.toString();
}

// Trae TODAS las páginas de una tabla (usado para Servicios/Empleados/Clientes,
// tablas chicas que se migran completas en cada corrida).
export async function fetchAllRecords(table, opts = {}) {
  const records = [];
  let offset;
  do {
    const query = buildQuery({ ...opts, pageSize: opts.pageSize || 100, offset });
    const data = await airtableRequest(`${encodeURIComponent(table)}?${query}`);
    records.push(...data.records);
    offset = data.offset;
  } while (offset);
  return records;
}

// Trae páginas de a una, hasta reunir `maxRecords` registros o agotar la tabla,
// invocando onPage(records) INMEDIATAMENTE después de listar cada página — así
// las URLs de attachments (expiran en ~2h) se procesan sin acumularse.
// Generaliza a --limit=5 (esta prueba F2d) y a --limit=410 (F4) por igual.
export async function fetchRecordsPaged(table, opts, maxRecords, onPage) {
  let collected = 0;
  let offset;
  do {
    const pageSize = Math.min(100, maxRecords - collected);
    const query = buildQuery({ ...opts, pageSize, offset });
    const data = await airtableRequest(`${encodeURIComponent(table)}?${query}`);
    const page = data.records.slice(0, maxRecords - collected);
    await onPage(page);
    collected += page.length;
    offset = data.offset;
  } while (offset && collected < maxRecords);
  return collected;
}

// Descarga inmediata de un attachment de Airtable (URL expira ~2h). Devuelve Buffer.
export async function downloadAttachment(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Descarga de attachment falló: ${res.status} ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
