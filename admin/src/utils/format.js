/** Formatea un RUT chileno: 12345678-9 → 12.345.678-9 */
export function formatRut(value) {
  if (!value) return '—';
  let clean = String(value).replace(/[^0-9kK-]/g, '').replace(/-/g, '');
  if (clean.length < 2) return clean;
  const dv = clean.slice(-1);
  let body = clean.slice(0, -1);
  body = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${body}-${dv}`;
}

/** Formatea un monto en CLP con separador de miles: 350000 → $350.000 */
export function formatCLP(amount) {
  if (amount === null || amount === undefined || amount === '') return '$0';
  const num = typeof amount === 'string' ? parseFloat(amount.replace(/[^0-9.-]/g, '')) : amount;
  if (isNaN(num)) return '$0';
  return '$' + Math.round(num).toLocaleString('es-CL');
}

/** ISO/Date → DD/MM/YYYY en zona horaria Chile */
export function formatFecha(value) {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('es-CL', {
      timeZone: 'America/Santiago',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return String(value);
  }
}

/** ISO/Date → HH:MM en zona horaria Chile */
export function formatHora(value) {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleTimeString('es-CL', {
      timeZone: 'America/Santiago',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return String(value);
  }
}

/** ISO/Date → DD/MM/YYYY HH:MM en zona horaria Chile */
export function formatFechaHora(value) {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString('es-CL', {
      timeZone: 'America/Santiago',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return String(value);
  }
}

/** Duración legible entre dos horas; string vacío si el rango es inválido (hora_termino < hora_inicio, casos reales en los datos históricos) */
export function formatDuracion(inicio, termino) {
  if (!inicio || !termino) return '—';
  const a = new Date(inicio).getTime();
  const b = new Date(termino).getTime();
  if (isNaN(a) || isNaN(b) || b <= a) return '—';
  const minutos = Math.round((b - a) / 60000);
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function iniciales(nombre) {
  if (!nombre) return '?';
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}
