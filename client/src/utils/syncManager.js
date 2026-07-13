import { getPendingOrders, updateOrderStatus, deleteSentOrders, getPendingCount, resetStuckSendingOrders } from './offlineStorage';
import { API_URL, notifyAuthError } from './api';

export const MAX_RETRIES = 5;

// Timeout del fetch de sync en background — un poco por encima del timeout global
// de 30s del propio backend (ver server/src/index.js), para no abortar una request
// que el servidor sí iba a responder a tiempo. Sin esto, un fetch colgado por mala
// señal bloqueaba el loop indefinidamente y ampliaba la ventana de la race de
// idempotencia (dos intentos del mismo idempotencyKey solapados).
const SYNC_FETCH_TIMEOUT_MS = 35000;

// Único mecanismo de sincronización de la app (App.jsx NO debe tener su propio
// listener 'online' ni su propio POST /api/ordenes — ver App.jsx). Múltiples
// suscriptores (OfflineIndicator, App.jsx, el panel de "Pendientes") escuchan acá
// en vez de que cada uno registre sus propios listeners de red.
export const syncEvents = new EventTarget();

let syncing = false;

function getToken() {
  return localStorage.getItem('condor_token') || null;
}

function notifyStatus(status, detail = {}) {
  syncEvents.dispatchEvent(new CustomEvent('status', { detail: { status, ...detail } }));
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function syncPendingOrders() {
  if (syncing || !navigator.onLine) return;
  syncing = true;

  // Todo el cuerpo va en try/finally: si resetStuckSendingOrders()/getPendingOrders()
  // (o cualquier operación de IndexedDB) lanza (Safari privado, cuota, storage
  // presionado), `syncing` quedaba en `true` para siempre y ningún sync automático
  // futuro volvía a correr en esa pestaña, sin ningún aviso — bug real corregido acá.
  try {
    // Zombies: 'sending' colgado hace >2 min (proceso murió a mitad de un envío) vuelve a 'pending'.
    await resetStuckSendingOrders();

    const pending = await getPendingOrders();
    // 'auth-required' se salta en el ciclo automático — no consume reintentos ni red
    // hasta un re-login exitoso (resumeAfterReauth) o un reintento manual del técnico.
    const attemptable = pending.filter((o) => o.status !== 'auth-required');

    if (attemptable.length === 0) {
      if (pending.length > 0) notifyStatus('auth-required', { count: pending.length });
      return;
    }

    notifyStatus('syncing', { count: attemptable.length });
    let sentCount = 0;
    let incompleteCount = 0;

    for (const order of attemptable) {
      if ((order.retries || 0) >= MAX_RETRIES) continue;

      try {
        await updateOrderStatus(order.id, 'sending');
        const token = getToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), SYNC_FETCH_TIMEOUT_MS);
        let res;
        try {
          res = await fetch(`${API_URL}/ordenes`, {
            method: 'POST',
            headers,
            body: JSON.stringify(order.data),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }

        let body = null;
        try {
          body = await res.json();
        } catch {
          // sin body JSON — se trata como fallo genérico abajo
        }

        if (res.status === 401 || res.status === 403) {
          // Nunca consume reintentos (corrección de resiliencia #2). El kill switch de
          // suscripción también cae acá (también 403) pero no dispara el banner de
          // "vuelve a iniciar sesión" — ya tiene su propio aviso.
          await updateOrderStatus(order.id, 'auth-required', undefined, { code: body?.code });
          if (body?.code !== 'SUBSCRIPTION_INACTIVE') {
            notifyAuthError({ status: res.status, source: 'sync' });
          }
          continue;
        }

        // "Sigue siendo procesada" (misma idempotencyKey en vuelo en otro request
        // concurrente): NO es un éxito confirmado — recordId viene null a propósito.
        // Tratarlo como éxito y borrar la orden local (bug real corregido) podía
        // perder la orden completa si el request "ganador" fallaba después. Se
        // reintenta con backoff como cualquier otro fallo transitorio.
        const sigueEnProceso = body?.data?.duplicate === true && body?.data?.recordId == null;

        if (res.ok && body?.success && !sigueEnProceso) {
          if (body?.data?.fotosOk === false) {
            // La orden SÍ se creó en el servidor pero alguna foto no se subió —
            // nunca fingir éxito total ni borrarla en silencio (bug real corregido).
            // Queda visible en el panel de pendientes como "fotos incompletas" hasta
            // que el técnico la reconozca manualmente.
            await updateOrderStatus(order.id, 'sent-incomplete', undefined, {
              recordId: body?.data?.recordId,
              numeroOrden: body?.data?.webhookData?.numeroOrden,
            });
            incompleteCount++;
          } else {
            await updateOrderStatus(order.id, 'sent');
            sentCount++;
          }
        } else {
          await updateOrderStatus(order.id, 'error', (order.retries || 0) + 1);
          await sleep(Math.pow(2, order.retries || 0) * 1000);
        }
      } catch {
        // Fallo de red real (fetch nunca llegó al servidor, o abortó por timeout) —
        // sí cuenta contra MAX_RETRIES.
        await updateOrderStatus(order.id, 'error', (order.retries || 0) + 1);
        await sleep(Math.pow(2, order.retries || 0) * 1000);
      }
    }

    await deleteSentOrders();

    const remaining = await getPendingCount();
    if (incompleteCount > 0) {
      notifyStatus('fotos-incompletas', { count: incompleteCount });
    } else if (sentCount > 0) {
      notifyStatus('synced', { count: sentCount });
    } else if (remaining > 0) {
      notifyStatus('offline', { count: remaining });
    } else {
      notifyStatus('online');
    }
  } finally {
    syncing = false;
  }
}

export function getConnectionStatus() {
  return navigator.onLine ? 'online' : 'offline';
}

// Se llama una sola vez (OfflineIndicator, montado en la raíz de App) — registra los
// ÚNICOS listeners 'online'/'offline' de toda la app.
export function initSyncManager() {
  window.addEventListener('online', () => {
    notifyStatus('online');
    syncPendingOrders();
  });

  window.addEventListener('offline', async () => {
    notifyStatus('offline', { count: await getPendingCount() });
  });

  if (navigator.onLine) {
    syncPendingOrders();
  }
}

// Tras un re-login exitoso: libera las órdenes bloqueadas por 401/403 (vuelven a
// 'pending') y dispara un sync inmediato. App.jsx llama esto al recibir el evento
// global de auth-error seguido de un login exitoso.
export async function resumeAfterReauth() {
  const pending = await getPendingOrders();
  await Promise.all(
    pending.filter((o) => o.status === 'auth-required').map((o) => updateOrderStatus(o.id, 'pending'))
  );
  if (navigator.onLine) syncPendingOrders();
}
