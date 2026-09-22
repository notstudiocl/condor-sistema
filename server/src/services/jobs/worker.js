import * as jobsRepo from '../../repositories/jobsRepo.js';
import { completarOrdenPendiente } from '../ordenService.js';
import { enviarAlertaNotstudio } from '../notifications/alertas.js';

// Worker in-process (mismo diseño que hya-sistema): polling cada 5 s, un job a la vez, backoff
// en jobsRepo. Tipos:
//   completar_orden  { ordenId }  -> genera el PDF y manda las notificaciones de una orden que
//                                    quedó sin PDF porque Gotenberg/R2/n8n fallaron en línea.
//   alerta_notstudio { mensaje }  -> aviso por Telegram al equipo de NotStudio.
const HANDLERS = {
  completar_orden: (payload) => completarOrdenPendiente(Number(payload.ordenId)),
  alerta_notstudio: (payload) => enviarAlertaNotstudio(payload.mensaje),
};

const POLL_INTERVAL_MS = 5000;
let intervalId = null;
let ticking = false;

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const r = await jobsRepo.reclamarSiguiente(async (job) => {
      const handler = HANDLERS[job.tipo];
      if (!handler) throw new Error(`handler desconocido: ${job.tipo}`);
      return handler(job.payload || {});
    });
    if (r?.estado === 'error' && r.definitivo && r.job.tipo !== 'alerta_notstudio') {
      // Si el que falló es la propia alerta, no se reencola: evita un loop con Telegram caído.
      await jobsRepo.encolar('alerta_notstudio', {
        mensaje: `Job #${r.job.id} (${r.job.tipo}) agotó ${r.job.max_intentos} reintentos.\nOrden: ${r.job.payload?.ordenId ?? '-'}\nÚltimo error: ${r.error}`,
      }).catch((err) => console.error('[jobs] no se pudo encolar alerta:', err.message));
    }
  } catch (err) {
    console.error('[jobs] error inesperado en el tick:', err?.message || err);
  } finally {
    ticking = false;
  }
}

export function startJobWorker() {
  if (intervalId) return intervalId;
  intervalId = setInterval(tick, POLL_INTERVAL_MS);
  if (typeof intervalId.unref === 'function') intervalId.unref();
  console.log('[jobs] worker iniciado (poll cada 5 s)');
  return intervalId;
}

export function stopJobWorker() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
}
