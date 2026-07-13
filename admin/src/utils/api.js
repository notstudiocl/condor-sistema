import { TOKEN_KEY, clearSession } from './auth';

export const API_URL = import.meta.env.VITE_API_URL || 'https://clientes-condor-api.f8ihph.easypanel.host/api';

// El shell (App.jsx) registra acá cómo reaccionar a un 401: limpiar el estado
// de React y navegar a /login. Si nadie se registró (llamadas muy tempranas,
// tests, etc.) cae a un fallback duro por hash.
let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

/**
 * Wrapper único de fetch para toda la app admin.
 * Interceptor global de 401: limpia la sesión y redirige a login SIEMPRE,
 * sin importar qué pantalla hizo el request ni si el caller atrapa el error.
 */
async function request(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch (err) {
    throw new Error('No se pudo conectar con el servidor. Verifica tu conexión.');
  }

  if (res.status === 401) {
    clearSession();
    if (onUnauthorized) {
      onUnauthorized();
    } else {
      window.location.hash = '#/login';
    }
    throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // Respuesta sin cuerpo JSON (204, etc.)
  }

  if (!res.ok || (data && data.success === false)) {
    throw new Error((data && data.error) || `Error ${res.status} al comunicarse con el servidor`);
  }

  return data;
}

function qs(params = {}) {
  const clean = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (clean.length === 0) return '';
  return '?' + clean.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

export async function loginAdmin(email, password) {
  return request('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

// ---- Dashboard ----
export const getDashboardKpis = () => request('/admin/dashboard/kpis');

// ---- Órdenes ----
export const listOrdenes = (params) => request(`/admin/ordenes${qs(params)}`);
export const getOrden = (id) => request(`/admin/ordenes/${id}`);
export const getNotificacionesOrden = (id) => request(`/admin/ordenes/${id}/notificaciones`);
export const reenviarOrden = (id) => request(`/admin/ordenes/${id}/reenviar`, { method: 'POST' });
export const cambiarEstadoOrden = (id, estado) =>
  request(`/admin/ordenes/${id}/estado`, { method: 'PATCH', body: JSON.stringify({ estado }) });
export const cambiarEstadoOrdenesMasivo = (ids, estado) =>
  request('/admin/ordenes/estado-masivo', { method: 'PATCH', body: JSON.stringify({ ids, estado }) });

// ---- Clientes ----
export const listClientes = () => request('/admin/clientes');
export const listClientesDuplicados = () => request('/admin/clientes/duplicados');
export const getCliente = (id) => request(`/admin/clientes/${id}`);
export const getOrdenesCliente = (id) => request(`/admin/clientes/${id}/ordenes`);
export const crearCliente = (data) => request('/admin/clientes', { method: 'POST', body: JSON.stringify(data) });
export const actualizarCliente = (id, data) =>
  request(`/admin/clientes/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const fusionarClientes = (ganadorId, perdedorId, camposResultado) =>
  request('/admin/clientes/fusionar', {
    method: 'POST',
    body: JSON.stringify({ ganadorId, perdedorId, camposResultado }),
  });

// ---- Empleados (técnicos) ----
export const listEmpleados = () => request('/admin/empleados');
export const getEmpleado = (id) => request(`/admin/empleados/${id}`);
export const crearEmpleado = (data) => request('/admin/empleados', { method: 'POST', body: JSON.stringify(data) });
export const actualizarEmpleado = (id, data) =>
  request(`/admin/empleados/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const resetPinEmpleado = (id) => request(`/admin/empleados/${id}/reset-pin`, { method: 'POST' });

// ---- Servicios ----
export const listServicios = () => request('/admin/servicios');
export const crearServicio = (nombre) =>
  request('/admin/servicios', { method: 'POST', body: JSON.stringify({ nombre }) });
export const actualizarServicio = (id, data) =>
  request(`/admin/servicios/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const eliminarServicio = (id) => request(`/admin/servicios/${id}`, { method: 'DELETE' });

// ---- Notificaciones (canales + historial) ----
export const listCanalesNotificacion = () => request('/admin/notificaciones');
export const getCanalNotificacion = (canal) => request(`/admin/notificaciones/${canal}`);
export const actualizarCanalNotificacion = (canal, data) =>
  request(`/admin/notificaciones/${canal}`, { method: 'PUT', body: JSON.stringify(data) });
export const probarCanalNotificacion = (canal, body) =>
  request(`/admin/notificaciones/${canal}/test`, { method: 'POST', body: JSON.stringify(body || {}) });
export const listNotificacionesLog = (params) => request(`/admin/notificaciones/log${qs(params)}`);

// ---- Plantillas ----
export const listPlantillas = () => request('/admin/plantillas');
export const getPlantilla = (key) => request(`/admin/plantillas/${key}`);
export const guardarPlantilla = (key, data) =>
  request(`/admin/plantillas/${key}`, { method: 'PUT', body: JSON.stringify(data) });
export const restaurarPlantilla = (key) => request(`/admin/plantillas/${key}`, { method: 'DELETE' });
export const previsualizarPlantilla = (templateKey, ordenId) =>
  request('/admin/plantillas/preview', { method: 'POST', body: JSON.stringify({ templateKey, ordenId }) });
export const enviarPruebaPlantilla = (templateKey, ordenId, destinatario) =>
  request('/admin/plantillas/enviar-prueba', {
    method: 'POST',
    body: JSON.stringify({ templateKey, ordenId, destinatario }),
  });

// ---- Configuración (kill switch de suscripción) ----
export const getSubscriptionStatus = () => request('/admin/settings/subscription');
export const setSubscriptionStatus = (active, message) =>
  request('/admin/settings/subscription', { method: 'PUT', body: JSON.stringify({ active, message }) });

// ---- Usuarios del admin ----
export const listUsuarios = () => request('/admin/usuarios');
export const crearUsuario = (data) => request('/admin/usuarios', { method: 'POST', body: JSON.stringify(data) });
export const actualizarUsuario = (id, data) =>
  request(`/admin/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const resetPasswordUsuario = (id) => request(`/admin/usuarios/${id}/reset-password`, { method: 'POST' });
export const eliminarUsuario = (id) => request(`/admin/usuarios/${id}`, { method: 'DELETE' });

export { request };
export default request;
