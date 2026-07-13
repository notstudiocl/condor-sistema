// Utilidades de limpieza compartidas por el ETL. Ver auditoría en el plan de migración
// (sección "Realidad de los datos") — estos helpers existen porque los datos reales
// de Airtable tienen espacios sobrantes, teléfonos placeholder y RUTs duplicados.

// TRIM seguro: Airtable devuelve null/undefined en campos vacíos; algunos textos
// (ej. "Hora Camión Hidrojet") tienen ~50 espacios sobrantes al final.
export function cleanText(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

export function normalizarRut(rut) {
  if (!rut) return null;
  return String(rut).replace(/[.\-\s]/g, '').toLowerCase();
}

// Teléfonos placeholder detectados en la auditoría real: "111111...", "9999999999", etc.
// (10 clientes + 52 órdenes). Se limpian a NULL en vez de migrarse como si fueran reales.
export function esTelefonoPlaceholder(raw) {
  if (!raw) return false;
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return false;
  if (digits.startsWith('56') && digits.length > 9) {
    digits = digits.slice(2);
  }
  return /^1+$/.test(digits) || /^9+$/.test(digits);
}

export function cleanTelefono(raw) {
  const cleaned = cleanText(raw);
  if (!cleaned) return null;
  if (esTelefonoPlaceholder(cleaned)) return null;
  return cleaned;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function cleanUuid(value) {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  return UUID_RE.test(cleaned) ? cleaned : null;
}

// Marcas combinantes (acentos) que quedan sueltas tras normalize('NFD'), rango
// ̀-ͯ escrito como escape explícito para no depender de caracteres
// invisibles literales en el archivo fuente.
const DIACRITICS_RE = /[̀-ͯ]/g;

export function slugify(value, maxLen = 60) {
  const base = (value || 'archivo')
    .toString()
    .normalize('NFD')
    .replace(DIACRITICS_RE, '') // quita tildes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const trimmed = (base || 'archivo').slice(0, maxLen).replace(/-+$/g, '');
  return trimmed || 'archivo';
}

export function extFromContentType(contentType, fallbackFilename) {
  const map = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'application/pdf': 'pdf',
  };
  if (contentType && map[contentType.toLowerCase()]) return map[contentType.toLowerCase()];
  if (fallbackFilename) {
    const m = /\.([a-zA-Z0-9]+)$/.exec(fallbackFilename);
    if (m) return m[1].toLowerCase();
  }
  return 'bin';
}

export function baseName(filename) {
  if (!filename) return '';
  return filename.replace(/\.[^.]+$/, '');
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
