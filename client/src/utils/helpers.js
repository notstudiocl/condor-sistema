/**
 * Formatea un RUT chileno: 12345678-9 → 12.345.678-9
 */
export function formatRut(value) {
  let clean = value.replace(/[^0-9kK-]/g, '');
  clean = clean.replace(/-/g, '');

  if (clean.length < 2) return clean;

  const dv = clean.slice(-1);
  let body = clean.slice(0, -1);

  body = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${body}-${dv}`;
}

/**
 * Formatea un monto en CLP con separador de miles: 350000 → $350.000
 */
export function formatCLP(amount) {
  if (!amount && amount !== 0) return '';
  const num = typeof amount === 'string' ? parseInt(amount.replace(/\D/g, ''), 10) : amount;
  if (isNaN(num)) return '';
  return '$' + num.toLocaleString('es-CL');
}

/**
 * Parsea un string CLP a número: $350.000 → 350000
 */
export function parseCLP(str) {
  if (!str) return 0;
  return parseInt(str.replace(/\D/g, ''), 10) || 0;
}

/**
 * Genera la fecha de hoy en formato YYYY-MM-DD
 */
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Genera la fecha de hoy en formato legible DD/MM/YYYY
 */
export function todayFormatted() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Formatea una fecha ISO a DD/MM/YYYY en zona horaria Chile
 */
export function formatFechaAmigable(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('es-CL', {
      timeZone: 'America/Santiago',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch (e) { return isoString; }
}

/**
 * Formatea una fecha ISO a HH:MM en zona horaria Chile
 */
export function formatHoraAmigable(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleTimeString('es-CL', {
      timeZone: 'America/Santiago',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch (e) { return isoString; }
}

/**
 * Formatea una fecha ISO a DD/MM/YYYY HH:MM en zona horaria Chile
 */
export function formatFechaHoraAmigable(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('es-CL', {
      timeZone: 'America/Santiago',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch (e) { return isoString; }
}
