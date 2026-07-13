export default function KpiCard({ label, value, sublabel, icon: Icon, highlight = false, onClick, trend }) {
  const clickable = typeof onClick === 'function';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`card p-5 text-left w-full transition-all ${
        highlight ? 'border-orange-300 ring-1 ring-orange-200' : ''
      } ${clickable ? 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate">{label}</p>
          <p className="mt-2 font-heading text-2xl font-bold text-gray-900 truncate">{value}</p>
          {sublabel && <p className="mt-1 text-sm text-gray-500 truncate">{sublabel}</p>}
        </div>
        {Icon && (
          <div
            className={`shrink-0 rounded-lg p-2.5 ${
              highlight ? 'bg-orange-100 text-orange-600' : 'bg-condor-50 text-condor-700'
            }`}
          >
            <Icon size={20} />
          </div>
        )}
      </div>
      {trend && <p className="mt-3 text-xs font-medium text-gray-400">{trend}</p>}
    </button>
  );
}
