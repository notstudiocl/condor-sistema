import { pool } from '../db/pool.js';
import * as ordenesRepo from '../repositories/ordenesRepo.js';
import * as clientesRepo from '../repositories/clientesRepo.js';
import { uploadBuffer, buildPublicUrl } from './storage/r2.js';
import { buildHtml, buildPdfFilename } from './pdf/template.js';
import { renderPdf } from './pdf/gotenberg.js';
import { dispatchNotificaciones } from './notifications/dispatch.js';

// Orquesta la creación completa de una orden — reemplazo del webhook n8n.
// Orden de pasos (plan sección 3):
//   idempotencia -> cliente -> transacción orden+trabajos+empleados -> fotos/firma a R2
//   (paralelo, ~10s) -> HTML -> Gotenberg (~15s) -> PDF a R2 (~5s) -> estado 'Completada'
//   -> responde -> (fire-and-forget) notificaciones.
//
// Contrato de respuesta CONGELADO (no renombrar/quitar claves — la PWA vieja lo espera tal cual):
//   data.{ airtableOk, recordId, webhookOk, webhookError, duplicate, webhookData:
//     { success, numeroOrden, pdfUrl, pdfGenerado, airtableActualizado } }
// + `fotosOk` (corrección de resiliencia #5: nunca fingir éxito total con fotos perdidas).

// --- Idempotencia: Set en memoria, protege contra requests concurrentes con el mismo
// key mientras el proceso sigue vivo (respaldo: UNIQUE(idempotency_key) en DB). ---
const procesandoOrdenes = new Set();
const IDEMPOTENCY_TTL_MS = 60000;

const FOTOS_TIMEOUT_MS = 10000;
const PDF_UPLOAD_TIMEOUT_MS = 5000;

// Notificaciones disparadas en fire-and-forget, pero trackeadas para que un shutdown
// prolijo (fuera del alcance de este módulo) pueda esperar a que terminen antes de
// que el proceso salga — nunca un setTimeout(0) huérfano que pierde el resultado.
const pendingNotificaciones = new Set();

export function waitForPendingNotificaciones() {
  return Promise.allSettled([...pendingNotificaciones]);
}

function dispararNotificaciones(orden, ctx) {
  const promise = dispatchNotificaciones(orden, ctx)
    .catch((err) => {
      console.error(`[ordenService] dispatchNotificaciones falló para orden ${orden.id}:`, err.message);
    })
    .finally(() => {
      pendingNotificaciones.delete(promise);
    });
  pendingNotificaciones.add(promise);
  return promise;
}

// Exportada — reusada por routes/admin/ordenes.js (POST /:id/fotos) para subir fotos
// nuevas a una orden ya existente con el mismo parseo/validación que usa la creación.
export function parseBase64Image(base64) {
  const match = /^data:image\/(\w+);base64,(.+)$/.exec(base64 || '');
  if (!match) return null;
  const subtype = match[1].toLowerCase();
  const ext = subtype === 'jpeg' ? 'jpg' : subtype;
  const contentType = `image/${subtype === 'jpg' ? 'jpeg' : subtype}`;
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0) return null;
  return { buffer, ext, contentType };
}

function parseTrabajos(trabajos) {
  if (!trabajos) return [];
  if (typeof trabajos === 'string') {
    try {
      return JSON.parse(trabajos);
    } catch {
      return [];
    }
  }
  return Array.isArray(trabajos) ? trabajos : [];
}

// Linkea cada trabajo a su servicio de catálogo vía `serviciosIds` (acepta ids numéricos
// O 'rec*' de Airtable — corrección de resiliencia #4, órdenes encoladas offline
// pre-corte). Si no hay match por id, ordenesRepo.createOrdenCompleta igual intenta
// matchear por nombre (trim+case-insensitive) como último recurso.
async function resolverTrabajosConServicio(trabajosRaw, serviciosIdsRaw) {
  const trabajos = parseTrabajos(trabajosRaw);
  if (!serviciosIdsRaw || serviciosIdsRaw.length === 0 || trabajos.length === 0) return trabajos;

  const resolvedIds = await ordenesRepo.resolverServicioIds(pool, serviciosIdsRaw);
  if (resolvedIds.length === 0) return trabajos;

  const { rows } = await pool.query('SELECT id, nombre FROM servicios WHERE id = ANY($1)', [resolvedIds]);
  const nombreAId = new Map(rows.map((r) => [r.nombre.trim().toLowerCase(), r.id]));

  return trabajos.map((t) => ({
    trabajo: t.trabajo,
    cantidad: t.cantidad,
    servicioId: t.servicioId || nombreAId.get((t.trabajo || '').trim().toLowerCase()) || null,
  }));
}

function parseRequiereFactura(value) {
  return value === true || value === 'true' || value === 'Sí' || value === 'Si';
}

function buildPdfKey(orden) {
  const filenameSinExt = buildPdfFilename(orden).replace(/\.pdf$/i, '');
  return `ordenes/${orden.numero_orden_display}/pdf/0-${filenameSinExt}.pdf`;
}

/**
 * Sube fotos ANTES/DESPUES + firma a R2 en paralelo, con un presupuesto total de
 * ~10s (corrección de resiliencia #6). Nunca lanza: cada subida se intenta de forma
 * independiente (Promise.allSettled) y las que fallan simplemente no quedan en R2 ni
 * en orden_fotos — la orden nunca se marca como éxito total con fotos perdidas.
 *
 * ANTES/DESPUES son evidencia acumulativa por diseño (no se borran filas viejas, a
 * diferencia de firma/pdf) — por eso el índice de cada foto nueva SIEMPRE continúa
 * desde `ordenesRepo.siguienteIndiceFoto` (mismo patrón que ya usa correctamente
 * POST /api/admin/ordenes/:id/fotos) en vez de arrancar en 0. Si no fuera así, una
 * edición (PUT /api/ordenes/:id) que reenvía fotos nuevas reutilizaría las claves R2
 * 0-foto/1-foto de la creación original, pisando en silencio el archivo — la fila
 * vieja en orden_fotos queda apuntando a esa misma key, mostrando como "evidencia
 * antigua" un archivo que en realidad ya es el nuevo (bug real encontrado en QA:
 * pérdida silenciosa de evidencia fotográfica al editar, exactamente lo que la
 * corrección de resiliencia #5 prohíbe).
 */
async function subirFotosYFirma(ordenId, numeroOrdenDisplay, data) {
  const tareas = [];
  const fotosAntes = data.fotosAntes || [];
  if (fotosAntes.length > 0) {
    let idx = await ordenesRepo.siguienteIndiceFoto(ordenId, 'antes');
    fotosAntes.forEach((base64) => tareas.push({ tipo: 'antes', index: idx++, base64 }));
  }
  const fotosDespues = data.fotosDespues || [];
  if (fotosDespues.length > 0) {
    let idx = await ordenesRepo.siguienteIndiceFoto(ordenId, 'despues');
    fotosDespues.forEach((base64) => tareas.push({ tipo: 'despues', index: idx++, base64 }));
  }
  if (data.firmaBase64) tareas.push({ tipo: 'firma', index: 0, base64: data.firmaBase64 });

  if (tareas.length === 0) return { subidas: [], fotosOk: true };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FOTOS_TIMEOUT_MS);

  let resultados;
  try {
    resultados = await Promise.allSettled(
      tareas.map(async (t) => {
        const parsed = parseBase64Image(t.base64);
        if (!parsed) throw new Error(`foto ${t.tipo}[${t.index}] no es un data URI de imagen válido`);
        const key = `ordenes/${numeroOrdenDisplay}/${t.tipo}/${t.index}-foto.${parsed.ext}`;
        await uploadBuffer(key, parsed.buffer, parsed.contentType, { abortSignal: controller.signal });
        return { tipo: t.tipo, index: t.index, key, contentType: parsed.contentType, size: parsed.buffer.length };
      })
    );
  } finally {
    clearTimeout(timeout);
  }

  const subidas = [];
  let fotosOk = true;
  resultados.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      subidas.push(r.value);
    } else {
      fotosOk = false;
      const t = tareas[i];
      console.error(`[ordenService] fallo subiendo ${t.tipo}[${t.index}] a R2:`, r.reason?.message || r.reason);
    }
  });

  return { subidas, fotosOk };
}

/**
 * HTML -> Gotenberg -> R2. Degrada en silencio (nunca lanza): si algo falla, la orden
 * queda 'Enviada' sin PDF, con botón Reintentar en el frontend — corrección de
 * resiliencia #6, nunca pantalla roja con la orden ya creada.
 */
async function generarYSubirPdf(orden) {
  try {
    const html = buildHtml(orden);
    const pdfBuffer = await renderPdf(html); // timeout ~15s propio de gotenberg.js
    const pdfKey = buildPdfKey(orden);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PDF_UPLOAD_TIMEOUT_MS);
    try {
      await uploadBuffer(pdfKey, pdfBuffer, 'application/pdf', { abortSignal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    return { ok: true, pdfKey, pdfUrl: buildPublicUrl(pdfKey), pdfBuffer };
  } catch (err) {
    console.error(`[ordenService] PDF no generado para orden ${orden.numero_orden_display || orden.id}:`, err.message);
    return { ok: false, error: err.message };
  }
}

function respuestaDuplicada(orden) {
  const pdfFoto = (orden.fotos || []).find((f) => f.tipo === 'pdf');
  const pdfUrl = pdfFoto ? buildPublicUrl(pdfFoto.r2_key) : null;
  return {
    success: true,
    data: {
      airtableOk: true,
      recordId: String(orden.id),
      webhookOk: true,
      webhookError: null,
      fotosOk: true,
      duplicate: true,
      webhookData: {
        success: true,
        message: 'Orden ya fue creada anteriormente',
        numeroOrden: orden.numero_orden_display,
        pdfUrl,
        pdfGenerado: !!pdfUrl,
        airtableActualizado: !!pdfUrl,
      },
    },
  };
}

/**
 * Crea una orden completa: cliente -> orden+trabajos+empleados -> fotos -> PDF ->
 * notificaciones. `data` es el payload del wizard (mismo shape que hoy envía
 * OrdenWizardPage) + `data.responsableId`, que la capa de rutas resuelve a partir de
 * req.user (empleado logueado) antes de llamar acá — este servicio no conoce Express.
 */
export async function createOrdenCompleta(data) {
  const idempotencyKey = data.idempotencyKey || null;

  // --- 0. Idempotencia ---
  if (idempotencyKey) {
    if (procesandoOrdenes.has(idempotencyKey)) {
      return {
        success: true,
        data: {
          airtableOk: true, recordId: null, webhookOk: true, webhookError: null,
          fotosOk: true, duplicate: true, webhookData: null,
          message: 'Orden ya está siendo procesada',
        },
      };
    }
    procesandoOrdenes.add(idempotencyKey);
    setTimeout(() => procesandoOrdenes.delete(idempotencyKey), IDEMPOTENCY_TTL_MS);

    try {
      const existente = await ordenesRepo.findByIdempotencyKey(idempotencyKey);
      if (existente) {
        procesandoOrdenes.delete(idempotencyKey);
        const hidratada = await ordenesRepo.getOrdenById(existente.id);
        return respuestaDuplicada(hidratada);
      }
    } catch (err) {
      console.error('[ordenService] error verificando idempotencia en DB:', err.message);
    }
  }

  try {
    // --- 1. Cliente (crea uno nuevo solo si no viene ya resuelto) ---
    let clienteId = data.clienteRecordId || null;
    if (!clienteId && data.clienteRut) {
      const nuevoCliente = await clientesRepo.crearCliente({
        rut: data.clienteRut,
        nombre: data.supervisor || '',
        tipo: 'Particular',
        empresa: data.clienteEmpresa || '',
        email: data.clienteEmail || '',
        telefono: data.clienteTelefono || '',
        direccion: data.direccion || '',
        comuna: data.comuna || '',
      });
      clienteId = nuevoCliente.id;
    }

    // --- 2. Orden + trabajos + empleados (una transacción) ---
    const ordenBase = await ordenesRepo.createOrdenCompleta({
      fecha: data.fecha || new Date().toISOString().slice(0, 10),
      estado: 'Enviada',
      clienteId,
      clienteEmpresa: data.clienteEmpresa || null,
      clienteEmail: data.clienteEmail || null,
      clienteTelefono: data.clienteTelefono || null,
      direccion: data.direccion || null,
      ordenCompra: data.ordenCompra || null,
      comuna: data.comuna || null,
      supervisor: data.supervisor || null,
      horaInicio: data.horaInicio || null,
      horaTermino: data.horaTermino || null,
      descripcionTrabajo: data.descripcion || null,
      observaciones: data.observaciones || null,
      garantia: data.garantia || 'Sin garantía',
      patenteVehiculo: data.patenteVehiculo || null,
      total: Number(data.total) || 0,
      metodoPago: data.metodoPago || null,
      requiereFactura: parseRequiereFactura(data.requiereFactura),
      idempotencyKey,
      empleadoIds: data.empleadosRecordIds || [],
      responsableId: data.responsableId || null,
      trabajos: await resolverTrabajosConServicio(data.trabajos, data.serviciosIds),
    });

    // --- 3, 4, 5. Fotos/firma a R2 -> PDF -> notificaciones (compartido con actualizarOrdenCompleta) ---
    const respuesta = await finalizarOrdenYResponder(ordenBase, data);

    if (idempotencyKey) procesandoOrdenes.delete(idempotencyKey);

    return respuesta;
  } catch (err) {
    if (idempotencyKey) procesandoOrdenes.delete(idempotencyKey);
    throw err;
  }
}

/**
 * Pasos compartidos por creación y edición, una vez que la orden ya existe en DB:
 * sube fotos/firma nuevas a R2 (nunca finge éxito), genera el PDF vía Gotenberg y lo
 * sube a R2 (degrada en silencio si falla), y dispara notificaciones fire-and-forget.
 * Firma y PDF son 1:1 por orden — si esta es una edición que ya tenía uno, se
 * reemplaza en vez de acumular filas ambiguas en orden_fotos (bug detectado en F3:
 * "reenviar"/"editar" podían correr N veces e ir apilando PDFs/firmas indistinguibles).
 */
async function finalizarOrdenYResponder(ordenBase, data) {
  if (data.firmaBase64) {
    await ordenesRepo.eliminarFotosPorTipo(ordenBase.id, 'firma');
  }

  const { subidas, fotosOk } = await subirFotosYFirma(ordenBase.id, ordenBase.numero_orden_display, data);
  for (const s of subidas) {
    await ordenesRepo.agregarFoto(ordenBase.id, {
      tipo: s.tipo, r2Key: s.key, contentType: s.contentType, sizeBytes: s.size, ordenIndex: s.index,
    });
  }

  const ordenHidratada = await ordenesRepo.getOrdenById(ordenBase.id);
  const resultadoPdf = await generarYSubirPdf(ordenHidratada);

  let pdfUrl = null;
  if (resultadoPdf.ok) {
    await ordenesRepo.eliminarFotosPorTipo(ordenBase.id, 'pdf');
    await ordenesRepo.agregarFoto(ordenBase.id, {
      tipo: 'pdf', r2Key: resultadoPdf.pdfKey, contentType: 'application/pdf', ordenIndex: 0,
    });
    await ordenesRepo.setEstado(ordenBase.id, 'Completada');
    pdfUrl = resultadoPdf.pdfUrl;
  }

  const respuesta = {
    success: true,
    data: {
      airtableOk: true,
      recordId: String(ordenBase.id),
      webhookOk: resultadoPdf.ok,
      webhookError: resultadoPdf.ok ? null : (resultadoPdf.error || 'No se pudo generar el PDF'),
      fotosOk,
      duplicate: false,
      webhookData: {
        success: resultadoPdf.ok,
        message: resultadoPdf.ok ? 'Orden procesada correctamente' : 'Orden guardada, PDF pendiente de generar',
        numeroOrden: ordenBase.numero_orden_display,
        pdfUrl,
        pdfGenerado: resultadoPdf.ok,
        airtableActualizado: resultadoPdf.ok,
      },
    },
  };

  // --- Notificaciones — fire-and-forget, nunca bloquea la respuesta ---
  if (resultadoPdf.ok) {
    const ordenFinal = await ordenesRepo.getOrdenById(ordenBase.id); // estado ya 'Completada'
    dispararNotificaciones(ordenFinal, { pdfUrl, pdfBuffer: resultadoPdf.pdfBuffer });
  }

  return respuesta;
}

/**
 * Edición (PUT /api/ordenes/:id — "editar y reenviar"): actualiza campos/trabajos/
 * empleados, sube fotos nuevas si vienen (el wizard en editMode siempre pide una
 * firma nueva, y valida al menos 1 foto antes/después), regenera el PDF y reenvía
 * notificaciones. Mismo contrato de respuesta que createOrdenCompleta.
 * clienteId: a diferencia de create, NO crea cliente nuevo si no viene resuelto
 * (mismo comportamiento que tenía el PUT antes de F3) — el repo conserva el cliente
 * existente vía COALESCE cuando clienteId es null.
 */
export async function actualizarOrdenCompleta(ordenId, data) {
  const ordenActualizada = await ordenesRepo.actualizarOrdenCompleta(ordenId, {
    estado: 'Enviada',
    clienteId: data.clienteRecordId || null,
    clienteEmpresa: data.clienteEmpresa || null,
    clienteEmail: data.clienteEmail || null,
    clienteTelefono: data.clienteTelefono || null,
    direccion: data.direccion || null,
    ordenCompra: data.ordenCompra || null,
    comuna: data.comuna || null,
    supervisor: data.supervisor || null,
    horaInicio: data.horaInicio || null,
    horaTermino: data.horaTermino || null,
    descripcionTrabajo: data.descripcion || null,
    observaciones: data.observaciones || null,
    garantia: data.garantia || 'Sin garantía',
    patenteVehiculo: data.patenteVehiculo || null,
    total: Number(data.total) || 0,
    metodoPago: data.metodoPago || null,
    requiereFactura: parseRequiereFactura(data.requiereFactura),
    empleadoIds: data.empleadosRecordIds || [],
    responsableId: data.responsableId || null,
    trabajos: data.trabajos ? await resolverTrabajosConServicio(data.trabajos, data.serviciosIds) : undefined,
  });

  if (!ordenActualizada) {
    return {
      success: false,
      notFound: true,
      data: { airtableOk: false, recordId: null, webhookOk: false, webhookError: 'Orden no encontrada', webhookData: null },
    };
  }

  return finalizarOrdenYResponder(ordenActualizada, data);
}

/**
 * Reenvío manual (POST /api/ordenes/:id/reenviar): regenera el PDF y reenvía las 3
 * notificaciones. Mismo shape de respuesta congelado: { data: { webhookOk, webhookError, webhookData } }.
 */
export async function reenviarNotificacionesOrden(ordenId) {
  const orden = await ordenesRepo.getOrdenById(ordenId);
  if (!orden) {
    return { success: false, data: { webhookOk: false, webhookError: 'Orden no encontrada', webhookData: null } };
  }

  const resultadoPdf = await generarYSubirPdf(orden);

  let webhookData = null;
  let ordenFinal = orden;

  if (resultadoPdf.ok) {
    await ordenesRepo.eliminarFotosPorTipo(orden.id, 'pdf');
    await ordenesRepo.agregarFoto(orden.id, {
      tipo: 'pdf', r2Key: resultadoPdf.pdfKey, contentType: 'application/pdf', ordenIndex: 0,
    });
    await ordenesRepo.setEstado(orden.id, 'Completada');
    ordenFinal = await ordenesRepo.getOrdenById(orden.id);

    const resultadosNotif = await dispatchNotificaciones(ordenFinal, { pdfUrl: resultadoPdf.pdfUrl, pdfBuffer: resultadoPdf.pdfBuffer });
    webhookData = {
      success: true,
      message: 'Orden reenviada correctamente',
      numeroOrden: ordenFinal.numero_orden_display,
      pdfUrl: resultadoPdf.pdfUrl,
      pdfGenerado: true,
      airtableActualizado: true,
      notificaciones: resultadosNotif,
    };
  }

  return {
    success: true,
    data: {
      webhookOk: resultadoPdf.ok,
      webhookError: resultadoPdf.ok ? null : (resultadoPdf.error || 'No se pudo generar el PDF'),
      webhookData,
    },
  };
}

// Alias — routes/ordenes.js (F2a) deja el punto de integración comentado como
// "ordenService.reenviarOrden"; mismo comportamiento que reenviarNotificacionesOrden,
// exportado con ambos nombres para no depender de que F3 tenga que adivinar cuál usar.
export { reenviarNotificacionesOrden as reenviarOrden };

/**
 * Regenera SOLO el PDF de una orden ya existente, con los datos ACTUALES en DB —
 * usado por POST /api/admin/ordenes/:id/regenerar-pdf tras una edición desde el admin.
 * A diferencia de reenviarNotificacionesOrden/reenviarOrden, esta función NO dispara
 * notificaciones (email/Telegram): regenerar el PDF después de cada edición administrativa
 * no debe reenviar avisos al cliente cada vez. Reemplaza la fila 'pdf' en vez de acumular
 * (mismo criterio 1:1 por orden que el resto del pipeline, ver finalizarOrdenYResponder).
 */
export async function regenerarPdf(ordenId) {
  const orden = await ordenesRepo.getOrdenById(ordenId);
  if (!orden) {
    return { success: false, notFound: true, error: 'Orden no encontrada' };
  }

  const resultadoPdf = await generarYSubirPdf(orden);
  if (!resultadoPdf.ok) {
    return { success: false, error: resultadoPdf.error || 'No se pudo generar el PDF' };
  }

  await ordenesRepo.eliminarFotosPorTipo(orden.id, 'pdf');
  await ordenesRepo.agregarFoto(orden.id, {
    tipo: 'pdf', r2Key: resultadoPdf.pdfKey, contentType: 'application/pdf', ordenIndex: 0,
  });

  return {
    success: true,
    data: { pdfUrl: resultadoPdf.pdfUrl, pdfGenerado: true, numeroOrden: orden.numero_orden_display },
  };
}
