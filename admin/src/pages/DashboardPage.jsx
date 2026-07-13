import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Clock, Wallet, TrendingUp, ArrowUpRight, AlertCircle } from 'lucide-react';
import KpiCard from '../components/KpiCard';
import EstadoBadge from '../components/EstadoBadge';
import EmptyState from '../components/EmptyState';
import { SkeletonCard, SkeletonText } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { formatCLP, formatFecha } from '../utils/format';
import { getDashboardKpis, listOrdenes, cambiarEstadoOrden } from '../utils/api';

const DIAS_LABEL = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// Silueta de barras semanales en SVG puro (sin librería de charts — volumen chico, spec lo pide a mano).
function WeeklyBars({ data }) {
  const max = Math.max(...data.map((d) => d.cantidad), 1);
  const barW = 34;
  const gap = 18;
  const chartH = 120;
  const topPad = 22; // espacio para el número sobre la barra más alta, evita que se corte
  const width = data.length * (barW + gap);

  return (
    <svg width="100%" height={chartH + topPad + 26} viewBox={`0 0 ${width} ${chartH + topPad + 26}`} className="max-w-full">
      {data.map((d, i) => {
        const h = Math.max((d.cantidad / max) * chartH, 4);
        const x = i * (barW + gap);
        const y = topPad + (chartH - h);
        return (
          <g key={d.dia}>
            <rect x={x} y={y} width={barW} height={h} rx={6} className="fill-condor-500" />
            <text x={x + barW / 2} y={topPad + chartH + 16} textAnchor="middle" className="fill-gray-500 text-[11px]">
              {d.dia}
            </text>
            <text x={x + barW / 2} y={y - 6} textAnchor="middle" className="fill-gray-700 text-[11px] font-semibold">
              {d.cantidad}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [kpis, setKpis] = useState(null);
  const [ultimasOrdenes, setUltimasOrdenes] = useState([]);
  const [pendientes, setPendientes] = useState([]);

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const [kpisRes, ordenesRes] = await Promise.all([getDashboardKpis(), listOrdenes({ limit: 6 })]);
      setKpis(kpisRes.data);
      setPendientes(kpisRes.data.pendientesFacturarAntiguas || []);
      setUltimasOrdenes(ordenesRes.data.ordenes || []);
    } catch (err) {
      setError(err.message || 'No se pudo cargar el dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const handleMarcarFacturada = async (orden) => {
    const estadoAnterior = orden.estado;
    setPendientes((prev) => prev.filter((o) => o.id !== orden.id));
    try {
      await cambiarEstadoOrden(orden.id, 'Facturada');
      addToast(`OT-${orden.numero_orden_display} marcada como Facturada.`, {
        type: 'success',
        actionLabel: 'Deshacer',
        onAction: async () => {
          try {
            await cambiarEstadoOrden(orden.id, estadoAnterior);
            addToast(`Se deshizo el cambio de OT-${orden.numero_orden_display}.`, { type: 'info' });
            cargar();
          } catch (err) {
            addToast(`No se pudo deshacer: ${err.message}`, { type: 'error' });
          }
        },
      });
    } catch (err) {
      addToast(`No se pudo marcar como facturada: ${err.message}`, { type: 'error' });
      cargar();
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="card p-5">
          <SkeletonText lines={4} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="No se pudo cargar el dashboard"
        description={error}
        actionLabel="Reintentar"
        onAction={cargar}
      />
    );
  }

  const ordenesPorDia = (kpis.ordenesPorDia || []).map((d, i) => ({ dia: DIAS_LABEL[i] || '?', cantidad: d.cantidad }));
  const topServicios = kpis.topServicios || [];
  const maxServicio = topServicios[0]?.usos || 1;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Órdenes hoy"
          value={kpis.hoy.cantidad}
          sublabel={formatCLP(kpis.hoy.total)}
          icon={ClipboardList}
        />
        <KpiCard
          label="Órdenes esta semana"
          value={kpis.semana.cantidad}
          sublabel={formatCLP(kpis.semana.total)}
          icon={TrendingUp}
        />
        <KpiCard
          label="Por facturar"
          value={formatCLP(kpis.porFacturar.total)}
          sublabel={`${kpis.porFacturar.cantidad} órdenes`}
          icon={Wallet}
          highlight
          onClick={() => navigate('/ordenes?estado=Facturacion+pendiente')}
        />
        <KpiCard
          label="Facturado este mes"
          value={formatCLP(kpis.facturadoMes.total)}
          sublabel={`${kpis.facturadoMes.cantidad} órdenes`}
          icon={Clock}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Barras semanales */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-semibold text-gray-900">Órdenes por día — esta semana</h2>
          </div>
          <WeeklyBars data={ordenesPorDia} />
        </div>

        {/* Top servicios del mes */}
        <div className="card p-5">
          <h2 className="font-heading font-semibold text-gray-900 mb-4">Top servicios del mes</h2>
          {topServicios.length === 0 ? (
            <p className="text-sm text-gray-400">Sin servicios registrados este mes.</p>
          ) : (
            <div className="space-y-3">
              {topServicios.map((s, i) => (
                <div key={s.nombre}>
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span className="truncate pr-2">
                      {i + 1}. {s.nombre}
                    </span>
                    <span className="font-semibold shrink-0">{s.usos}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-condor-500 rounded-full"
                      style={{ width: `${(s.usos / maxServicio) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Últimas órdenes */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-heading font-semibold text-gray-900">Últimas órdenes</h2>
            <button
              onClick={() => navigate('/ordenes')}
              className="text-xs font-semibold text-condor-700 hover:text-condor-900 inline-flex items-center gap-1"
            >
              Ver todas <ArrowUpRight size={13} />
            </button>
          </div>
          {ultimasOrdenes.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400 text-center">Todavía no hay órdenes registradas.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {ultimasOrdenes.map((o) => (
                <button
                  key={o.id}
                  onClick={() => navigate(`/ordenes/${o.id}`)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      OT-{o.numero_orden_display} · {o.cliente_empresa || o.supervisor || 'Sin cliente'}
                    </p>
                    <p className="text-xs text-gray-400">{formatFecha(o.fecha)}</p>
                  </div>
                  <EstadoBadge estado={o.estado} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Pendientes de facturar más antiguas */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-heading font-semibold text-gray-900">Pendientes de facturar más antiguas</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {pendientes.length === 0 && (
              <p className="px-5 py-6 text-sm text-gray-400 text-center">No hay órdenes pendientes de facturar.</p>
            )}
            {pendientes.map((o) => {
              const dias = o.dias ?? 0;
              const critica = dias > 14;
              return (
                <div key={o.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <button onClick={() => navigate(`/ordenes/${o.id}`)} className="min-w-0 text-left flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      OT-{o.numero_orden_display} · {o.cliente_empresa || o.supervisor || 'Sin cliente'}
                    </p>
                    <p className={`text-xs flex items-center gap-1 ${critica ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                      {critica && <AlertCircle size={12} />}
                      Hace {dias} día{dias === 1 ? '' : 's'} · {formatCLP(o.total)}
                    </p>
                  </button>
                  <button
                    onClick={() => handleMarcarFacturada(o)}
                    className="shrink-0 text-xs font-semibold text-white bg-condor-900 hover:bg-condor-800 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    Marcar facturada
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
