import crypto from 'node:crypto';
import { pool } from './pool.js';
import * as clientesRepo from '../repositories/clientesRepo.js';
import * as empleadosRepo from '../repositories/empleadosRepo.js';
import * as serviciosRepo from '../repositories/serviciosRepo.js';
import * as ordenesRepo from '../repositories/ordenesRepo.js';
import * as notificacionesRepo from '../repositories/notificacionesRepo.js';
import * as adminUsersRepo from '../repositories/adminUsersRepo.js';

let failures = 0;
function check(label, cond) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}`);
    failures++;
  }
}

async function main() {
  console.log('=== SMOKE TEST — Postgres staging ===\n');

  console.log('1. Cliente nuevo');
  const cliente = await clientesRepo.crearCliente({
    rut: '12.345.678-9', nombre: 'Carla Curificil', tipo: 'Empresa',
    empresa: 'Burger King Smoke Test', email: 'smoketest@example.com',
    telefono: '+56911111111', direccion: 'Av. Test 123', comuna: 'Providencia',
  });
  check('cliente creado con id', !!cliente.id);

  console.log('\n2. Técnicos (2)');
  const { empleado: tec1, pin: pin1 } = await empleadosRepo.crearEmpleado({
    nombre: 'Técnico Smoke Uno', usuario: `smoke.uno.${Date.now()}`, activo: true,
  });
  const { empleado: tec2 } = await empleadosRepo.crearEmpleado({
    nombre: 'Técnico Smoke Dos', usuario: `smoke.dos.${Date.now()}`, activo: true,
  });
  check('empleado 1 con código TCN generado', /^TCN\d{3}$/.test(tec1.codigo));
  check('PIN se hasheó (no queda en claro)', tec1.pin_hash !== pin1 && tec1.pin_hash.startsWith('$2'));
  const verificaPin = await empleadosRepo.verificarPin(tec1, pin1);
  check('bcrypt.compare valida el PIN correcto', verificaPin === true);

  console.log('\n3. Servicio real + servicio personalizado');
  const servicio = await serviciosRepo.crearServicio(`Hidrojet Smoke ${Date.now()}`);
  check('servicio creado', !!servicio.id);

  console.log('\n4. Orden completa (transacción: orden + trabajos + empleados)');
  const idempotencyKey = crypto.randomUUID();
  const orden = await ordenesRepo.createOrdenCompleta({
    fecha: '2026-07-12',
    clienteId: cliente.id,
    clienteEmpresa: cliente.empresa,
    clienteEmail: cliente.email,
    clienteTelefono: cliente.telefono,
    direccion: cliente.direccion,
    comuna: cliente.comuna,
    supervisor: 'Osvaldo Soto',
    horaInicio: '2026-07-12T08:30:00-04:00',
    horaTermino: '2026-07-12T12:00:00-04:00',
    descripcionTrabajo: 'Smoke test de la migración',
    total: 150000,
    metodoPago: 'Efectivo',
    garantia: 'Sin garantía',
    requiereFactura: false,
    idempotencyKey,
    empleadoIds: [tec1.id, tec2.id],
    responsableId: tec1.id,
    trabajos: [
      { trabajo: servicio.nombre, cantidad: 2, servicioId: servicio.id },
      { trabajo: 'Servicio personalizado no catalogado', cantidad: 1 },
    ],
  });
  check('orden creada con numero_orden asignado', !!orden.numero_orden);
  check('numero_orden_display con 5 dígitos', /^\d{5}$/.test(orden.numero_orden_display));

  const ordenCompleta = await ordenesRepo.getOrdenById(orden.id);
  check('2 técnicos vinculados', ordenCompleta.empleados.length === 2);
  check('2 trabajos vinculados (1 catálogo + 1 personalizado)', ordenCompleta.trabajos.length === 2);
  check('trabajo personalizado tiene nombre_personalizado', ordenCompleta.trabajos.some((t) => t.nombre_personalizado === 'Servicio personalizado no catalogado'));
  check('trabajo de catálogo resolvió servicio_nombre', ordenCompleta.trabajos.some((t) => t.servicio_nombre === servicio.nombre));

  console.log('\n5. Idempotencia (UNIQUE en idempotency_key)');
  const encontrada = await ordenesRepo.findByIdempotencyKey(idempotencyKey);
  check('findByIdempotencyKey encuentra la orden', encontrada?.id === orden.id);
  try {
    await pool.query('INSERT INTO ordenes (idempotency_key) VALUES ($1)', [idempotencyKey]);
    check('segundo INSERT con mismo idempotency_key debía fallar', false);
  } catch (e) {
    check('UNIQUE(idempotency_key) rechaza duplicados', e.code === '23505');
  }

  console.log('\n6. Fotos (orden_fotos, solo r2_key)');
  await ordenesRepo.agregarFoto(orden.id, { tipo: 'antes', r2Key: `ordenes/${orden.numero_orden_display}/antes/0-test.jpg`, contentType: 'image/jpeg', sizeBytes: 300000, ordenIndex: 0 });
  await ordenesRepo.agregarFoto(orden.id, { tipo: 'despues', r2Key: `ordenes/${orden.numero_orden_display}/despues/0-test.jpg`, contentType: 'image/jpeg', sizeBytes: 300000, ordenIndex: 0 });
  const ordenConFotos = await ordenesRepo.getOrdenById(orden.id);
  check('2 fotos vinculadas', ordenConFotos.fotos.length === 2);

  console.log('\n7. Cambio de estado (Enviada -> Completada)');
  const actualizada = await ordenesRepo.setEstado(orden.id, 'Completada');
  check('estado actualizado', actualizada.estado === 'Completada');

  console.log('\n8. CRÍTICO — clientes.rut NO es UNIQUE (datos reales tienen 7 grupos duplicados)');
  const clienteDuplicado = await clientesRepo.crearCliente({
    rut: '12.345.678-9', nombre: 'Otro contacto', empresa: 'Burger King Smoke Test (duplicado)',
  });
  check('segundo cliente con MISMO rut se creó sin error (no UNIQUE)', !!clienteDuplicado.id && clienteDuplicado.id !== cliente.id);

  console.log('\n9. CRÍTICO — sin CHECK de dígito verificador en rut');
  const clienteRutInvalido = await clientesRepo.crearCliente({ rut: '11.111.111-1', nombre: 'RUT con DV inválido a propósito' });
  check('cliente con RUT de DV inválido se creó sin error', !!clienteRutInvalido.id);

  console.log('\n10. CRÍTICO — sin CHECK temporal en horas (59 órdenes reales tienen término < inicio)');
  const ordenHorasInvertidas = await ordenesRepo.createOrdenCompleta({
    fecha: '2026-07-12', clienteId: cliente.id,
    horaInicio: '2026-07-12T23:30:00-04:00',
    horaTermino: '2026-07-12T00:15:00-04:00', // antes que el inicio, mismo día
    trabajos: [],
  });
  check('orden con hora_termino < hora_inicio se creó sin error', !!ordenHorasInvertidas.id);

  console.log('\n11. CRÍTICO — campos históricos nullable (orden sin fotos/servicios/responsable)');
  const ordenMinima = await ordenesRepo.createOrdenCompleta({ fecha: '2026-07-12', trabajos: [] });
  check('orden sin cliente/empleados/trabajos/responsable se creó sin error', !!ordenMinima.id);
  check('cliente_id quedó NULL (orden huérfana permitida)', ordenMinima.cliente_id === null);

  console.log('\n12. rut_normalizado — columna generada, índice NO único');
  const { rows: idxRows } = await pool.query(`
    SELECT indexdef FROM pg_indexes WHERE tablename = 'clientes' AND indexname = 'idx_clientes_rut_normalizado'
  `);
  check('índice existe', idxRows.length === 1);
  check('índice NO es UNIQUE', idxRows[0] && !idxRows[0].indexdef.toUpperCase().includes('UNIQUE'));

  console.log('\n13. merged_into nullable + soft merge de clientes');
  const fusion = await pool.connect();
  try {
    await fusion.query('BEGIN');
    const result = await clientesRepo.fusionarClientes(fusion, {
      ganadorId: cliente.id, perdedorId: clienteDuplicado.id,
      camposResultado: { rut: cliente.rut, nombre: cliente.nombre, empresa: cliente.empresa, email: cliente.email, telefono: cliente.telefono, direccion: cliente.direccion, comuna: cliente.comuna },
    });
    await fusion.query('COMMIT');
    check('fusión re-vinculó 0+ órdenes sin error', result.ordenesRevinculadas >= 0);
  } finally {
    fusion.release();
  }
  const perdedorPostFusion = await clientesRepo.getClienteById(clienteDuplicado.id);
  check('cliente perdedor quedó con merged_into seteado (soft merge, no delete)', perdedorPostFusion.merged_into === cliente.id);

  console.log('\n14. notification_channels — secreto cifrado, nunca en claro por consulta normal');
  await notificacionesRepo.upsertChannel({ canal: 'resend', activo: true, config: { fromEmail: 'noreply@test.cl' }, secret: 're_smoketest_1234567890abcdef', updatedBy: null });
  const channel = await notificacionesRepo.getChannel('resend');
  check('getChannel NO expone el secreto completo', channel.secret_last4 === 'cdef' && !('secret_encrypted' in channel) && !('secret' in channel));
  const decrypted = await notificacionesRepo.getDecryptedSecret('resend');
  check('getDecryptedSecret (uso interno) recupera el valor exacto', decrypted.secret === 're_smoketest_1234567890abcdef');

  console.log('\n15. admin_users');
  const adminUser = await adminUsersRepo.crearAdminUser({ email: `smoke-${Date.now()}@notstudio.cl`, password: 'test-password-123', nombre: 'Admin Smoke Test', rol: 'admin' });
  check('admin_user creado', !!adminUser.id);
  const found = await adminUsersRepo.findByEmail(adminUser.email);
  const passOk = await adminUsersRepo.verificarPassword(found, 'test-password-123');
  check('password hasheado y verificable', passOk === true);

  console.log('\n16. Paginación admin');
  const pagina = await ordenesRepo.listOrdenesAdmin({ page: 1, limit: 10 });
  check('listOrdenesAdmin devuelve total y ordenes', typeof pagina.total === 'number' && Array.isArray(pagina.ordenes));

  console.log('\n=== LIMPIEZA (borrando datos del smoke test) ===');
  await pool.query('DELETE FROM notificacion_log WHERE orden_id IN ($1,$2,$3)', [orden.id, ordenHorasInvertidas.id, ordenMinima.id]);
  await pool.query('DELETE FROM ordenes WHERE id = ANY($1)', [[orden.id, ordenHorasInvertidas.id, ordenMinima.id]]);
  await pool.query('DELETE FROM servicios WHERE id = $1', [servicio.id]);
  await pool.query('DELETE FROM empleados WHERE id = ANY($1)', [[tec1.id, tec2.id]]);
  await pool.query('DELETE FROM clientes WHERE id = ANY($1)', [[cliente.id, clienteDuplicado.id, clienteRutInvalido.id]]);
  await pool.query('DELETE FROM admin_users WHERE id = $1', [adminUser.id]);
  await pool.query(`DELETE FROM notification_channels WHERE canal = 'resend'`);
  console.log('  limpieza OK\n');

  console.log(`=== RESULTADO: ${failures === 0 ? 'TODOS LOS CHECKS PASARON ✓' : `${failures} CHECK(S) FALLARON ✗`} ===`);
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nSMOKE TEST FALLÓ CON ERROR:', err);
  process.exit(1);
});
