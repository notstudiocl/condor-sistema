import { openDB } from 'idb';

const DB_NAME = 'condor-offline-db';
const DB_VERSION = 1;
const STORE_NAME = 'pending-orders';

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
  await db.add(STORE_NAME, {
    timestamp: new Date().toISOString(),
    data,
    status: 'pending',
    retries: 0,
  });
}

export async function getPendingOrders() {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME);
  return all.filter((order) => order.status === 'pending' || order.status === 'error');
}

export async function updateOrderStatus(id, status, retries) {
  const db = await getDB();
  const order = await db.get(STORE_NAME, id);
  if (order) {
    order.status = status;
    if (retries !== undefined) order.retries = retries;
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
