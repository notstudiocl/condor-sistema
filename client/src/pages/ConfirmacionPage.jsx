import { CheckCircle2, Clock, Plus, AlertTriangle, XCircle, RotateCcw } from 'lucide-react';
import { formatCLP, todayFormatted } from '../utils/helpers';

export default function ConfirmacionPage({ orden, onNuevaOrden, onReintentar }) {
  const trabajosActivos = (orden.trabajos || []).filter((t) => t.cantidad > 0);
  const isOffline = orden._offline === true;
  const webhookError = orden._webhookError;
  const submitError = orden._submitError;
  const airtableOk = orden._airtableOk;

  // Determine state
  let bgClass, icon, title, subtitle;

  if (submitError && !airtableOk) {
    // Total failure
    bgClass = 'bg-red-600';
    icon = <XCircle size={48} className="text-white" />;
    title = 'Error al Enviar';
    subtitle = submitError;
  } else if (airtableOk && webhookError) {
    // Airtable OK but webhook failed
    bgClass = 'bg-amber-500';
    icon = <AlertTriangle size={48} className="text-white" />;
    title = 'Orden Guardada';
    subtitle = 'Pendiente de procesar';
  } else if (isOffline) {
    // Offline
    bgClass = 'bg-amber-500';
    icon = <Clock size={48} className="text-white" />;
    title = 'Orden Guardada';
    subtitle = 'Se enviará al recuperar conexión';
  } else {
    // Full success
    bgClass = 'bg-emerald-500';
    icon = <CheckCircle2 size={48} className="text-white" />;
    title = 'Orden Registrada';
    subtitle = 'Enviada correctamente';
  }

  return (
    <div className={`min-h-screen ${bgClass} transition-colors`}>
      <div className="max-w-md mx-auto px-4 pt-12 pb-8">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-4">
            {icon}
          </div>
          <h1 className="text-white font-heading font-bold text-2xl">{title}</h1>
          <p className="text-white/80 text-sm mt-1 text-center">{subtitle}</p>
        </div>

        {/* Error detail */}
        {(submitError || webhookError) && (
          <div className="bg-white/10 rounded-2xl p-4 mb-4">
            <p className="text-white/60 text-xs mb-1">Detalle del error</p>
            <p className="text-white text-sm">{submitError || webhookError}</p>
          </div>
        )}

        {/* Summary card */}
        <div className="bg-white/10 backdrop-blur rounded-2xl p-5 space-y-3 mb-6">
          <Row label="Fecha" value={todayFormatted()} />
          <Row label="Cliente" value={orden.clienteNombre} />
          <Row label="RUT" value={orden.clienteRut} />
          <Row label="Dirección" value={orden.direccion} />
          <Row label="Supervisor" value={orden.supervisor} />

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
            className="w-full border-2 border-white text-white font-semibold rounded-2xl py-4 text-sm transition-colors flex items-center justify-center gap-2 hover:bg-white/10"
          >
            <Plus size={20} />
            Nueva Orden de Trabajo
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
