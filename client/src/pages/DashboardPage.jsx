import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, RefreshCw, Loader2, ClipboardList, ChevronRight, Search, X, WifiOff } from 'lucide-react';
import { clearWizardSession } from './OrdenWizardPage';

const API_URL = (import.meta.env.VITE_API_URL || 'https://clientes-condor-api.f8ihph.easypanel.host/api').replace(/\/api\/?$/, '');

function EstadoBadge({ estado }) {
  const styles = {
    Enviada: 'bg-blue-500 text-white',
    Completada: 'bg-emerald-500 text-white',
    Error: 'bg-red-500 text-white',
    Pendiente: 'bg-amber-400 text-black',
    Facturada: 'bg-purple-500 text-white',
  };
  return (
    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${styles[estado] || 'bg-gray-400 text-white'}`}>
      {estado}
    </span>
  );
}

export default function DashboardPage({ pendingCount = 0 }) {
  const navigate = useNavigate();
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [busquedaDebounced, setBusquedaDebounced] = useState('');
  const debounceRef = useRef(null);

  const cargarOrdenes = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/ordenes`);
      const data = await res.json();
      setOrdenes(data.data || []);
    } catch {
      setOrdenes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarOrdenes();
  }, []);

  const handleBusqueda = (value) => {
    setBusqueda(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setBusquedaDebounced(value);
    }, 300);
  };

  const ordenesFiltradas = useMemo(() => {
    if (!busquedaDebounced.trim()) return ordenes;
    const q = busquedaDebounced.toLowerCase().trim();
    return ordenes.filter((o) => {
      const campos = [
        o.numeroOrden,
        o.clienteEmpresa,
        o.supervisor,
        o.direccion,
        o.comuna,
        o.clienteRut,
        o.descripcion,
        o.estado,
      ];
      return campos.some((c) => c && String(c).toLowerCase().includes(q));
    });
  }, [ordenes, busquedaDebounced]);

  return (
    <div className="min-h-[calc(100vh-56px)] bg-gray-50">
      <div className="max-w-lg mx-auto px-4 pt-6 pb-8">
        {/* Pending offline orders banner */}
        {pendingCount > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-2xl px-4 py-3 mb-4 flex items-center gap-3">
            <WifiOff size={20} className="text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800 font-medium">
              {pendingCount} {pendingCount === 1 ? 'orden pendiente' : 'órdenes pendientes'} de envío
            </p>
          </div>
        )}

        {/* Boton Nueva Orden */}
        <button
          onClick={() => { clearWizardSession(); navigate('/orden/nueva'); }}
          className="w-full bg-accent-600 hover:bg-accent-700 active:bg-accent-800 text-white font-bold rounded-2xl py-5 text-lg transition-colors flex items-center justify-center gap-2 shadow-lg mb-6"
        >
          <Plus size={24} strokeWidth={3} />
          Nueva Orden de Trabajo
        </button>

        {/* Buscador */}
        <div className="relative mb-4">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => handleBusqueda(e.target.value)}
            placeholder="Buscar por OT, RUT, cliente..."
            className="w-full pl-10 pr-10 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-condor-300 focus:border-condor-400 shadow-sm"
          />
          {busqueda && (
            <button
              onClick={() => { setBusqueda(''); setBusquedaDebounced(''); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Header historial */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading font-bold text-lg text-condor-900">
            {busquedaDebounced
              ? `${ordenesFiltradas.length} orden${ordenesFiltradas.length !== 1 ? 'es' : ''} encontrada${ordenesFiltradas.length !== 1 ? 's' : ''}`
              : 'Mis Ordenes Recientes'}
          </h2>
          <button
            onClick={cargarOrdenes}
            disabled={loading}
            className="p-2.5 rounded-xl hover:bg-condor-50 active:bg-condor-100 transition-colors"
          >
            <RefreshCw size={18} className={`text-condor-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 size={32} className="animate-spin text-condor-400 mb-3" />
            <p className="text-sm text-gray-400">Cargando ordenes...</p>
          </div>
        ) : ordenesFiltradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <ClipboardList size={48} className="text-gray-300 mb-3" />
            <p className="text-sm text-gray-400">
              {busquedaDebounced
                ? `No se encontraron órdenes para '${busquedaDebounced}'`
                : 'No hay ordenes registradas'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {ordenesFiltradas.map((o) => (
              <button
                key={o.recordId}
                onClick={() => navigate(`/orden/${o.recordId}`)}
                className="w-full bg-white rounded-2xl border border-gray-200 p-4 shadow-sm hover:border-condor-300 hover:shadow-md active:bg-gray-50 transition-all text-left"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-base font-bold text-condor-900">{o.numeroOrden || 'Sin numero'}</span>
                  <div className="flex items-center gap-2">
                    <EstadoBadge estado={o.estado} />
                    <ChevronRight size={16} className="text-gray-300" />
                  </div>
                </div>
                <p className="text-sm text-gray-700 font-medium">{o.clienteEmpresa || 'Sin cliente'}<span className="text-gray-400 font-normal ml-2">{o.fecha}</span></p>
                <p className="text-xs text-gray-400 mt-0.5">{o.direccion}{o.comuna ? `, ${o.comuna}` : ''}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
