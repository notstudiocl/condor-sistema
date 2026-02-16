import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, RefreshCw, Loader2, FileText, ChevronRight } from 'lucide-react';
import { formatCLP } from '../utils/helpers';

const API_URL = (import.meta.env.VITE_API_URL || 'https://clientes-condor-api.f8ihph.easypanel.host/api').replace(/\/api\/?$/, '');

function EstadoBadge({ estado }) {
  const styles = {
    Enviada: 'bg-blue-100 text-blue-700',
    Completada: 'bg-green-100 text-green-700',
    Error: 'bg-red-100 text-red-700',
    Pendiente: 'bg-amber-100 text-amber-700',
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${styles[estado] || 'bg-gray-100 text-gray-600'}`}>
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
          className="w-full bg-accent-600 hover:bg-accent-700 text-white font-bold rounded-2xl py-4 text-base transition-colors flex items-center justify-center gap-2 shadow-lg mb-6"
        >
          <Plus size={22} />
          Nueva Orden de Trabajo
        </button>

        {/* Header historial */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading font-bold text-lg text-condor-900">Historial de Ordenes</h2>
          <button
            onClick={cargarOrdenes}
            disabled={loading}
            className="text-condor-600 hover:text-condor-800 p-2 rounded-xl hover:bg-condor-50 transition-colors"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
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
            <FileText size={48} className="text-gray-300 mb-3" />
            <p className="text-sm text-gray-400">No hay ordenes registradas</p>
          </div>
        ) : (
          <div className="space-y-3">
            {ordenes.map((o) => {
              let trabajos = [];
              try { trabajos = typeof o.trabajos === 'string' ? JSON.parse(o.trabajos) : o.trabajos || []; } catch { trabajos = []; }
              const trabajosActivos = trabajos.filter(t => t.cantidad > 0);

              return (
                <button
                  key={o.recordId}
                  onClick={() => navigate(`/orden/${o.recordId}`)}
                  className="w-full bg-white rounded-2xl border border-gray-200 p-4 shadow-sm hover:border-condor-300 hover:shadow-md transition-all text-left"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="text-sm font-bold text-condor-900">{o.numeroOrden || 'Sin numero'}</span>
                      <span className="text-xs text-gray-400 ml-2">{o.fecha}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <EstadoBadge estado={o.estado} />
                      <ChevronRight size={16} className="text-gray-300" />
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 font-medium">{o.cliente || 'Sin cliente'}</p>
                  <p className="text-xs text-gray-400">{o.direccion}{o.comuna ? `, ${o.comuna}` : ''}</p>
                  {trabajosActivos.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      {trabajosActivos.map(t => `${t.trabajo || t.nombre} x${t.cantidad}`).join(', ')}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                    <span className="text-xs text-gray-400">{o.metodoPago}</span>
                    <span className="text-sm font-bold text-condor-900">{formatCLP(o.total)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
