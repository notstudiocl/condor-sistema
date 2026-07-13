import { formatFecha, formatHora } from '../pdf/template.js';

// Puerto fiel de las plantillas del flujo n8n original:
//   - "Notificación Cliente"   (n8n-nodes-base.gmail, id 3438be48-...)
//   - "Notificacion Condor"    (n8n-nodes-base.gmail, id e0a432cb-...)
//   - "Send a text message"    (n8n-nodes-base.telegram, id 2823631c-...)
//
// Antes tomaban datos de $('Webhook1').item.json.body (el payload crudo del wizard)
// y $('Get a record') (fields de Airtable). Ahora reciben el objeto `orden` que
// devuelve ordenesRepo.getOrdenById, ya hidratado con trabajos/empleados/cliente.
//
// El único cambio de fondo (no cosmético): el link "Ver en Airtable" no tiene
// reemplazo posible (Airtable desaparece del sistema) — se cambia por "Ver PDF de
// la Orden" apuntando a la key pública de R2, que es el artefacto real disponible.
//
// Estos son los defaults de CÓDIGO. Si existe una fila en notification_templates
// para el template_key correspondiente, dispatch.js la usa en su lugar.

const LOGO_URL = 'https://raw.githubusercontent.com/notstudiocl/condor-sistema/main/client/public/condor-logo.png';

function formatCLP(total) {
  const n = Number(total || 0);
  return `$${n.toLocaleString('es-CL')}`;
}

function nombreTrabajo(t) {
  return t.servicio_nombre || t.nombre_personalizado || '';
}

function trabajosRowsEmailCliente(trabajos) {
  return (trabajos || [])
    .filter((t) => t.cantidad > 0)
    .map((t, i) => {
      const bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
      return `<tr style="background-color:${bg};"><td style="padding:10px 16px;font-size:14px;color:#334155;border-bottom:1px solid #e2e8f0;font-family:Helvetica,Arial,sans-serif;">${nombreTrabajo(t)}</td><td style="padding:10px 16px;font-size:14px;color:#1e3a8a;font-weight:700;text-align:center;border-bottom:1px solid #e2e8f0;width:80px;font-family:Helvetica,Arial,sans-serif;">${t.cantidad || 0}</td></tr>`;
    })
    .join('');
}

function trabajosRowsEmailInterno(trabajos) {
  return (trabajos || [])
    .filter((t) => t.cantidad > 0)
    .map((t, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
      return `<tr style="background-color:${bg};"><td style="padding:8px 12px;font-size:13px;color:#334155;border-bottom:1px solid #e2e8f0;">${nombreTrabajo(t)}</td><td style="padding:8px 12px;font-size:13px;color:#1e3a8a;font-weight:700;text-align:center;border-bottom:1px solid #e2e8f0;width:70px;">${t.cantidad || 0}</td></tr>`;
    })
    .join('');
}

function personalTexto(orden) {
  return (orden.empleados || []).map((e) => e.nombre).filter(Boolean).join(', ') || '—';
}

// ============================================================
// Email Cliente — "su orden fue completada"
// ============================================================
export function emailClienteDefault(orden, { pdfUrl } = {}) {
  const numeroOrden = orden.numero_orden_display || 'S/N';
  const fecha = formatFecha(orden.fecha);
  const clienteNombre = orden.cliente_empresa || 'Cliente';

  const subject = `Orden de Trabajo N° ${numeroOrden} - Condor Alcantarillados`;

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <!--[if mso]>
  <style type="text/css">table{border-collapse:collapse;}.button-link{padding:14px 36px !important;}</style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;">
<tr><td align="center" style="padding:32px 16px;">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">

  <tr>
    <td style="background-color:#1e3a8a;height:6px;font-size:0;line-height:0;">&nbsp;</td>
  </tr>

  <tr>
    <td style="padding:28px 40px 20px;text-align:center;border-bottom:2px solid #e2e8f0;">
      <img src="${LOGO_URL}" alt="Condor Alcantarillados" width="200" style="display:block;margin:0 auto 10px;width:200px;max-width:200px;height:auto;" />
      <p style="margin:0;font-size:11px;color:#94a3b8;font-family:Helvetica,Arial,sans-serif;letter-spacing:0.5px;">Soluciones Sanitarias &bull; Transportes de Residuos &bull; Hidrojet</p>
    </td>
  </tr>

  <tr>
    <td style="padding:32px 40px 16px;">

      <p style="margin:0 0 8px;font-size:17px;color:#0f172a;font-weight:700;font-family:Helvetica,Arial,sans-serif;">Estimado/a ${clienteNombre},</p>
      <p style="margin:0 0 28px;font-size:14px;color:#475569;line-height:1.7;font-family:Helvetica,Arial,sans-serif;">Le informamos que su orden de trabajo ha sido completada exitosamente. A continuaci&oacute;n encontrar&aacute; el resumen del servicio realizado.</p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
        <tr>
          <td style="background-color:#eff6ff;border-left:4px solid #1e3a8a;padding:18px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:Helvetica,Arial,sans-serif;">
                  <p style="margin:0 0 2px;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;">Orden de Trabajo</p>
                  <p style="margin:0;font-size:30px;font-weight:800;color:#1e3a8a;line-height:1.1;">${numeroOrden}</p>
                </td>
                <td style="text-align:right;font-family:Helvetica,Arial,sans-serif;">
                  <p style="margin:0 0 2px;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;">Fecha</p>
                  <p style="margin:0;font-size:17px;font-weight:600;color:#0f172a;">${fecha}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
        <tr>
          <td colspan="2" style="padding:0 0 10px;border-bottom:2px solid #1e3a8a;">
            <p style="margin:0;font-size:11px;font-weight:700;color:#1e3a8a;text-transform:uppercase;letter-spacing:1.5px;font-family:Helvetica,Arial,sans-serif;">Datos del servicio</p>
          </td>
        </tr>
        <tr><td colspan="2" style="height:12px;"></td></tr>
        <tr>
          <td style="padding:5px 0;width:140px;font-size:12px;color:#64748b;font-family:Helvetica,Arial,sans-serif;vertical-align:top;">Direcci&oacute;n</td>
          <td style="padding:5px 0;font-size:14px;color:#0f172a;font-weight:600;font-family:Helvetica,Arial,sans-serif;">${orden.direccion || '—'}${orden.comuna ? ', ' + orden.comuna : ''}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:12px;color:#64748b;font-family:Helvetica,Arial,sans-serif;">Hora inicio</td>
          <td style="padding:5px 0;font-size:14px;color:#0f172a;font-family:Helvetica,Arial,sans-serif;">${formatHora(orden.hora_inicio)}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:12px;color:#64748b;font-family:Helvetica,Arial,sans-serif;">Hora t&eacute;rmino</td>
          <td style="padding:5px 0;font-size:14px;color:#0f172a;font-family:Helvetica,Arial,sans-serif;">${formatHora(orden.hora_termino)}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:12px;color:#64748b;font-family:Helvetica,Arial,sans-serif;">Supervisor</td>
          <td style="padding:5px 0;font-size:14px;color:#0f172a;font-family:Helvetica,Arial,sans-serif;">${orden.supervisor || '—'}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:12px;color:#64748b;font-family:Helvetica,Arial,sans-serif;">Personal</td>
          <td style="padding:5px 0;font-size:14px;color:#0f172a;font-family:Helvetica,Arial,sans-serif;">${personalTexto(orden)}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:12px;color:#64748b;font-family:Helvetica,Arial,sans-serif;">Patente veh&iacute;culo</td>
          <td style="padding:5px 0;font-size:15px;color:#1e3a8a;font-weight:700;letter-spacing:1px;font-family:Helvetica,Arial,sans-serif;">${orden.patente_vehiculo || '—'}</td>
        </tr>
      </table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
        <tr>
          <td style="padding:0 0 10px;border-bottom:2px solid #1e3a8a;">
            <p style="margin:0;font-size:11px;font-weight:700;color:#1e3a8a;text-transform:uppercase;letter-spacing:1.5px;font-family:Helvetica,Arial,sans-serif;">Trabajos realizados</p>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
        <tr style="background-color:#1e3a8a;">
          <td style="padding:10px 16px;font-size:11px;color:#ffffff;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;font-family:Helvetica,Arial,sans-serif;">Servicio</td>
          <td style="padding:10px 16px;font-size:11px;color:#ffffff;font-weight:600;text-transform:uppercase;text-align:center;width:80px;font-family:Helvetica,Arial,sans-serif;">Cant.</td>
        </tr>
        ${trabajosRowsEmailCliente(orden.trabajos)}
      </table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">
        <tr>
          <td align="center" style="padding:12px 0 16px;">
            <div style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px 24px;display:inline-block;">
              <p style="margin:0;font-size:14px;color:#1e3a8a;font-weight:600;font-family:Helvetica,Arial,sans-serif;">&#128206; La orden de trabajo se encuentra adjunta en este correo en formato PDF.</p>
            </div>
          </td>
        </tr>
      </table>

      <p style="margin:0;font-size:13px;color:#94a3b8;text-align:center;font-family:Helvetica,Arial,sans-serif;">Ante cualquier consulta, no dude en contactarnos.</p>

    </td>
  </tr>

  <tr>
    <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 40px;text-align:center;">
      <p style="margin:0 0 4px;font-size:12px;color:#64748b;line-height:1.6;font-family:Helvetica,Arial,sans-serif;">Amun&aacute;tegui N&deg;232, Of. 1904, Santiago</p>
      <p style="margin:0 0 4px;font-size:12px;color:#64748b;font-family:Helvetica,Arial,sans-serif;">+56 9 9743 9183 &bull; alcantarilladoscondor@gmail.com</p>
      <p style="margin:0;font-size:12px;font-family:Helvetica,Arial,sans-serif;"><a href="https://www.condoralcantarillados.cl" style="color:#2563eb;text-decoration:none;">www.condoralcantarillados.cl</a></p>
    </td>
  </tr>

  <tr>
    <td style="background-color:#1e3a8a;height:5px;font-size:0;line-height:0;">&nbsp;</td>
  </tr>

</table>

<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;margin-top:16px;">
  <tr>
    <td align="center" style="padding:0 0 8px;">
      <p style="margin:0;font-size:11px;color:#b0b8c4;font-family:Helvetica,Arial,sans-serif;">Sistema desarrollado por <a href="https://notstudio.cl" target="_blank" style="color:#64748b;text-decoration:underline;font-weight:600;">notstudio.cl</a></p>
    </td>
  </tr>
</table>

</td></tr>
</table>

</body>
</html>`;

  return { subject, html };
}

// ============================================================
// Email Interno — "OT completada" (alcantarilladoscondor@gmail.com)
// ============================================================
export function emailInternoDefault(orden, { pdfUrl } = {}) {
  const numeroOrden = orden.numero_orden_display || 'S/N';
  const fecha = formatFecha(orden.fecha);

  const subject = `[OT ${numeroOrden}] Completada — ${orden.cliente_empresa || 'Sin cliente'} — ${orden.comuna || ''}`;

  const verPdfBoton = pdfUrl
    ? `<tr>
    <td style="padding:16px 28px 24px;" align="center">
      <a href="${pdfUrl}" target="_blank" style="display:inline-block;background-color:#1e3a8a;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;padding:12px 32px;border-radius:6px;font-family:Helvetica,Arial,sans-serif;">Ver PDF de la Orden</a>
    </td>
  </tr>`
    : '';

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-text-size-adjust:100%;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;">
<tr><td align="center" style="padding:24px 16px;">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;max-width:600px;width:100%;border:1px solid #e2e8f0;">

  <tr>
    <td style="background-color:#1e3a8a;height:6px;font-size:0;line-height:0;">&nbsp;</td>
  </tr>

  <tr>
    <td style="padding:24px 28px 16px;text-align:center;border-bottom:2px solid #e2e8f0;">
      <img src="${LOGO_URL}" alt="Condor Alcantarillados" width="180" style="display:block;margin:0 auto;width:180px;max-width:180px;height:auto;" />
    </td>
  </tr>

  <tr>
    <td style="padding:20px 28px 20px;background-color:#f8fafc;border-bottom:2px solid #e2e8f0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-family:Helvetica,Arial,sans-serif;">
            <p style="margin:0;font-size:22px;font-weight:700;color:#1e3a8a;">OT ${numeroOrden} completada</p>
          </td>
          <td style="text-align:right;font-family:Helvetica,Arial,sans-serif;vertical-align:middle;">
            <p style="margin:0;font-size:14px;color:#64748b;">${fecha}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td style="padding:24px 28px 0;">
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#1e3a8a;text-transform:uppercase;letter-spacing:1.5px;border-bottom:2px solid #1e3a8a;padding-bottom:8px;font-family:Helvetica,Arial,sans-serif;">Cliente</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:Helvetica,Arial,sans-serif;">
        <tr>
          <td style="padding:4px 0;width:140px;font-size:12px;color:#64748b;">Empresa / Cliente</td>
          <td style="padding:4px 0;font-size:13px;color:#0f172a;font-weight:600;">${orden.cliente_empresa || '—'}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#64748b;">RUT</td>
          <td style="padding:4px 0;font-size:13px;color:#0f172a;">${orden.cliente?.rut || '—'}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#64748b;">Correo</td>
          <td style="padding:4px 0;font-size:13px;color:#0f172a;">${orden.cliente_email || '—'}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#64748b;">Tel&eacute;fono</td>
          <td style="padding:4px 0;font-size:13px;color:#0f172a;">${orden.cliente_telefono || '—'}</td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td style="padding:20px 28px 0;">
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#1e3a8a;text-transform:uppercase;letter-spacing:1.5px;border-bottom:2px solid #1e3a8a;padding-bottom:8px;font-family:Helvetica,Arial,sans-serif;">Servicio</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:Helvetica,Arial,sans-serif;">
        <tr>
          <td style="padding:4px 0;width:140px;font-size:12px;color:#64748b;">Direcci&oacute;n</td>
          <td style="padding:4px 0;font-size:13px;color:#0f172a;font-weight:600;">${orden.direccion || '—'}${orden.comuna ? ', ' + orden.comuna : ''}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#64748b;">Hora inicio</td>
          <td style="padding:4px 0;font-size:13px;color:#0f172a;">${formatHora(orden.hora_inicio)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#64748b;">Hora t&eacute;rmino</td>
          <td style="padding:4px 0;font-size:13px;color:#0f172a;">${formatHora(orden.hora_termino)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#64748b;">Supervisor</td>
          <td style="padding:4px 0;font-size:13px;color:#0f172a;">${orden.supervisor || '—'}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#64748b;">Personal</td>
          <td style="padding:4px 0;font-size:13px;color:#0f172a;">${personalTexto(orden)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#64748b;">Patente</td>
          <td style="padding:4px 0;font-size:13px;color:#1e3a8a;font-weight:700;letter-spacing:1px;">${orden.patente_vehiculo || '—'}</td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td style="padding:20px 28px 0;">
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#1e3a8a;text-transform:uppercase;letter-spacing:1.5px;border-bottom:2px solid #1e3a8a;padding-bottom:8px;font-family:Helvetica,Arial,sans-serif;">Trabajos realizados</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:Helvetica,Arial,sans-serif;">
        <tr style="background-color:#f1f5f9;">
          <td style="padding:8px 12px;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;">Servicio</td>
          <td style="padding:8px 12px;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;text-align:center;width:70px;">Cant.</td>
        </tr>
        ${trabajosRowsEmailInterno(orden.trabajos)}
      </table>
    </td>
  </tr>

  <tr>
    <td style="padding:20px 28px 0;">
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#1e3a8a;text-transform:uppercase;letter-spacing:1.5px;border-bottom:2px solid #1e3a8a;padding-bottom:8px;font-family:Helvetica,Arial,sans-serif;">Descripci&oacute;n</p>
      <p style="margin:0;font-size:13px;color:#334155;line-height:1.6;font-family:Helvetica,Arial,sans-serif;">${orden.descripcion_trabajo || 'Sin descripción'}</p>
    </td>
  </tr>

  ${orden.observaciones ? `<tr><td style="padding:20px 28px 0;"><p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#1e3a8a;text-transform:uppercase;letter-spacing:1.5px;border-bottom:2px solid #1e3a8a;padding-bottom:8px;font-family:Helvetica,Arial,sans-serif;">Observaciones</p><p style="margin:0;font-size:13px;color:#334155;line-height:1.6;font-family:Helvetica,Arial,sans-serif;">${orden.observaciones}</p></td></tr>` : ''}

  <tr>
    <td style="padding:20px 28px 0;">
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#1e3a8a;text-transform:uppercase;letter-spacing:1.5px;border-bottom:2px solid #1e3a8a;padding-bottom:8px;font-family:Helvetica,Arial,sans-serif;">Informaci&oacute;n financiera</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:Helvetica,Arial,sans-serif;">
        <tr>
          <td style="padding:4px 0;width:140px;font-size:12px;color:#64748b;">Total</td>
          <td style="padding:4px 0;font-size:15px;color:#0f172a;font-weight:700;">${formatCLP(orden.total)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#64748b;">M&eacute;todo de pago</td>
          <td style="padding:4px 0;font-size:13px;color:#0f172a;">${orden.metodo_pago || '—'}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#64748b;">Requiere factura</td>
          <td style="padding:4px 0;font-size:13px;color:#0f172a;font-weight:600;">${orden.requiere_factura ? 'Sí' : 'No'}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#64748b;">Garant&iacute;a</td>
          <td style="padding:4px 0;font-size:13px;color:#0f172a;">${orden.garantia || '—'}</td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td style="padding:20px 28px 8px;">
      <div style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 20px;text-align:center;">
        <p style="margin:0;font-size:13px;color:#1e3a8a;font-weight:600;font-family:Helvetica,Arial,sans-serif;">&#128206; Orden de trabajo adjunta en formato PDF</p>
      </div>
    </td>
  </tr>
  ${verPdfBoton}

  <tr>
    <td style="background-color:#1e3a8a;height:5px;font-size:0;line-height:0;">&nbsp;</td>
  </tr>

</table>

</td></tr>
</table>

</body>
</html>`;

  return { subject, html };
}

// ============================================================
// Telegram interno — "NUEVA OT COMPLETADA"
// ============================================================
export function telegramDefault(orden, { pdfUrl } = {}) {
  const numeroOrden = orden.numero_orden_display || 'S/N';
  const fecha = formatFecha(orden.fecha);

  const trabajosTexto =
    (orden.trabajos || [])
      .filter((t) => t.cantidad > 0)
      .map((t) => `  • ${nombreTrabajo(t)} × ${t.cantidad}`)
      .join('\n') || '  Sin trabajos registrados';

  const personal = personalTexto(orden);

  const verPdfLinea = pdfUrl ? `\n\n<a href="${pdfUrl}">👉👉👉 Ver PDF de la Orden</a>` : '';

  const text =
    `<b>NUEVA OT COMPLETADA ✅</b>\n` +
    `━━━━━━━\n` +
    `<b>OT ${numeroOrden}</b> — ${fecha}\n\n` +
    `Cliente: ${orden.cliente_empresa || '—'}\n` +
    `Patente: ${orden.patente_vehiculo || '—'}\n` +
    `${personal}\n\n` +
    `🔧 <b>Trabajos:</b>\n${trabajosTexto}` +
    verPdfLinea;

  return { text };
}
