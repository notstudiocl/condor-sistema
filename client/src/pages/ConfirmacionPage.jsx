import { CheckCircle2, Clock, Plus, AlertTriangle, XCircle, RotateCcw, Home } from 'lucide-react';
import { formatCLP, todayFormatted, formatFechaAmigable } from '../utils/helpers';

export default function ConfirmacionPage({ orden, onNuevaOrden, onReintentar, onInicio }) {
  const trabajosActivos = (orden.trabajos || []).filter((t) => t.cantidad > 0);
  const isOffline = orden._offline === true;
  const webhookError = orden._webhookError;
  const submitError = orden._submitError;
  const airtableOk = orden._airtableOk;
  const webhookData = orden._webhookData;
  const webhookOk = !webhookError && !isOffline && airtableOk;
  const numeroOrden = webhookData?.numeroOrden || null;
  const isDuplicate = orden._duplicate === true;

  // Determine state
  let bgClass, icon, title, subtitle;

  if (submitError && !airtableOk) {
    bgClass = 'bg-red-600';
    icon = <XCircle size={48} className="text-white" />;
    title = 'Error al Enviar';
    subtitle = submitError;
  } else if (airtableOk && webhookError) {
    bgClass = 'bg-amber-500';
    icon = <AlertTriangle size={48} className="text-white" />;
    title = 'Orden Guardada';
    subtitle = 'Pendiente de procesar';
  } else if (isOffline) {
    bgClass = 'bg-amber-500';
    icon = <Clock size={48} className="text-white" />;
    title = 'Orden Guardada';
    subtitle = 'Se enviará al recuperar conexión';
  } else {
    bgClass = 'bg-emerald-500';
    icon = <CheckCircle2 size={48} className="text-white" />;
    title = 'Orden Registrada';
    subtitle = 'Enviada correctamente';
  }

  // Build status checks
  const checks = [];
  if (!isOffline) {
    if (submitError && !airtableOk) {
      checks.push({ ok: false, text: `Error al crear registro: ${submitError}` });
    } else {
      checks.push({ ok: airtableOk, text: airtableOk ? 'Registro creado en Airtable' : 'Error al crear registro' });
      checks.push({ ok: airtableOk, text: airtableOk ? 'Fotos subidas correctamente' : 'Error al subir fotos' });
      checks.push({ ok: airtableOk, text: airtableOk ? 'Firma guardada' : 'Error al guardar firma' });
      checks.push({
        ok: webhookData?.pdfGenerado === true,
        text: webhookData?.pdfGenerado ? 'PDF generado' : 'PDF pendiente de generar',
      });
      checks.push({
        ok: webhookOk,
        text: webhookOk ? 'Orden procesada por n8n' : `Webhook no respondió: ${webhookError || 'error desconocido'}`,
      });
    }
  }

  return (
    <div className={`min-h-screen ${bgClass} transition-colors`}>
      <div className="max-w-md mx-auto px-4 pt-12 pb-8">
        {/* Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-4">
            {icon}
          </div>
          <h1 className="text-white font-heading font-bold text-2xl">{title}</h1>
          <p className="text-white/80 text-sm mt-1 text-center">{subtitle}</p>
          {isDuplicate && (
            <p className="text-white/90 text-xs mt-2 bg-white/20 rounded-full px-3 py-1">
              Esta orden ya fue registrada anteriormente
            </p>
          )}
        </div>

        {/* Numero de orden destacado */}
        {!isOffline && !(submitError && !airtableOk) && (
          <div className="text-center mb-6">
            <p className="text-white/60 text-xs uppercase tracking-wider mb-1">Número de Orden</p>
            <p className="text-white font-heading font-bold text-3xl">
              {numeroOrden || 'Pendiente'}
            </p>
          </div>
        )}

        {/* Status checks card */}
        {checks.length > 0 && (
          <div className="bg-white rounded-2xl p-4 mb-6 space-y-2.5">
            {checks.map((check, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="text-base leading-none mt-0.5 shrink-0">{check.ok ? '✅' : '❌'}</span>
                <span
                  className={`text-sm font-medium ${check.ok ? 'text-[#065F46]' : 'text-[#991B1B]'}`}
                >
                  {check.text}
                </span>
              </div>
            ))}
            {numeroOrden && (
              <div className="flex items-start gap-2.5 pt-2 border-t border-gray-100">
                <span className="text-base leading-none mt-0.5 shrink-0">📄</span>
                <span className="text-sm font-semibold text-[#1E3A8A]">
                  Número de orden: {numeroOrden}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Summary card */}
        <div className="bg-white/10 backdrop-blur rounded-2xl p-5 space-y-3 mb-6">
          <Row label="Fecha" value={todayFormatted()} />
          <Row label="Cliente / Empresa" value={orden.clienteEmpresa} />
          <Row label="Supervisor / Encargado" value={orden.supervisor} />
          <Row label="RUT" value={orden.clienteRut} />
          <Row label="Dirección" value={orden.direccion} />

          {trabajosActivos.length > 0 && (
            <div className="border-t border-white/20 pt-3">
              <p className="text-xs text-white/50 mb-2 uppercase tracking-wider">
                Trabajos
              </p>
              {trabajosActivos.map((t) => (
                <div
                  key={t.trabajo || t.nombre}
                  className="flex justify-between text-sm py-0.5"
                >
                  <span className="text-white/80">{t.trabajo || t.nombre}</span>
                  <span className="font-semibold text-white">x{t.cantidad}</span>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-white/20 pt-3">
            <Row label="Total" value={formatCLP(orden.total)} />
            <Row label="Método de Pago" value={orden.metodoPago} />
          </div>

          <div className="border-t border-white/20 pt-3">
            <Row
              label="Equipo"
              value={(orden.personal || []).join(', ')}
            />
            <Row label="Patente" value={orden.patenteVehiculo} />
          </div>
        </div>

        {/* Buttons */}
        <div className="space-y-3">
          {(submitError || webhookError) && onReintentar && (
            <button
              onClick={onReintentar}
              className="w-full bg-white text-gray-900 font-semibold rounded-2xl py-4 text-sm transition-colors flex items-center justify-center gap-2 shadow-lg"
            >
              <RotateCcw size={20} />
              Reintentar Envío
            </button>
          )}
          <button
            onClick={onNuevaOrden}
            className="w-full bg-white text-gray-900 font-semibold rounded-2xl py-4 text-sm transition-colors flex items-center justify-center gap-2 shadow-lg"
          >
            <Plus size={20} />
            Nueva Orden de Trabajo
          </button>
          <button
            onClick={onInicio}
            className="w-full border-2 border-white text-white font-semibold rounded-2xl py-4 text-sm transition-colors flex items-center justify-center gap-2 hover:bg-white/10"
          >
            <Home size={20} />
            Ir al Inicio
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between text-sm">
      <span className="text-white/50">{label}</span>
      <span className="text-white font-medium text-right max-w-[60%]">{value}</span>
    </div>
  );
}
