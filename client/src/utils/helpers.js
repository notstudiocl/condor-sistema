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
 * Comprime una imagen File/Blob a JPEG con calidad reducida y tamaño máximo.
 * @param {File} file - Archivo de imagen original
 * @param {number} maxWidth - Ancho máximo en px (default 1920)
 * @param {number} quality - Calidad JPEG 0-1 (default 0.7)
 * @returns {Promise<File>} - Archivo comprimido
 */
export function compressImage(file, maxWidth = 1920, quality = 0.7) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return resolve(file);
    }

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
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
