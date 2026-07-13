import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

/**
 * Input de búsqueda controlado con debounce de 300ms.
 * `onSearch` recibe el valor ya debounced; `value`/`onChange` (si se pasan)
 * permiten controlar el texto visible desde afuera (ej. sincronizar con la URL).
 */
export default function SearchInput({
  placeholder = 'Buscar...',
  value,
  onChange,
  onSearch,
  debounceMs = 300,
  autoFocus = false,
  className = '',
}) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(value || '');
  const debounceRef = useRef(null);

  useEffect(() => {
    if (isControlled) setInternal(value || '');
  }, [value, isControlled]);

  const handleChange = (e) => {
    const next = e.target.value;
    if (!isControlled) setInternal(next);
    onChange?.(next);

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearch?.(next), debounceMs);
  };

  const handleClear = () => {
    if (!isControlled) setInternal('');
    onChange?.('');
    clearTimeout(debounceRef.current);
    onSearch?.('');
  };

  const shown = isControlled ? value : internal;

  return (
    <div className={`relative ${className}`}>
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <input
        type="text"
        value={shown}
        onChange={handleChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-8 py-2.5 text-sm text-gray-900
          placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-condor-400 focus:border-transparent
          transition-shadow"
      />
      {shown && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
          aria-label="Limpiar búsqueda"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}
