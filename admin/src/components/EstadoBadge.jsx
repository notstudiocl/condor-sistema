// Estados reales del schema Postgres (ver plan de migración):
// Pendiente / Enviada / Completada / Facturacion pendiente / Facturada.
const ESTILOS = {
  Pendiente: 'bg-amber-100 text-amber-800 border-amber-200',
  Enviada: 'bg-blue-100 text-blue-800 border-blue-200',
  Completada: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Facturacion pendiente': 'bg-orange-100 text-orange-800 border-orange-300',
  Facturada: 'bg-purple-100 text-purple-800 border-purple-200',
};

const ESTILOS_SOLIDO = {
  Pendiente: 'bg-amber-400 text-black',
  Enviada: 'bg-blue-500 text-white',
  Completada: 'bg-emerald-500 text-white',
  'Facturacion pendiente': 'bg-orange-500 text-white',
  Facturada: 'bg-purple-500 text-white',
};

export default function EstadoBadge({ estado, solido = false }) {
  const clase = solido
    ? ESTILOS_SOLIDO[estado] || 'bg-gray-400 text-white'
    : ESTILOS[estado] || 'bg-gray-100 text-gray-600 border-gray-200';

  return (
    <span
      className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${
        solido ? '' : 'border'
      } ${clase}`}
    >
      {estado || 'Sin estado'}
    </span>
  );
}
