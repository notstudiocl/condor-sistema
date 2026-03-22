import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Loader2, X, CheckCircle } from 'lucide-react';
import { buscarClientes } from '../utils/api';

export default function ClienteSearch({ onSelectCliente, onClearCliente, clienteSeleccionado }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const search = useCallback((q) => {
    clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await buscarClientes(q);
        setResults(res.data || []);
        setShowDropdown(true);
        setActiveIndex(-1);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    search(val);
  };

  const handleSelect = (cliente) => {
    setQuery('');
    setResults([]);
    setShowDropdown(false);
    onSelectCliente(cliente);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setShowDropdown(false);
    onClearCliente();
  };

  const handleKeyDown = (e) => {
    if (!showDropdown || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(results[activeIndex]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      setActiveIndex(-1);
    }
  };

  // Selected chip
  if (clienteSeleccionado) {
    return (
      <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-2xl px-4 py-3 min-h-[48px]">
        <CheckCircle size={18} className="text-green-600 flex-shrink-0" />
        <span className="text-sm text-green-800 font-medium truncate">
          Cliente seleccionado: {clienteSeleccionado.empresa && clienteSeleccionado.empresa.trim()
            ? clienteSeleccionado.empresa
            : clienteSeleccionado.nombre}
        </span>
        <button
          type="button"
          onClick={handleClear}
          className="ml-auto flex-shrink-0 p-1 rounded-full hover:bg-green-100 transition-colors"
          aria-label="Limpiar selección"
        >
          <X size={16} className="text-green-600" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          placeholder="Buscar cliente por nombre, empresa, dirección..."
          className="input-field pl-10 pr-10 min-h-[48px] rounded-2xl focus:ring-2 focus:ring-condor-300"
          autoComplete="off"
        />
        {loading && (
          <Loader2 size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-2xl shadow-lg overflow-hidden">
          {results.length === 0 && !loading ? (
            <div className="px-4 py-3 text-sm text-gray-500">
              No se encontraron clientes para "{query}"
            </div>
          ) : (
            <div className="max-h-[280px] overflow-y-auto">
              {results.map((c, i) => (
                <button
                  key={c.recordId || c.rut}
                  type="button"
                  onClick={() => handleSelect(c)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 last:border-0 transition-colors ${
                    i === activeIndex ? 'bg-condor-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900">
                    {c.empresa && c.empresa.trim() ? c.empresa : c.nombre}
                  </p>
                  <p className="text-xs text-gray-500">
                    {c.empresa && c.empresa.trim() ? `${c.nombre} · ` : ''}RUT: {c.rut}
                  </p>
                  {(c.direccion || c.comuna) && (
                    <p className="text-xs text-gray-400">
                      {[c.direccion, c.comuna].filter(Boolean).join(', ')}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
