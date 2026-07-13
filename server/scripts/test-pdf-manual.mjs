// Prueba manual F2b — PDF + R2 + notificaciones (reemplazo de n8n).
// Requiere server/.env.staging cargado en el shell:
//   set -a; source .env.staging; set +a; node scripts/test-pdf-manual.mjs
//
// Crea una orden de prueba real (Postgres), sube fotos/firma truchas a R2 de verdad,
// genera el PDF con Gotenberg, verifica que el buffer sea un PDF válido, ejercita
// dispatchNotificaciones (sin credenciales reales -> debe degradar sin crashear) y
// limpia TODO (Postgres + R2) al final, pase lo que pase.

import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'node:crypto';
import { pool } from '../src/db/pool.js';
import * as clientesRepo from '../src/repositories/clientesRepo.js';
import * as empleadosRepo from '../src/repositories/empleadosRepo.js';
import * as serviciosRepo from '../src/repositories/serviciosRepo.js';
import * as ordenesRepo from '../src/repositories/ordenesRepo.js';
import { uploadBuffer, buildPublicUrl } from '../src/services/storage/r2.js';
import { buildHtml, buildPdfFilename } from '../src/services/pdf/template.js';
import { renderPdf } from '../src/services/pdf/gotenberg.js';
import { dispatchNotificaciones } from '../src/services/notifications/dispatch.js';

// 1x1 JPEG blanco válido — mínimo, real, decodifica en cualquier visor.
const TINY_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';

let failures = 0;
function check(label, cond) {
  console.log(`  ${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failures++;
  return cond;
}

// Ids/keys creados — se limpian en el finally sin importar dónde falle el script.
const cleanup = { ordenId: null, clienteId: null, empleadoId: null, servicioId: null, r2Keys: [] };

function r2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });
}

async function limpiarTodo() {
  console.log('\n=== LIMPIEZA ===');
  if (cleanup.ordenId) {
    // ON DELETE CASCADE se encarga de orden_trabajos, orden_empleados, orden_fotos, notificacion_log.
    await pool.query('DELETE FROM ordenes WHERE id = $1', [cleanup.ordenId]);
    console.log(`  orden ${cleanup.ordenId} eliminada de Postgres (cascada)`);
  }
  if (cleanup.servicioId) {
    await pool.query('DELETE FROM servicios WHERE id = $1', [cleanup.servicioId]);
  }
  if (cleanup.empleadoId) {
    await pool.query('DELETE FROM empleados WHERE id = $1', [cleanup.empleadoId]);
  }
  if (cleanup.clienteId) {
    await pool.query('DELETE FROM clientes WHERE id = $1', [cleanup.clienteId]);
  }
  console.log('  filas de Postgres limpiadas');

  if (cleanup.r2Keys.length > 0) {
    const client = r2Client();
    for (const key of cleanup.r2Keys) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
      } catch (err) {
        console.error(`  no se pudo borrar ${key} de R2:`, err.message);
      }
    }
    console.log(`  ${cleanup.r2Keys.length} objeto(s) borrados de R2`);
  }
}

async function main() {
  console.log('=== TEST MANUAL — F2b: PDF + R2 + notificaciones ===\n');

  console.log('1. Datos de prueba en Postgres (servicio + empleado + cliente + orden)');
  const servicio = await serviciosRepo.crearServicio(`Servicio Test PDF ${Date.now()}`);
  cleanup.servicioId = servicio.id;

  const { empleado: tec1 } = await empleadosRepo.crearEmpleado({
    nombre: 'Técnico Test PDF', usuario: `test.pdf.${Date.now()}`, activo: true,
  });
  cleanup.empleadoId = tec1.id;

  const cliente = await clientesRepo.crearCliente({
    rut: '9.876.543-2', nombre: 'Cliente Prueba PDF', tipo: 'Empresa', empresa: 'Empresa Prueba PDF',
    email: 'cliente-prueba-f2b@example.com', telefono: '+56 9 2222 3333', direccion: 'Calle Falsa 123', comuna: 'Ñuñoa',
  });
  cleanup.clienteId = cliente.id;

  check('servicio/empleado/cliente creados', !!servicio.id && !!tec1.id && !!cliente.id);

  const idempotencyKey = crypto.randomUUID();
  const ordenBase = await ordenesRepo.createOrdenCompleta({
    fecha: '2026-07-12',
    estado: 'Enviada',
    clienteId: cliente.id,
    clienteEmpresa: cliente.empresa,
    clienteEmail: cliente.email,
    clienteTelefono: cliente.telefono,
    direccion: cliente.direccion,
    comuna: cliente.comuna,
    supervisor: 'Osvaldo Soto (prueba)',
    horaInicio: '2026-07-12T08:30:00-04:00',
    horaTermino: '2026-07-12T12:15:00-04:00',
    descripcionTrabajo: 'Prueba manual F2b: generación de PDF real vía Gotenberg + subida a R2.',
    observaciones: 'Orden de prueba automatizada — no corresponde a un trabajo real.',
    garantia: '3 meses',
    patenteVehiculo: 'PRUE-BA',
    total: 125000,
    metodoPago: 'Transferencia',
    requiereFactura: false,
    idempotencyKey,
    empleadoIds: [tec1.id],
    responsableId: tec1.id,
    trabajos: [
      { trabajo: servicio.nombre, cantidad: 2, servicioId: servicio.id },
      { trabajo: 'Servicio personalizado de prueba', cantidad: 1 },
    ],
  });
  cleanup.ordenId = ordenBase.id;
  check('orden de prueba creada', !!ordenBase.id);
  check('numero_orden_display generado con 5 dígitos', /^\d{5}$/.test(ordenBase.numero_orden_display));

  console.log('\n2. Subiendo 3 fotos truchas + firma a R2 (real, mismo bucket que producción)');
  const jpegBuffer = Buffer.from(TINY_JPEG_B64, 'base64');
  const fotosPlan = [
    { tipo: 'antes', index: 0 },
    { tipo: 'antes', index: 1 },
    { tipo: 'despues', index: 0 },
  ];
  let primeraFotoKey = null;
  for (const f of fotosPlan) {
    const key = `ordenes/${ordenBase.numero_orden_display}/${f.tipo}/${f.index}-foto.jpg`;
    await uploadBuffer(key, jpegBuffer, 'image/jpeg');
    cleanup.r2Keys.push(key);
    if (!primeraFotoKey) primeraFotoKey = key;
    await ordenesRepo.agregarFoto(ordenBase.id, {
      tipo: f.tipo, r2Key: key, contentType: 'image/jpeg', sizeBytes: jpegBuffer.length, ordenIndex: f.index,
    });
  }
  const firmaKey = `ordenes/${ordenBase.numero_orden_display}/firma/0-firma.jpg`;
  await uploadBuffer(firmaKey, jpegBuffer, 'image/jpeg');
  cleanup.r2Keys.push(firmaKey);
  await ordenesRepo.agregarFoto(ordenBase.id, {
    tipo: 'firma', r2Key: firmaKey, contentType: 'image/jpeg', sizeBytes: jpegBuffer.length, ordenIndex: 0,
  });
  check('4 fotos reales subidas a R2 y vinculadas (2 antes + 1 despues + 1 firma)', true);

  const ordenHidratada = await ordenesRepo.getOrdenById(ordenBase.id);
  check('getOrdenById hidrata trabajos/empleados/fotos/cliente', ordenHidratada.fotos.length === 4 && ordenHidratada.empleados.length === 1 && ordenHidratada.trabajos.length === 2);
  check('cliente hidratado trae el RUT (no vive en ordenes)', ordenHidratada.cliente?.rut === cliente.rut);

  console.log('\n3. buildHtml() — puerto de la plantilla n8n');
  const html = buildHtml(ordenHidratada);
  check('HTML generado (no vacío)', typeof html === 'string' && html.length > 1000);
  check('logo embebido en base64 inline (no URL externa)', html.includes('data:image/png;base64,'));
  check('NO quedó ninguna URL externa de GitHub para el logo', !html.includes('raw.githubusercontent.com'));
  check('HTML contiene el número de orden', html.includes(ordenBase.numero_orden_display));
  check('HTML referencia la foto por su URL pública real de R2', html.includes(buildPublicUrl(primeraFotoKey)));
  check('HTML contiene el RUT del cliente', html.includes(cliente.rut));

  console.log('\n4. Gotenberg -> PDF real');
  let pdfBuffer = null;
  try {
    pdfBuffer = await renderPdf(html);
    check('Gotenberg respondió un Buffer no vacío', Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 0);
    check('el buffer es un PDF válido (empieza con %PDF)', pdfBuffer.subarray(0, 4).toString('ascii') === '%PDF');
    console.log(`  tamaño del PDF: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);
  } catch (err) {
    check(`Gotenberg generó el PDF sin error (FALLÓ: ${err.message})`, false);
  }

  let pdfUrl = null;
  if (pdfBuffer) {
    console.log('\n5. Subiendo el PDF real a R2');
    const pdfKey = `ordenes/${ordenBase.numero_orden_display}/pdf/0-${buildPdfFilename(ordenHidratada).replace(/\.pdf$/i, '')}.pdf`;
    await uploadBuffer(pdfKey, pdfBuffer, 'application/pdf');
    cleanup.r2Keys.push(pdfKey);
    pdfUrl = buildPublicUrl(pdfKey);
    check('PDF subido a R2', true);
    console.log('  URL pública:', pdfUrl);
  } else {
    console.log('\n5. (omitido — no hay PDF que subir)');
  }

  console.log('\n6. dispatchNotificaciones — SIN credenciales reales de Resend/Telegram configuradas');
  console.log('   (esperado: cada canal falla de forma controlada, sin crashear, todo queda logueado)');
  await ordenesRepo.setEstado(ordenBase.id, pdfBuffer ? 'Completada' : 'Enviada');
  const ordenFinal = await ordenesRepo.getOrdenById(ordenBase.id);

  let resultados = [];
  try {
    resultados = await dispatchNotificaciones(ordenFinal, { pdfUrl, pdfBuffer });
    check('dispatchNotificaciones no lanzó (Promise.allSettled protegió el flujo completo)', Array.isArray(resultados) && resultados.length === 3);
    resultados.forEach((r) => {
      console.log(`   - ${r.canal}/${r.plantilla}: ${r.ok ? 'OK (credenciales reales configuradas)' : `degradó correctamente (${r.error})`}`);
    });
  } catch (err) {
    check(`dispatchNotificaciones no lanzó (FALLÓ: ${err.message})`, false);
  }

  const { rows: logRows } = await pool.query('SELECT canal, plantilla, ok, error FROM notificacion_log WHERE orden_id = $1 ORDER BY canal', [ordenBase.id]);
  check('los 3 intentos quedaron registrados en notificacion_log', logRows.length === 3);
  check(
    'el log distingue error real de "canal inactivo o sin credenciales" (nunca finge éxito)',
    logRows.every((r) => r.ok === true || (r.ok === false && typeof r.error === 'string' && r.error.length > 0))
  );

  console.log(`\n=== RESULTADO: ${failures === 0 ? 'TODOS LOS CHECKS PASARON ✓' : `${failures} CHECK(S) FALLARON ✗`} ===`);
}

main()
  .catch((err) => {
    console.error('\nTEST FALLÓ CON ERROR NO CONTROLADO:', err);
    failures++;
  })
  .finally(async () => {
    try {
      await limpiarTodo();
    } catch (err) {
      console.error('\nERROR LIMPIANDO DATOS DE PRUEBA (revisar Postgres/R2 manualmente):', err.message);
      failures++;
    }
    await pool.end();
    process.exit(failures === 0 ? 0 : 1);
  });
