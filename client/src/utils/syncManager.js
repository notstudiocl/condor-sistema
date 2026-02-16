import { getPendingOrders, updateOrderStatus, deleteSentOrders, getPendingCount } from './offlineStorage';

const API_URL = import.meta.env.VITE_API_URL || 'https://clientes-condor-api.f8ihph.easypanel.host/api';
const MAX_RETRIES = 5;

let statusCallback = null;
let syncing = false;

function getToken() {
  return localStorage.getItem('condor_token') || null;
}

function notifyStatus(status, detail = {}) {
  if (statusCallback) statusCallback({ status, ...detail });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function syncPendingOrders() {
  if (syncing || !navigator.onLine) return;
  syncing = true;

  const pending = await getPendingOrders();
  if (pending.length === 0) { syncing = false; return; }

  notifyStatus('syncing', { count: pending.length });
  let sentCount = 0;

  for (const order of pending) {
    if (order.retries >= MAX_RETRIES) continue;

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

      if (res.ok) {
        await updateOrderStatus(order.id, 'sent');
        sentCount++;
      } else {
        await updateOrderStatus(order.id, 'error', order.retries + 1);
        await sleep(Math.pow(2, order.retries) * 1000);
      }
    } catch {
      await updateOrderStatus(order.id, 'error', order.retries + 1);
      await sleep(Math.pow(2, order.retries) * 1000);
    }
  }

  await deleteSentOrders();
  syncing = false;

  if (sentCount > 0) {
    notifyStatus('synced', { count: sentCount });
  } else {
    const remaining = await getPendingCount();
    if (remaining > 0) notifyStatus('offline', { count: remaining });
    else notifyStatus('online');
  }
}

export function getConnectionStatus() {
  return navigator.onLine ? 'online' : 'offline';
}

export function initSyncManager(callback) {
  statusCallback = callback;

  window.addEventListener('online', () => {
    notifyStatus('online');
    syncPendingOrders();
  });

  window.addEventListener('offline', async () => {
    const count = await getPendingCount();
    notifyStatus('offline', { count });
  });

  // Sync on init if there are pending orders
  if (navigator.onLine) {
    syncPendingOrders();
  }
}
