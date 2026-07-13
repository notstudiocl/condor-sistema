import { openDB } from 'idb';

const DB_NAME = 'condor-offline-db';
const DB_VERSION = 1;
const STORE_NAME = 'pending-orders';
const SENDING_TIMEOUT_MS = 2 * 60 * 1000; // ver resetStuckSendingOrders

function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    },
  });
}

export async function savePendingOrder(data) {
  const db = await getDB();
  const now = new Date().toISOString();
  await db.add(STORE_NAME, {
    timestamp: now,
    updatedAt: now,
    data,
    status: 'pending',
    retries: 0,
  });
}

// 'auth-required': orden bloqueada por 401/403 (sesión vencida o kill switch) — sigue
// visible/reintentable, pero el loop automático de syncManager la salta hasta que haya
// un re-login exitoso o el técnico la reintente a mano (ver OfflineIndicator.jsx).
export async function getPendingOrders() {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME);
  return all.filter((order) => order.status === 'pending' || order.status === 'error' || order.status === 'auth-required');
}

export async function updateOrderStatus(id, status, retries) {
  const db = await getDB();
  const order = await db.get(STORE_NAME, id);
  if (order) {
    order.status = status;
    if (retries !== undefined) order.retries = retries;
    order.updatedAt = new Date().toISOString();
    await db.put(STORE_NAME, order);
  }
}

export async function deleteSentOrders() {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME);
  const tx = db.transaction(STORE_NAME, 'readwrite');
  for (const order of all) {
    if (order.status === 'sent') {
      await tx.store.delete(order.id);
    }
  }
  await tx.done;
}

export async function getPendingCount() {
  const orders = await getPendingOrders();
  return orders.length;
}

// Bug de zombies: si el proceso muere (app cerrada, red cortada) justo entre marcar
// 'sending' y recibir la respuesta, la orden queda 'sending' para siempre y
// getPendingOrders() deja de devolverla — invisible, nunca más se reintenta. Al
// arrancar cada sync se resetean a 'pending' las que llevan >2 min en 'sending'.
export async function resetStuckSendingOrders() {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME);
  const now = Date.now();
  for (const order of all) {
    if (order.status !== 'sending') continue;
    const lastUpdate = new Date(order.updatedAt || order.timestamp).getTime();
    if (now - lastUpdate > SENDING_TIMEOUT_MS) {
      order.status = 'pending';
      order.updatedAt = new Date().toISOString();
      await db.put(STORE_NAME, order);
    }
  }
}
