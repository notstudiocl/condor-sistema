import { savePendingOrder } from './offlineStorage';

const API_URL = import.meta.env.VITE_API_URL || 'https://clientes-condor-api.f8ihph.easypanel.host/api';

async function request(path, options = {}) {
  const token = localStorage.getItem('condor_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Error en la solicitud');
  }

  return data;
}

export async function login(email, pin) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, pin }),
  });
}

export async function buscarClientes(query) {
  const baseUrl = (import.meta.env.VITE_API_URL || 'https://clientes-condor-api.f8ihph.easypanel.host/api').replace(/\/api\/?$/, '');
  const res = await fetch(`${baseUrl}/api/clientes/buscar?q=${encodeURIComponent(query)}`);
  return res.json();
}

export async function getTecnicos() {
  return request('/tecnicos');
}

export async function getTecnicosPublic() {
  const baseUrl = (import.meta.env.VITE_API_URL || 'https://clientes-condor-api.f8ihph.easypanel.host/api').replace(/\/api\/?$/, '');
  const res = await fetch(`${baseUrl}/api/tecnicos-lista`);
  return res.json();
}

export async function crearOrden(orden) {
  // If offline, save to IndexedDB directly
  if (!navigator.onLine) {
    await savePendingOrder(orden);
    return { success: true, offline: true };
  }

  const baseUrl = (import.meta.env.VITE_API_URL || 'https://clientes-condor-api.f8ihph.easypanel.host/api').replace(/\/api\/?$/, '');

  // Online: send to webhook via backend (no auth needed)
  try {
    const res = await fetch(`${baseUrl}/api/ordenes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orden),
    });
    return await res.json();
  } catch (err) {
    if (err instanceof TypeError || err.message?.includes('fetch') || err.message?.includes('network') || err.message?.includes('Failed')) {
      await savePendingOrder(orden);
      return { success: true, offline: true };
    }
    throw err;
  }
}

export async function healthCheck() {
  return request('/health');
}

export async function getOrdenes() {
  const baseUrl = (import.meta.env.VITE_API_URL || 'https://clientes-condor-api.f8ihph.easypanel.host/api').replace(/\/api\/?$/, '');
  const res = await fetch(`${baseUrl}/api/ordenes`);
  return res.json();
}

export async function actualizarOrden(recordId, orden) {
  const baseUrl = (import.meta.env.VITE_API_URL || 'https://clientes-condor-api.f8ihph.easypanel.host/api').replace(/\/api\/?$/, '');
  const res = await fetch(`${baseUrl}/api/ordenes/${recordId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orden),
  });
  return res.json();
}
