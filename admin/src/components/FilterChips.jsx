/**
 * Fila de chips seleccionables. `options` es [{ value, label, count? }].
 * `multi` permite selección múltiple (values es array); si no, values es un solo valor.
 */
export default function FilterChips({ options, values, onChange, multi = true }) {
  const selected = multi ? values || [] : values;

  const isActive = (value) => (multi ? selected.includes(value) : selected === value);

  const toggle = (value) => {
    if (!multi) {
      onChange(selected === value ? null : value);
      return;
    }
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = isActive(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              active
                ? 'bg-condor-900 border-condor-900 text-white'
                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            {opt.label}
            {opt.count !== undefined && (
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  active ? 'bg-white/20' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
