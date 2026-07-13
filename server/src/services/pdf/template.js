import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildPublicUrl } from '../storage/r2.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Puerto fiel del Code node "Generar HTML" del flujo n8n original
// (n8n/Orden de trabajo condor.json, node 22e1dd03-f3e4-44e8-8faa-6c41dfe1fb89).
// El HTML/CSS resultante debe verse IDÉNTICO al PDF que generaba n8n — solo cambia
// de dónde vienen los datos ($('Webhook1')/$('Get a record') -> objeto `orden`
// hidratado por ordenesRepo.getOrdenById) y cómo se resuelve el logo (antes URL
// externa de GitHub raw, ahora base64 inline: un PDF nunca debe depender de que
// GitHub esté arriba en el momento de imprimir).

// ============================================================
// Logo embebido en base64 — cacheado en memoria (se lee 1 sola vez).
// ============================================================
let logoBase64Cache = null;

function resolveLogoPath() {
  const candidates = [
    // Dev / monorepo checkout: server/src/services/pdf -> repo root -> client/public
    join(__dirname, '..', '..', '..', '..', 'client', 'public', 'condor-logo.png'),
    // Docker: el Dockerfile copia el logo a /app/assets/condor-logo.png
    // (la imagen solo incluye server/src, no client/ — ver Dockerfile raíz)
    join(__dirname, '..', '..', '..', 'assets', 'condor-logo.png'),
  ];
  return candidates.find((p) => existsSync(p)) || null;
}

function getLogoBase64() {
  if (logoBase64Cache) return logoBase64Cache;
  const logoPath = resolveLogoPath();
  if (!logoPath) {
    throw new Error('No se encontró condor-logo.png (ni en client/public ni en assets/) para embeber en el PDF');
  }
  const buffer = readFileSync(logoPath);
  logoBase64Cache = buffer.toString('base64');
  return logoBase64Cache;
}

// ============================================================
// Helpers de formato — mismos resultados visuales que el código n8n original,
// pero robustos a que Postgres devuelva Date/timestamptz en vez de strings ISO planas.
// ============================================================

function pad2(n) {
  return String(n).padStart(2, '0');
}

// fecha: columna `date` de Postgres. Puede llegar como Date (medianoche UTC) o string 'YYYY-MM-DD'.
export function formatFecha(fecha) {
  if (!fecha) return '';
  try {
    if (typeof fecha === 'string') {
      const soloFecha = fecha.slice(0, 10); // tolera 'YYYY-MM-DD' o ISO completo
      const [y, m, d] = soloFecha.split('-');
      if (y && m && d) return `${d}/${m}/${y}`;
      return fecha;
    }
    if (fecha instanceof Date) {
      return `${pad2(fecha.getUTCDate())}/${pad2(fecha.getUTCMonth() + 1)}/${fecha.getUTCFullYear()}`;
    }
    return String(fecha);
  } catch {
    return String(fecha);
  }
}

// hora_inicio/hora_termino: timestamptz. Se muestran en horario de Chile,
// igual convención que el resto del sistema (America/Santiago, ver helpers.js del cliente).
export function formatFechaHora(dt) {
  if (!dt) return '—';
  try {
    const d = dt instanceof Date ? dt : new Date(dt);
    if (isNaN(d.getTime())) return String(dt);
    const parts = new Intl.DateTimeFormat('es-CL', {
      timeZone: 'America/Santiago',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const get = (type) => parts.find((p) => p.type === type)?.value || '';
    return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
  } catch {
    return String(dt);
  }
}

// Solo HH:MM, en horario de Chile — usado por las plantillas de notificaciones.
export function formatHora(dt) {
  if (!dt) return '—';
  try {
    const d = dt instanceof Date ? dt : new Date(dt);
    if (isNaN(d.getTime())) return '—';
    const parts = new Intl.DateTimeFormat('es-CL', {
      timeZone: 'America/Santiago',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const get = (type) => parts.find((p) => p.type === type)?.value || '';
    return `${get('hour')}:${get('minute')}`;
  } catch {
    return '—';
  }
}

export function sanitizeForFilename(str) {
  return (str || '').trim().replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, '').replace(/\s+/g, '_');
}

function sectionTitle(text) {
  return `<div style="font-size:11px;font-weight:700;color:#1e3a8a;text-transform:uppercase;letter-spacing:1.2px;padding-bottom:6px;border-bottom:2px solid #2563eb;margin-bottom:12px;">${text}</div>`;
}

function buildFotoGrid(fotos, tableWidth) {
  if (fotos.length === 0) return '';
  const rows = [];
  for (let i = 0; i < fotos.length; i += 3) {
    const chunk = fotos.slice(i, i + 3);
    let cells = chunk
      .map((f) => {
        const imgUrl = buildPublicUrl(f.r2_key);
        return `<td style="width:33.33%;padding:3px;">
      <div style="width:100%;padding-bottom:100%;position:relative;overflow:hidden;border-radius:4px;border:1px solid #e2e8f0;">
        <img src="${imgUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;" />
      </div>
    </td>`;
      })
      .join('');
    for (let j = chunk.length; j < 3; j++) cells += `<td style="width:33.33%;padding:3px;"></td>`;
    rows.push(`<tr>${cells}</tr>`);
  }
  return `<table style="width:${tableWidth};border-collapse:collapse;margin:0 auto;">${rows.join('')}</table>`;
}

/**
 * Nombre de archivo "amigable" para el PDF — igual convención que n8n:
 * OT-{numeroOrdenDisplay}_{cliente}_{supervisor}_{fecha}.pdf
 * Se usa como filename de adjunto de email y como slug para la key de R2.
 */
export function buildPdfFilename(orden) {
  const numeroOrden = orden.numero_orden_display || 'SN';
  const cliente = sanitizeForFilename(orden.cliente_empresa);
  const supervisor = sanitizeForFilename(orden.supervisor);
  const fecha = formatFecha(orden.fecha).replace(/\//g, '-');
  return `OT-${numeroOrden}_${cliente}_${supervisor}_${fecha}.pdf`;
}

/**
 * Arma el HTML completo de la Orden de Trabajo a partir del objeto `orden`
 * que devuelve ordenesRepo.getOrdenById/getOrdenByAirtableId (ya hidratado con
 * trabajos, empleados, fotos y cliente).
 */
export function buildHtml(orden) {
  const numeroOrden = orden.numero_orden_display || 'S/N';
  const fechaFormateada = formatFecha(orden.fecha);

  const clienteEmpresa = orden.cliente_empresa || '';
  const rut = orden.cliente?.rut || '';
  const email = orden.cliente_email || '';
  const telefono = orden.cliente_telefono || '';
  const direccion = orden.direccion || '';
  const comuna = orden.comuna || '';
  const ordenCompra = orden.orden_compra || '';
  const supervisor = orden.supervisor || '';
  const descripcion = orden.descripcion_trabajo || '';
  const observaciones = orden.observaciones || '';
  const patente = orden.patente_vehiculo || '';

  const trabajosConCantidad = (orden.trabajos || []).filter((t) => t.cantidad && t.cantidad > 0);
  const trabajosRows = trabajosConCantidad
    .map((t, i) => {
      const bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
      const nombre = t.servicio_nombre || t.nombre_personalizado || '';
      return `<tr style="background:${bg};"><td style="padding:6px 16px;font-size:12px;color:#1e293b;border-bottom:1px solid #e2e8f0;">${nombre}</td><td style="padding:6px 16px;font-size:12px;color:#1e3a8a;font-weight:700;text-align:center;border-bottom:1px solid #e2e8f0;width:72px;">${t.cantidad || 0}</td></tr>`;
    })
    .join('');

  const personalNames = (orden.empleados || []).map((e) => e.nombre).filter(Boolean);

  const fotos = orden.fotos || [];
  const fotosAntes = fotos.filter((f) => f.tipo === 'antes');
  const fotosDespues = fotos.filter((f) => f.tipo === 'despues');
  const firma = fotos.find((f) => f.tipo === 'firma') || null;
  const hasFotos = fotosAntes.length > 0 || fotosDespues.length > 0;

  // Fotos cuadradas 1:1 — tamaño ajustado para que quepan en la menor cantidad de páginas posible.
  const totalRows = Math.ceil(fotosAntes.length / 3) + Math.ceil(fotosDespues.length / 3);
  let tableWidth;
  if (totalRows <= 2) tableWidth = '100%';
  else if (totalRows <= 3) tableWidth = '85%';
  else tableWidth = '72%';

  const firmaHtml = firma
    ? `<img src="${buildPublicUrl(firma.r2_key)}" style="max-width:200px;max-height:72px;display:block;margin:0 auto;margin-bottom:-12px;position:relative;z-index:2;" />`
    : '';

  const logoDataUri = `data:image/png;base64,${getLogoBase64()}`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #0f172a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    background: #fff;
    margin-top: 82px;
    margin-bottom: 36px;
  }
  .hdr {
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 82px;
    background: #fff;
    z-index: 100;
  }
  .ftr {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    height: 36px;
    z-index: 100;
  }
  .no-break { page-break-inside: avoid; }
  .page-break { page-break-before: always; }
</style>
</head>
<body>

<!-- HEADER FIJO — todas las páginas -->
<div class="hdr">
  <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);height:5px;"></div>
  <div style="padding:12px 28px 10px;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #ffffff;">
    <img src="${logoDataUri}" style="height:40px;" />
    <div style="text-align:right;">
      <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:1.2px;">Orden de Trabajo</div>
      <div style="font-size:22px;font-weight:800;color:#1e3a8a;line-height:1.1;">N°${numeroOrden}</div>
      <div style="font-size:9px;color:#64748b;margin-top:2px;">${fechaFormateada}</div>
    </div>
  </div>
</div>

<!-- FOOTER FIJO — todas las páginas -->
<div class="ftr">
  <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:10px 28px;display:flex;justify-content:space-between;align-items:center;height:36px;">
    <span style="font-size:9px;color:#fff;font-weight:600;">Condor Alcantarillados</span>
    <span style="font-size:7px;color:#93c5fd;">Amunátegui N°232, Of. 1904, Santiago &bull; +56 9 9743 9183 &bull; alcantarilladoscondor@gmail.com &bull; condoralcantarillados.cl</span>
  </div>
</div>

<!-- CONTENIDO -->
<div style="padding:0 28px;">

  <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
    <tr>
      <td style="width:50%;vertical-align:top;padding-right:16px;">
        ${sectionTitle('Datos del Cliente')}
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="font-size:10px;color:#64748b;padding:4px 0;width:108px;">CLIENTE / EMPRESA</td><td style="font-size:12px;color:#0f172a;font-weight:600;padding:4px 0;">${clienteEmpresa || '—'}</td></tr>
          <tr><td style="font-size:10px;color:#64748b;padding:4px 0;">RUT</td><td style="font-size:12px;color:#0f172a;padding:4px 0;">${rut || '—'}</td></tr>
          <tr><td style="font-size:10px;color:#64748b;padding:4px 0;">SUPERVISOR</td><td style="font-size:12px;color:#0f172a;font-weight:600;padding:4px 0;">${supervisor || '—'}</td></tr>
          <tr><td style="font-size:10px;color:#64748b;padding:4px 0;">CORREO</td><td style="font-size:12px;color:#0f172a;padding:4px 0;">${email || '—'}</td></tr>
          <tr><td style="font-size:10px;color:#64748b;padding:4px 0;">TELÉFONO</td><td style="font-size:12px;color:#0f172a;padding:4px 0;">${telefono || '—'}</td></tr>
        </table>
      </td>
      <td style="width:50%;vertical-align:top;padding-left:16px;">
        ${sectionTitle('Ubicación y Horarios')}
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="font-size:10px;color:#64748b;padding:4px 0;width:108px;">DIRECCIÓN</td><td style="font-size:12px;color:#0f172a;padding:4px 0;">${direccion || '—'}</td></tr>
          <tr><td style="font-size:10px;color:#64748b;padding:4px 0;">COMUNA</td><td style="font-size:12px;color:#0f172a;padding:4px 0;">${comuna || '—'}</td></tr>
          <tr><td style="font-size:10px;color:#64748b;padding:4px 0;">HORA INICIO</td><td style="font-size:12px;color:#0f172a;font-weight:600;padding:4px 0;">${formatFechaHora(orden.hora_inicio)}</td></tr>
          <tr><td style="font-size:10px;color:#64748b;padding:4px 0;">HORA TÉRMINO</td><td style="font-size:12px;color:#0f172a;font-weight:600;padding:4px 0;">${formatFechaHora(orden.hora_termino)}</td></tr>
          <tr><td style="font-size:10px;color:#64748b;padding:4px 0;">ORDEN DE COMPRA</td><td style="font-size:12px;color:#0f172a;padding:4px 0;">${ordenCompra || '—'}</td></tr>
        </table>
      </td>
    </tr>
  </table>

  <div style="margin-bottom:28px;">
    ${sectionTitle('Trabajos Realizados')}
    <table style="width:100%;border-collapse:collapse;">
      <tr style="background:#1e3a8a;"><th style="padding:8px 16px;text-align:left;font-size:10px;font-weight:600;color:#fff;text-transform:uppercase;">Servicio</th><th style="padding:8px 16px;text-align:center;font-size:10px;font-weight:600;color:#fff;text-transform:uppercase;width:72px;">Cant.</th></tr>
      ${trabajosRows}
    </table>
  </div>

  <div style="margin-bottom:28px;" class="no-break">
    ${sectionTitle('Descripción del Trabajo')}
    <div style="font-size:12px;line-height:1.6;color:#334155;">${descripcion || '—'}</div>
  </div>

  ${observaciones ? `
  <div style="margin-bottom:28px;" class="no-break">
    ${sectionTitle('Observaciones')}
    <div style="font-size:12px;line-height:1.6;color:#334155;">${observaciones}</div>
  </div>
  ` : ''}

  <div class="no-break" style="margin-bottom:20px;">
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="width:50%;vertical-align:top;padding-right:16px;">
          ${sectionTitle('Personal que ejecuta el trabajo')}
          <div style="margin-bottom:16px;">
            ${personalNames.length > 0
              ? personalNames.map((n, i) => `<div style="font-size:12px;color:#1e293b;padding:4px 0;${i < personalNames.length - 1 ? 'border-bottom:1px solid #f1f5f9;' : ''}">${n}</div>`).join('')
              : '<div style="font-size:12px;color:#94a3b8;">—</div>'}
          </div>
          ${sectionTitle('Patente Vehículo')}
          <div style="font-size:24px;font-weight:800;color:#1e3a8a;letter-spacing:3px;text-align:center;padding:8px 0;">${patente || '—'}</div>
        </td>
        <td style="width:50%;vertical-align:top;padding-left:16px;">
          ${sectionTitle('Conformidad — Firma Supervisor / Encargado')}
          <div style="text-align:center;padding-top:4px;">
            <div style="font-size:12px;font-weight:600;color:#0f172a;margin-bottom:4px;">${supervisor || ''}</div>
            <div style="width:240px;margin:0 auto;">
              <div style="min-height:72px;display:flex;align-items:flex-end;justify-content:center;">
                ${firmaHtml}
              </div>
              <div style="border-top:1.5px solid #1e293b;"></div>
              <div style="font-size:8px;color:#94a3b8;margin-top:4px;">Firma</div>
            </div>
            <div style="font-size:10px;color:#64748b;margin-top:8px;">${fechaFormateada}</div>
          </div>
        </td>
      </tr>
    </table>
  </div>

  ${hasFotos ? `
  <div style="page-break-before:always;height:0;"></div>
  <div style="height:82px;"></div>
  <div>
    ${fotosAntes.length > 0 ? `
    <div style="margin-bottom:12px;">
      ${sectionTitle('Antes')}
      ${buildFotoGrid(fotosAntes, tableWidth)}
    </div>
    ` : ''}

    ${fotosDespues.length > 0 ? `
    <div style="margin-bottom:12px;">
      ${sectionTitle('Después')}
      ${buildFotoGrid(fotosDespues, tableWidth)}
    </div>
    ` : ''}
  </div>
  ` : ''}

</div>

</body>
</html>`;
}
