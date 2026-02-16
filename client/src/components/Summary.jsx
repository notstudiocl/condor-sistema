import { formatCLP, todayFormatted } from '../utils/helpers';
import { ChevronRight } from 'lucide-react';

function SectionHeader({ title, stepIndex, onEdit }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h3 className="font-heading font-semibold text-condor-900">{title}</h3>
      {onEdit && (
        <button
          type="button"
          onClick={() => onEdit(stepIndex)}
          className="text-xs text-condor-600 hover:text-condor-800 flex items-center gap-0.5"
        >
          Editar <ChevronRight size={12} />
        </button>
      )}
    </div>
  );
}

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between py-1 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right max-w-[60%]">
        {value}
      </span>
    </div>
  );
}

export default function Summary({ data, onEdit }) {
  const trabajosActivos = (data.trabajos || []).filter((t) => t.cantidad > 0);
  const fotosAntes = data.fotosAntes || [];
  const fotosDespues = data.fotosDespues || [];

  return (
    <div className="space-y-4">
      {/* Cliente */}
      <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
        <SectionHeader title="Datos del Cliente" stepIndex={0} onEdit={onEdit} />
        <Field label="Cliente" value={data.clienteNombre} />
        <Field label="RUT" value={data.clienteRut} />
        <Field label="Email" value={data.clienteEmail} />
        <Field label="Teléfono" value={data.clienteTelefono} />
        <Field label="Dirección" value={data.direccion} />
        <Field label="Comuna" value={data.comuna} />
        <Field label="Orden de Compra" value={data.ordenCompra} />
        <Field label="Supervisor" value={data.supervisor} />
        <Field label="Inicio" value={data.horaInicio} />
        <Field label="Término" value={data.horaTermino} />
      </div>

      {/* Trabajos */}
      <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
        <SectionHeader title="Trabajos Realizados" stepIndex={1} onEdit={onEdit} />
        {trabajosActivos.length > 0 ? (
          <div className="space-y-1">
            {trabajosActivos.map((t) => (
              <div
                key={t.nombre}
                className="flex justify-between py-1 border-b border-gray-100 last:border-0"
              >
                <span className="text-sm text-gray-700">{t.nombre}</span>
                <span className="text-sm font-semibold text-accent-700 bg-accent-50 px-2 rounded">
                  x{t.cantidad}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">Sin trabajos seleccionados</p>
        )}
        <Field label="Descripción" value={data.descripcion} />
        <Field label="Observaciones" value={data.observaciones} />
        <div className="mt-2 pt-2 border-t border-gray-200">
          <Field label="Total" value={formatCLP(data.total)} />
          <Field label="Método de Pago" value={data.metodoPago} />
          <Field label="Garantía" value={data.garantia} />
          <Field label="Requiere Factura" value={data.requiereFactura} />
        </div>
      </div>

      {/* Personal */}
      <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
        <SectionHeader title="Personal" stepIndex={2} onEdit={onEdit} />
        <Field
          label="Equipo"
          value={(data.personal || []).join(', ')}
        />
        <Field label="Patente" value={data.patenteVehiculo} />
      </div>

      {/* Fotos */}
      {(fotosAntes.length > 0 || fotosDespues.length > 0) && (
        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
          <SectionHeader title="Fotos" stepIndex={3} onEdit={onEdit} />
          {fotosAntes.length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-gray-400 mb-1">Antes ({fotosAntes.length})</p>
              <div className="flex gap-1">
                {fotosAntes.map((f, i) => (
                  <div key={i} className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100">
                    <img src={f} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}
          {fotosDespues.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Después ({fotosDespues.length})</p>
              <div className="flex gap-1">
                {fotosDespues.map((f, i) => (
                  <div key={i} className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100">
                    <img src={f} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Meta */}
      <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
        <Field label="Fecha" value={todayFormatted()} />
        <Field label="Firma" value={data.firmaBase64 ? 'Capturada' : 'Pendiente'} />
      </div>
    </div>
  );
}
