import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { buscarClientesAdmin } from '../utils/api';
import { formatRut } from '../utils/format';

/**
 * Buscador de clientes para reasignar el cliente de una orden desde el admin.
 * Portado de client/src/components/ClienteSearch.jsx (proyecto Vite separado, no se
 * puede importar directo) y adaptado al endpoint admin (GET /admin/clientes/buscar)
 * y al formato de cliente de Postgres (id numérico en vez de recordId de Airtable).
 */
export default function ClienteSearchAdmin({ onSelect, placeholder }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const search = useCallback((q) => {
    clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await buscarClientesAdmin(q.trim());
        setResults(res.data || []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  }, []);

  const handleSelect = (cliente) => {
    setQuery('');
    setResults([]);
    setOpen(false);
    onSelect(cliente);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            search(e.target.value);
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder || 'Buscar por RUT, nombre o empresa...'}
          className="input-field pl-9"
          autoComplete="off"
        />
        {loading && (
          <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />
        )}
      </div>

      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {results.length === 0 && !loading ? (
            <div className="px-3 py-2.5 text-sm text-gray-500">Sin resultados para &quot;{query}&quot;</div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c)}
                  className="w-full text-left px-3 py-2.5 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
                >
                  <p className="text-sm font-semibold text-gray-900">{c.empresa?.trim() ? c.empresa : c.nombre}</p>
                  <p className="text-xs text-gray-500">
                    {c.empresa?.trim() ? `${c.nombre} · ` : ''}
                    {formatRut(c.rut)}
                  </p>
                  {(c.direccion || c.comuna) && (
                    <p className="text-xs text-gray-400">{[c.direccion, c.comuna].filter(Boolean).join(', ')}</p>
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
