import { getPendingOrders, updateOrderStatus, deleteSentOrders, getPendingCount, resetStuckSendingOrders } from './offlineStorage';
import { API_URL, notifyAuthError } from './api';

export const MAX_RETRIES = 5;

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

  // Zombies: 'sending' colgado hace >2 min (proceso murió a mitad de un envío) vuelve a 'pending'.
  await resetStuckSendingOrders();

  const pending = await getPendingOrders();
  // 'auth-required' se salta en el ciclo automático — no consume reintentos ni red
  // hasta un re-login exitoso (resumeAfterReauth) o un reintento manual del técnico.
  const attemptable = pending.filter((o) => o.status !== 'auth-required');

  if (attemptable.length === 0) {
    syncing = false;
    if (pending.length > 0) notifyStatus('auth-required', { count: pending.length });
    return;
  }

  notifyStatus('syncing', { count: attemptable.length });
  let sentCount = 0;

  for (const order of attemptable) {
    if ((order.retries || 0) >= MAX_RETRIES) continue;

    try {
      await updateOrderStatus(order.id, 'sending');
      const token = getToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/ordenes`, {
        method: 'POST',
        headers,
        body: JSON.stringify(order.data),
      });

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
        await updateOrderStatus(order.id, 'auth-required');
        if (body?.code !== 'SUBSCRIPTION_INACTIVE') {
          notifyAuthError({ status: res.status, source: 'sync' });
        }
        continue;
      }

      // Exige res.ok Y body.success — antes solo miraba res.ok, lo que podía marcar
      // 'sent' (y borrar de IndexedDB) una respuesta 200 con success:false.
      if (res.ok && body?.success) {
        await updateOrderStatus(order.id, 'sent');
        sentCount++;
      } else {
        await updateOrderStatus(order.id, 'error', (order.retries || 0) + 1);
        await sleep(Math.pow(2, order.retries || 0) * 1000);
      }
    } catch {
      // Fallo de red real (fetch nunca llegó al servidor) — sí cuenta contra MAX_RETRIES.
      await updateOrderStatus(order.id, 'error', (order.retries || 0) + 1);
      await sleep(Math.pow(2, order.retries || 0) * 1000);
    }
  }

  await deleteSentOrders();
  syncing = false;

  const remaining = await getPendingCount();
  if (sentCount > 0) {
    notifyStatus('synced', { count: sentCount });
  } else if (remaining > 0) {
    notifyStatus('offline', { count: remaining });
  } else {
    notifyStatus('online');
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
