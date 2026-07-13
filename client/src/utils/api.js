import { savePendingOrder } from './offlineStorage';

export const API_URL = import.meta.env.VITE_API_URL || 'https://clientes-condor-api.f8ihph.easypanel.host/api';

// Evento global de fallas de auth reales (401/403 por token ausente/inválido/vencido o
// empleado desactivado) — App.jsx se suscribe para: limpiar sesión y volver a
// LoginPage, SIN tocar la cola de IndexedDB ni el sessionStorage del wizard en curso.
// El kill switch de suscripción también responde 403 pero NO dispara este evento
// (no es una falla de sesión, ya tiene su propio banner vía checkSubscription).
export const authEvents = new EventTarget();

export function notifyAuthError(detail = {}) {
  authEvents.dispatchEvent(new CustomEvent('auth-error', { detail }));
}

async function request(path, options = {}) {
  const token = localStorage.getItem('condor_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // respuesta sin body JSON (ej. 502 de un proxy) — data queda null, se maneja abajo
  }

  // /auth/login nunca dispara el evento global de auth-error: un 401/403 acá es
  // simplemente "credenciales incorrectas" o "usuario inactivo" en el intento de
  // login (LoginPage ya lo muestra vía su propio catch) — no una sesión que expiró,
  // así que no debe gatillar el banner "Tu sesión expiró..." en la pantalla de login.
  if ((res.status === 401 || res.status === 403) && data?.code !== 'SUBSCRIPTION_INACTIVE' && path !== '/auth/login') {
    notifyAuthError({ status: res.status, path });
  }

  if (!res.ok || !data?.success) {
    const err = new Error(data?.error || 'Error en la solicitud');
    err.status = res.status;
    err.code = data?.code;
    throw err;
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
  return request(`/clientes/buscar?q=${encodeURIComponent(query)}`);
}

export async function getTecnicos() {
  return request('/tecnicos');
}

export async function getTecnicosPublic() {
  return request('/tecnicos-lista');
}

export async function getServicios() {
  return request('/servicios');
}

export async function crearOrden(orden) {
  // Sin conexión: directo a la cola offline, ni siquiera se intenta el fetch.
  if (!navigator.onLine) {
    await savePendingOrder(orden);
    return { success: true, offline: true };
  }

  try {
    return await request('/ordenes', {
      method: 'POST',
      body: JSON.stringify(orden),
    });
  } catch (err) {
    // Nunca perdemos la orden: sin red (TypeError de fetch), un 5xx del servidor,
    // sesión vencida (401/403) o kill switch de suscripción (403), se encola y
    // syncManager la reintenta más tarde — el técnico no tiene que rehacer el wizard
    // por un problema transitorio que no es culpa de los datos que cargó. Un 400
    // (datos inválidos) sí se propaga: eso no se arregla reintentando.
    const isNetworkFailure = err instanceof TypeError || !err.status;
    const isServerFailure = typeof err.status === 'number' && err.status >= 500;
    const isAuthOrSubscriptionFailure = err.status === 401 || err.status === 403;
    if (isNetworkFailure || isServerFailure || isAuthOrSubscriptionFailure) {
      await savePendingOrder(orden);
      return { success: true, offline: true };
    }
    throw err;
  }
}

export async function actualizarOrden(recordId, orden) {
  return request(`/ordenes/${recordId}`, {
    method: 'PUT',
    body: JSON.stringify(orden),
  });
}

export async function getOrdenes() {
  return request('/ordenes');
}

export async function getOrdenById(recordId) {
  return request(`/ordenes/${recordId}`);
}

export async function reenviarOrden(recordId) {
  return request(`/ordenes/${recordId}/reenviar`, { method: 'POST' });
}

export async function healthCheck() {
  return request('/health');
}

export async function checkSubscription() {
  return request('/subscription-status');
}
