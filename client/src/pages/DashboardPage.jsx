import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, RefreshCw, Loader2, ClipboardList, ChevronRight } from 'lucide-react';
import { formatCLP } from '../utils/helpers';

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

export default function DashboardPage() {
  const navigate = useNavigate();
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="min-h-[calc(100vh-56px)] bg-gray-50">
      <div className="max-w-lg mx-auto px-4 pt-6 pb-8">
        {/* Boton Nueva Orden */}
        <button
          onClick={() => navigate('/orden/nueva')}
          className="w-full bg-accent-600 hover:bg-accent-700 active:bg-accent-800 text-white font-bold rounded-2xl py-5 text-lg transition-colors flex items-center justify-center gap-2 shadow-lg mb-6"
        >
          <Plus size={24} strokeWidth={3} />
          Nueva Orden de Trabajo
        </button>

        {/* Header historial */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading font-bold text-lg text-condor-900">Mis Ordenes Recientes</h2>
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
        ) : ordenes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <ClipboardList size={48} className="text-gray-300 mb-3" />
            <p className="text-sm text-gray-400">No hay ordenes registradas</p>
          </div>
        ) : (
          <div className="space-y-3">
            {ordenes.map((o) => (
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
