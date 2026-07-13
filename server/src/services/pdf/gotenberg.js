// Puerto del node "HTTP Request - Gotenberg" del flujo n8n original: mismo shape de
// multipart (marginTop/Bottom/Left/Right=0in, preferCssPageSize=true, pdfFormat=PDF/A-3b),
// mismo nombre de archivo 'index.html' para el campo `files`.
//
// Corrección de resiliencia del plan (#6): nunca un paso síncrono sin timeout —
// AbortController a ~15s. Si Gotenberg no responde a tiempo, quien llama debe
// degradar (orden queda 'Enviada' sin PDF), nunca reventar con 500.

const GOTENBERG_TIMEOUT_MS = 15000;

/**
 * Convierte HTML a PDF vía Gotenberg. Devuelve un Buffer con el PDF.
 * Lanza si Gotenberg responde error o si se agota el timeout — el caller decide
 * cómo degradar (ver ordenService.createOrdenCompleta).
 */
export async function renderPdf(html) {
  const gotenbergUrl = process.env.GOTENBERG_URL;
  if (!gotenbergUrl) throw new Error('GOTENBERG_URL no está definida');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOTENBERG_TIMEOUT_MS);

  try {
    const form = new FormData();
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
    form.append('marginTop', '0in');
    form.append('marginBottom', '0in');
    form.append('marginLeft', '0in');
    form.append('marginRight', '0in');
    form.append('preferCssPageSize', 'true');
    form.append('pdfFormat', 'PDF/A-3b');

    const url = `${gotenbergUrl.replace(/\/+$/, '')}/forms/chromium/convert/html`;
    const response = await fetch(url, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Gotenberg respondió ${response.status}: ${text.slice(0, 300)}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length === 0) throw new Error('Gotenberg devolvió un PDF vacío');
    return buffer;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Gotenberg no respondió en ${GOTENBERG_TIMEOUT_MS}ms (timeout)`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
