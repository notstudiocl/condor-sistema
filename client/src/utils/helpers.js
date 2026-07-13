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
 * Formatea un monto en CLP con separador de miles: 350000 → $350.000, -5000 → -$5.000
 * (antes un monto negativo daba "$-5.000" — el signo quedaba después del símbolo).
 */
export function formatCLP(amount) {
  if (!amount && amount !== 0) return '';
  const num = typeof amount === 'string' ? parseInt(amount.replace(/[^\d-]/g, ''), 10) : amount;
  if (isNaN(num)) return '';
  const signo = num < 0 ? '-' : '';
  return signo + '$' + Math.abs(num).toLocaleString('es-CL');
}

/**
 * Parsea un string CLP a número: $350.000 → 350000, -$5.000 → -5000
 * (antes .replace(/\D/g,'') borraba el signo "-" junto con los puntos, perdiéndolo).
 */
export function parseCLP(str) {
  if (!str) return 0;
  const negativo = /^\s*-/.test(str);
  const digitos = parseInt(str.replace(/\D/g, ''), 10) || 0;
  return negativo ? -digitos : digitos;
}

/**
 * Genera la fecha de hoy en formato YYYY-MM-DD, en hora de Chile (America/Santiago).
 * NO usar new Date().toISOString() acá: eso da la fecha en UTC, que retrocede al día
 * SIGUIENTE para cualquier orden cerrada de noche en Chile — bug real corregido
 * (una orden cerrada a las 21:00 quedaba fechada para "mañana").
 */
export function todayISO() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Convierte un timestamp ISO con hora real (ej. horaInicio/horaTermino) al string que
 * espera un <input type="datetime-local">, en hora de Chile. Un ISO con "Z" o
 * milisegundos no es un valor válido de datetime-local — el navegador simplemente
 * mostraba el campo vacío al editar una orden existente (bug real corregido).
 */
export function toDatetimeLocal(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/**
 * Genera la fecha de hoy en formato legible DD/MM/YYYY
 */
export function todayFormatted() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Comprime una imagen File/Blob a JPEG con calidad reducida y tamaño máximo.
 * @param {File} file - Archivo de imagen original
 * @param {number} maxWidth - Ancho máximo en px (default 1280)
 * @param {number} quality - Calidad JPEG 0-1 (default 0.55)
 * @param {number} maxHeight - Alto máximo en px (default 1280)
 * @returns {Promise<File>} - Archivo comprimido
 */
export function compressImage(file, maxWidth = 1280, quality = 0.55, maxHeight = 1280) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return resolve(file);
    }

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Error al comprimir imagen'));
          const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          resolve(compressed);
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}

/**
 * Convierte un File/Blob a base64 data URL
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Convierte un base64 data URL a File
 */
export function base64ToFile(base64, filename) {
  const arr = base64.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new File([u8arr], filename, { type: mime });
}

/**
 * Formatea una fecha a DD/MM/YYYY. `orden.fecha` es una columna `date` de Postgres
 * (sin hora asociada) — convertirla a través de una zona horaria puede retroceder un
 * día completo (bug real corregido: TODAS las órdenes se mostraban con la fecha de
 * ayer). Un string "YYYY-MM-DD" puro se parsea directo, sin pasar por Date/timezone.
 * Strings con hora (formato legado) siguen convirtiéndose a hora de Chile.
 */
export function formatFechaAmigable(isoString) {
  if (!isoString) return '—';
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoString)) {
      const [y, m, d] = isoString.split('-');
      return `${d}/${m}/${y}`;
    }
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
