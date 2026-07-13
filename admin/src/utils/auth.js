// Sesión del admin panel. Token JWT decodificado a mano (sin librería jwt-decode):
// basta con JSON.parse(atob(token.split('.')[1])) — el payload trae { id, email, nombre, rol, exp }.

export const TOKEN_KEY = 'condor_admin_token';
export const USER_KEY = 'condor_admin_user';

/**
 * Decodifica el payload de un JWT sin verificar la firma (solo lectura en cliente).
 * Soporta base64url (reemplaza -_ por +/ y agrega el padding que atob necesita).
 */
export function decodeToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function isTokenExpired(payload) {
  if (!payload || !payload.exp) return false;
  return Date.now() >= payload.exp * 1000;
}

/**
 * Lee la sesión vigente desde localStorage. Devuelve null si no hay token,
 * el token no decodifica, o ya expiró (JWT admin dura 12h).
 */
export function getSession() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;

  const payload = decodeToken(token);
  if (!payload || isTokenExpired(payload)) {
    return null;
  }

  let user = null;
  const storedUser = localStorage.getItem(USER_KEY);
  if (storedUser) {
    try {
      user = JSON.parse(storedUser);
    } catch {
      user = null;
    }
  }
  if (!user) {
    user = { id: payload.id, email: payload.email, nombre: payload.nombre, rol: payload.rol };
  }

  return { token, user };
}

export function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/** true si el usuario tiene alguno de los roles pedidos (sin roles = acceso libre) */
export function hasRole(user, roles) {
  if (!roles || roles.length === 0) return true;
  return !!user && roles.includes(user.rol);
}

export const ROLES = {
  ADMIN: 'admin',
  OFICINA: 'oficina',
};
