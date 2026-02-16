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
  return request(`/clientes/buscar?q=${encodeURIComponent(query)}`);
}

export async function getTecnicos() {
  return request('/tecnicos');
}

export async function crearOrden(orden) {
  return request('/ordenes', {
    method: 'POST',
    body: JSON.stringify(orden),
  });
}

export async function healthCheck() {
  return request('/health');
}
