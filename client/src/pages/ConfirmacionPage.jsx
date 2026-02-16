import { CheckCircle2, Plus } from 'lucide-react';
import { formatCLP, todayFormatted } from '../utils/helpers';

export default function ConfirmacionPage({ orden, onNuevaOrden }) {
  const trabajosActivos = (orden.trabajos || []).filter((t) => t.cantidad > 0);

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white p-4 pb-8">
      <div className="max-w-md mx-auto pt-8">
        {/* Success icon */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 size={48} className="text-green-500" />
          </div>
          <h1 className="text-gray-900 font-heading font-bold text-2xl">
            Orden Enviada
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            La orden fue registrada exitosamente
          </p>
        </div>

        {/* Resumen */}
        <div className="bg-white border border-condor-200 rounded-2xl p-5 space-y-3 shadow-sm">
          <Row label="Fecha" value={todayFormatted()} />
          <Row label="Cliente" value={orden.clienteNombre} />
          <Row label="RUT" value={orden.clienteRut} />
          <Row label="Dirección" value={orden.direccion} />
          <Row label="Supervisor" value={orden.supervisor} />

          {trabajosActivos.length > 0 && (
            <div className="border-t border-gray-200 pt-3">
              <p className="text-xs text-gray-400 mb-2 uppercase tracking-wider">
                Trabajos
              </p>
              {trabajosActivos.map((t) => (
                <div
                  key={t.nombre}
                  className="flex justify-between text-sm py-0.5"
                >
                  <span className="text-gray-600">{t.nombre}</span>
                  <span className="font-semibold text-accent-600">x{t.cantidad}</span>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-gray-200 pt-3">
            <Row label="Total" value={formatCLP(orden.total)} />
            <Row label="Método de Pago" value={orden.metodoPago} />
            <Row label="Garantía" value={orden.garantia} />
          </div>

          <div className="border-t border-gray-200 pt-3">
            <Row
              label="Equipo"
              value={(orden.personal || []).join(', ')}
            />
            <Row label="Patente" value={orden.patenteVehiculo} />
          </div>
        </div>

        {/* Nueva Orden */}
        <button
          onClick={onNuevaOrden}
          className="w-full mt-6 bg-accent-600 hover:bg-accent-700 text-white font-semibold rounded-xl py-4 text-sm transition-colors flex items-center justify-center gap-2 shadow-lg"
        >
          <Plus size={20} />
          Nueva Orden de Trabajo
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-900 font-medium text-right max-w-[60%]">
        {value}
      </span>
    </div>
  );
}
