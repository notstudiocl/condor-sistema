#!/usr/bin/env node
// Migración histórica única: Airtable -> Postgres + R2 (Condor 360).
// Ver plan de migración sección 5. Orden por FKs: Servicios -> Empleados -> Clientes
// -> Ordenes (+ attachments). Todo upsert por airtable_record_id -> re-ejecutable
// infinitas veces contra staging.
//
// Uso:
//   node migrate.mjs [--limit=5] [--finalize]
//
//   --limit=N     cuántas órdenes migrar (por numero_orden/ID ascendente). Default 5
//                 (esta es la corrida de prueba F2d; F4 corre con --limit=410 o sin
//                 límite explícito para procesar todas).
//   --finalize    hace el setval() real de ordenes_numero_seq al final. Se omite por
//                 defecto a propósito: en una corrida parcial de prueba, 5 órdenes no
//                 representan el numero_orden máximo real y podrían ATRASAR la
//                 secuencia si se ejecutara el setval. Solo usar en la corrida completa.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pLimit from 'p-limit';

import { loadEnvFile, requireEnv } from './env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Credenciales: Airtable desde la raíz del repo (SOLO LECTURA), Postgres/R2 desde
// server/.env.staging. No pisan variables ya presentes en el entorno (una shell que
// hizo `set -a; source .env.staging; set +a` antes de correr el script tiene prioridad).
loadEnvFile(path.join(__dirname, '..', '.env'));
loadEnvFile(path.join(__dirname, '..', 'server', '.env.staging'));
requireEnv(['AIRTABLE_API_KEY', 'AIRTABLE_BASE_ID', 'DATABASE_URL', 'R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']);

const { fetchAllRecords, fetchRecordsPaged } = await import('./airtable.js');
const { loadManifest, saveManifest, buildR2Key, ensureAttachmentUploaded } = await import('./r2.js');
const {
  withTransaction, upsertServicio, findServicioByNombre,
  upsertEmpleado, getEmpleadoIdByAirtableId,
  upsertCliente, getClienteIdByAirtableId, listClienteRutDuplicados,
  upsertOrdenHistorica, relinkOrdenEmpleados, relinkOrdenTrabajos, relinkOrdenFotos,
  finalizarSecuenciaNumeroOrden, closePool,
} = await import('./db.js');
const { cleanText, cleanTelefono, cleanUuid } = await import('./utils.js');

// --- argv ---
const argv = process.argv.slice(2);
const limitArg = argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 5;
const FINALIZE = argv.includes('--finalize');

if (!Number.isFinite(LIMIT) || LIMIT <= 0) {
  console.error(`--limit inválido: ${limitArg}`);
  process.exit(1);
}

const casosRaros = {
  ordenesSinId: [],
  ordenesHuerfanas: [],
  empleadosNoResueltos: [],
  trabajosSinMatch: [],
  trabajosJsonInvalido: [],
  cantidadesInvalidas: [],
  estadosInvalidos: [],
  garantiasInvalidas: [],
  metodosPagoInvalidos: [],
  attachmentsFallidos: [],
  ordenesFallidas: [],
  empleadosUsuarioSintetizado: [],
};

const counts = { servicios: 0, empleados: 0, clientes: 0, ordenes: 0, fotos: 0 };

function logStep(msg) {
  console.log(`\n=== ${msg} ===`);
}

// ============================================================
// 1. Servicios
// ============================================================
async function migrarServicios() {
  logStep('1. Servicios');
  const records = await fetchAllRecords('Servicios');
  const servicioIdByNombre = new Map();
  for (const r of records) {
    const nombre = cleanText(r.fields['Nombre']);
    if (!nombre) continue;
    const activo = r.fields['Activo'] === true;
    const row = await upsertServicio({ nombre, activo, airtableRecordId: r.id });
    servicioIdByNombre.set(nombre.toLowerCase(), row.id);
    counts.servicios++;
  }
  console.log(`  ${counts.servicios} servicios migrados`);
  return servicioIdByNombre;
}

// ============================================================
// 2. Empleados
// ============================================================
async function migrarEmpleados() {
  logStep('2. Empleados');
  const records = await fetchAllRecords('Empleados');
  const empleadoIdByAirtableId = new Map();
  for (const r of records) {
    const f = r.fields;
    let usuario = cleanText(f['Usuario']);
    if (!usuario) {
      usuario = `empleado-${r.id}`;
      casosRaros.empleadosUsuarioSintetizado.push({ airtableRecordId: r.id, nombre: f['Nombre'], usuarioSintetizado: usuario });
    }
    const especialidades = Array.isArray(f['Especialidad']) && f['Especialidad'].length > 0 ? f['Especialidad'] : null;
    const row = await upsertEmpleado({
      rut: cleanText(f['RUT']),
      nombre: cleanText(f['Nombre']) || usuario,
      activo: f['Activo'] === true,
      telefono: cleanTelefono(f['Telefono']),
      usuario,
      pin: f['Pin Acceso'] || '1234',
      fechaIngreso: f['Fecha Ingreso'] || null,
      especialidades,
      numeroSecuencial: f['Numeración'] ?? null,
      airtableRecordId: r.id,
    });
    empleadoIdByAirtableId.set(r.id, row.id);
    counts.empleados++;
  }
  console.log(`  ${counts.empleados} empleados migrados`);
  return empleadoIdByAirtableId;
}

// ============================================================
// 3. Clientes
// ============================================================
async function migrarClientes() {
  logStep('3. Clientes');
  const records = await fetchAllRecords('Clientes');
  const clienteIdByAirtableId = new Map();
  for (const r of records) {
    const f = r.fields;
    const tipo = ['Particular', 'Empresa'].includes(f['Tipo']) ? f['Tipo'] : null;
    const row = await upsertCliente({
      rut: cleanText(f['RUT']),
      nombre: cleanText(f['Nombre']),
      tipo,
      empresa: cleanText(f['Empresa']),
      email: cleanText(f['Email']),
      telefono: cleanTelefono(f['Telefono']),
      direccion: cleanText(f['Direccion']),
      comuna: cleanText(f['Comuna']),
      airtableRecordId: r.id,
    });
    clienteIdByAirtableId.set(r.id, row.id);
    counts.clientes++;
  }
  console.log(`  ${counts.clientes} clientes migrados`);
  return clienteIdByAirtableId;
}

// ============================================================
// 4. Ordenes (+ attachments) — LIMITADO a --limit, orden ascendente por 'ID'
//    (autoNumber real de Airtable, no la fórmula 'Numero orden').
// ============================================================
const ESTADOS_VALIDOS = ['Pendiente', 'Enviada', 'Completada', 'Facturacion pendiente', 'Facturada'];
const GARANTIAS_VALIDAS = ['Sin garantía', '3 meses', '6 meses', '1 año'];
const METODOS_VALIDOS = ['Efectivo', 'Transferencia', 'Débito', 'Crédito', 'Por pagar'];

async function procesarOrden(rec, ctx) {
  const f = rec.fields;
  const airtableRecordId = rec.id;
  const numeroOrden = f['ID'];

  if (!Number.isInteger(numeroOrden)) {
    casosRaros.ordenesSinId.push(airtableRecordId);
    return;
  }

  // --- cliente (linked -> resuelto por airtable_record_id ya migrado en el paso 3) ---
  const clienteAirtableIds = f['Cliente RUT'] || [];
  let clienteId = null;
  if (clienteAirtableIds.length > 0) {
    clienteId = ctx.clienteIdByAirtableId.get(clienteAirtableIds[0]) || null;
    if (!clienteId) {
      casosRaros.ordenesHuerfanas.push({ numeroOrden, airtableRecordId, clienteAirtableId: clienteAirtableIds[0] });
    }
  }

  // --- empleados (linked, paso 2) ---
  const empleadoIds = [];
  for (const aid of f['Empleados'] || []) {
    const id = ctx.empleadoIdByAirtableId.get(aid);
    if (id) empleadoIds.push(id);
    else casosRaros.empleadosNoResueltos.push({ numeroOrden, airtableRecordId: aid });
  }

  // --- responsable orden (linked, casi siempre vacío en los datos históricos) ---
  const responsableAirtableIds = f['Responsable Orden'] || [];
  const responsableOrdenId = responsableAirtableIds.length > 0
    ? (ctx.empleadoIdByAirtableId.get(responsableAirtableIds[0]) || null)
    : null;

  // --- trabajos: parse JSON + match trim/case-insensitive contra servicios ---
  let trabajosRaw = [];
  try {
    const raw = (f['Trabajos realizados'] || '[]').trim();
    trabajosRaw = JSON.parse(raw || '[]');
    if (!Array.isArray(trabajosRaw)) throw new Error('el JSON no es un array');
  } catch (err) {
    casosRaros.trabajosJsonInvalido.push({ numeroOrden, error: err.message, raw: f['Trabajos realizados'] });
    trabajosRaw = [];
  }
  const trabajos = trabajosRaw.map((t) => {
    const nombre = cleanText(t.trabajo) || 'Sin nombre';
    let cantidad = Number(t.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      casosRaros.cantidadesInvalidas.push({ numeroOrden, trabajo: nombre, cantidadOriginal: t.cantidad });
      cantidad = 1;
    }
    const servicioId = ctx.servicioIdByNombre.get(nombre.toLowerCase()) || null;
    if (!servicioId) casosRaros.trabajosSinMatch.push({ numeroOrden, trabajo: nombre });
    return { servicioId, nombrePersonalizado: servicioId ? null : nombre, cantidad };
  });

  // --- campos con whitelist defensiva (CHECKs de Postgres) ---
  let estado = cleanText(f['Estado']);
  if (!ESTADOS_VALIDOS.includes(estado)) {
    casosRaros.estadosInvalidos.push({ numeroOrden, valor: f['Estado'] });
    estado = 'Enviada';
  }
  let garantia = cleanText(f['Garantia']);
  if (garantia && !GARANTIAS_VALIDAS.includes(garantia)) {
    casosRaros.garantiasInvalidas.push({ numeroOrden, valor: garantia });
    garantia = null;
  }
  let metodoPago = cleanText(f['Metodo pago']);
  if (metodoPago && !METODOS_VALIDOS.includes(metodoPago)) {
    casosRaros.metodosPagoInvalidos.push({ numeroOrden, valor: metodoPago });
    metodoPago = null;
  }
  const requiereFactura = f['Requiere factura'] === 'Sí';

  const ordenData = {
    numeroOrden,
    fecha: f['Fecha'] || null,
    estado,
    clienteId,
    clienteEmpresa: cleanText(f['Cliente / Empresa']),
    clienteEmail: cleanText(f['Cliente email']),
    clienteTelefono: cleanTelefono(f['Cliente telefono']),
    direccion: cleanText(f['Direccion']),
    ordenCompra: cleanText(f['Orden compra']),
    comuna: cleanText(f['Comuna']),
    supervisor: cleanText(f['Supervisor']),
    horaInicio: f['Hora inicio'] || null,
    horaTermino: f['Hora termino'] || null,
    descripcionTrabajo: cleanText(f['Descripcion trabajo']),
    observaciones: cleanText(f['Observaciones']),
    garantia,
    patenteVehiculo: cleanText(f['Patente vehiculo']),
    total: Number(f['Total']) || 0,
    metodoPago,
    requiereFactura,
    idempotencyKey: cleanUuid(f['Idempotency Key']),
    responsableOrdenId,
    airtableRecordId,
  };

  let ordenRow;
  try {
    ordenRow = await withTransaction(async (client) => {
      const orden = await upsertOrdenHistorica(client, ordenData);
      await relinkOrdenEmpleados(client, orden.id, empleadoIds);
      await relinkOrdenTrabajos(client, orden.id, trabajos);
      return orden;
    });
  } catch (err) {
    casosRaros.ordenesFallidas.push({ numeroOrden, airtableRecordId, error: err.message });
    console.error(`  ✗ OT ${numeroOrden}: falló la transacción de orden (${err.message}) — se continúa con la siguiente`);
    return;
  }

  // --- attachments: descarga inmediata (URLs de Airtable expiran ~2h) + sube a R2 ---
  const fotos = [];
  const tiposCampos = [
    ['Fotos Antes', 'antes'],
    ['Fotos Despues', 'despues'],
    ['Firma', 'firma'],
    ['PDF', 'pdf'],
  ];
  const tasks = [];
  for (const [campo, tipo] of tiposCampos) {
    const attachments = f[campo] || [];
    attachments.forEach((att, index) => {
      tasks.push(ctx.limitR2(async () => {
        const r2Key = buildR2Key(ordenRow.numero_orden_display, tipo, index, att.filename);
        try {
          const result = await ensureAttachmentUploaded(ctx.manifest, {
            attachmentId: att.id,
            url: att.url,
            filename: att.filename,
            size: att.size,
            contentType: att.type,
            r2Key,
          });
          fotos.push({
            tipo, r2Key: result.r2Key, filename: att.filename,
            contentType: result.contentType, sizeBytes: result.size,
          });
        } catch (err) {
          casosRaros.attachmentsFallidos.push({ numeroOrden, tipo, filename: att.filename, error: err.message });
        }
      }));
    });
  }
  await Promise.all(tasks);
  saveManifest(ctx.manifest); // progreso guardado tras cada orden — resiliencia ante crash a mitad de corrida

  await relinkOrdenFotos(ordenRow.id, fotos);

  counts.ordenes++;
  counts.fotos += fotos.length;
  const totalAttachments = tiposCampos.reduce((acc, [campo]) => acc + (f[campo] || []).length, 0);
  console.log(`  OT-${ordenRow.numero_orden_display} (Airtable ID=${numeroOrden}): ${empleadoIds.length} empleados, ${trabajos.length} trabajos, ${fotos.length}/${totalAttachments} adjuntos subidos a R2`);
}

async function migrarOrdenes(servicioIdByNombre, empleadoIdByAirtableId, clienteIdByAirtableId) {
  logStep(`4. Ordenes de Trabajo (limit=${LIMIT}, orden ascendente por ID)`);
  const manifest = loadManifest();
  const limitR2 = pLimit(5);
  const ctx = { servicioIdByNombre, empleadoIdByAirtableId, clienteIdByAirtableId, manifest, limitR2 };

  const total = await fetchRecordsPaged(
    'Ordenes de Trabajo',
    { sort: [{ field: 'ID', direction: 'asc' }] },
    LIMIT,
    async (page) => {
      for (const rec of page) {
        await procesarOrden(rec, ctx);
      }
    }
  );
  console.log(`  ${counts.ordenes}/${total} órdenes migradas exitosamente (de ${LIMIT} solicitadas), ${counts.fotos} fotos/adjuntos subidos`);
}

// ============================================================
// main
// ============================================================
async function main() {
  console.log('=== MIGRACIÓN HISTÓRICA Condor 360 — Airtable -> Postgres + R2 ===');
  console.log(`limit=${LIMIT} finalize=${FINALIZE}`);

  const servicioIdByNombre = await migrarServicios();
  const empleadoIdByAirtableId = await migrarEmpleados();
  const clienteIdByAirtableId = await migrarClientes();
  await migrarOrdenes(servicioIdByNombre, empleadoIdByAirtableId, clienteIdByAirtableId);

  const duplicados = await listClienteRutDuplicados();

  logStep('5. Secuencia de numero_orden');
  if (FINALIZE) {
    const nuevoValor = await finalizarSecuenciaNumeroOrden();
    console.log(`  setval ejecutado: ordenes_numero_seq = ${nuevoValor}`);
  } else {
    console.log('  --finalize no pasado: setval() OMITIDO a propósito (corrida parcial de prueba, ver comentario en migrate.mjs).');
  }

  logStep('REPORTE FINAL');
  console.log('Conteos migrados:');
  console.log(`  servicios: ${counts.servicios}`);
  console.log(`  empleados: ${counts.empleados}`);
  console.log(`  clientes:  ${counts.clientes}`);
  console.log(`  ordenes:   ${counts.ordenes} (de --limit=${LIMIT})`);
  console.log(`  fotos/adjuntos: ${counts.fotos}`);

  console.log(`\nRUT duplicados detectados entre los clientes migrados: ${duplicados.length} grupo(s)`);
  duplicados.forEach((d) => console.log(`  - rut_normalizado=${d.rut_normalizado} -> ${d.n} clientes (ids ${d.ids.join(',')}, empresas ${d.empresas.join(' / ')})`));

  console.log('\nCasos raros:');
  for (const [key, list] of Object.entries(casosRaros)) {
    if (list.length === 0) continue;
    console.log(`  ${key}: ${list.length}`);
    list.slice(0, 10).forEach((item) => console.log(`    - ${JSON.stringify(item)}`));
    if (list.length > 10) console.log(`    ... y ${list.length - 10} más`);
  }
  if (Object.values(casosRaros).every((l) => l.length === 0)) {
    console.log('  (ninguno)');
  }

  console.log(`\n=== FIN — ${FINALIZE ? 'corrida FINAL' : 'corrida de PRUEBA (datos quedan en staging, no se tocó la secuencia)'} ===`);

  await closePool();
}

main().catch(async (err) => {
  console.error('\nMIGRACIÓN FALLÓ CON ERROR NO MANEJADO:', err);
  await closePool().catch(() => {});
  process.exit(1);
});
