import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Clock, Droplets, TrendingUp, ArrowUpRight, AlertCircle, Users, Building2, ImageOff, FileX } from 'lucide-react';
import KpiCard from '../components/KpiCard';
import EstadoBadge from '../components/EstadoBadge';
import EmptyState from '../components/EmptyState';
import { SkeletonCard, SkeletonText } from '../components/Skeleton';
import { formatFecha, formatRut } from '../utils/format';
import { getDashboardKpis, listOrdenes } from '../utils/api';

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

// Variación porcentual con signo; null cuando no hay base de comparación.
function variacion(actual, anterior) {
  if (!anterior) return null;
  return Math.round(((actual - anterior) / anterior) * 100);
}
function Delta({ actual, anterior, sufijo }) {
  const v = variacion(actual, anterior);
  if (v === null) return null;
  const tone = v > 0 ? 'bg-emerald-50 text-emerald-700' : v < 0 ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600';
  return <span className={`ml-2 align-middle text-xs font-semibold px-2 py-0.5 rounded-full ${tone}`}>{v > 0 ? '+' : ''}{v} %{sufijo ? ` ${sufijo}` : ''}</span>;
}
function minutosATexto(min) {
  if (!min && min !== 0) return '—';
  const h = Math.floor(min / 60); const m = min % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}
function Barras({ items, max, onClick, sub }) {
  return (
    <div className="space-y-2.5">
      {items.map((it) => (
        <button key={it.key} type="button" onClick={onClick ? () => onClick(it) : undefined} disabled={!onClick}
          className={`w-full text-left ${onClick ? 'hover:bg-gray-50 rounded-lg -mx-1 px-1' : 'cursor-default'}`}>
          <div className="flex justify-between text-xs text-gray-600 mb-1 gap-2">
            <span className="truncate">{it.nombre}{sub && sub(it) ? <span className="text-gray-400"> · {sub(it)}</span> : null}</span>
            <span className="font-semibold shrink-0 tabular-nums">{it.valor}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-condor-500 rounded-full" style={{ width: `${Math.max((it.valor / (max || 1)) * 100, 2)}%` }} />
          </div>
        </button>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [kpis, setKpis] = useState(null);
  const [ultimasOrdenes, setUltimasOrdenes] = useState([]);

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const [kpisRes, ordenesRes] = await Promise.all([getDashboardKpis(), listOrdenes({ limit: 6 })]);
      setKpis(kpisRes.data);
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

  const ordenesPorDia = (kpis.ordenesPorDia || []).map((d) => ({ dia: DIAS_LABEL[(d.dow || 1) - 1] || '?', cantidad: d.cantidad }));
  const topServicios = kpis.topServicios || [];
  const porTecnico = kpis.porTecnico || [];
  const topClientes = kpis.topClientes?.clientes || [];
  const totalClientes = kpis.topClientes?.total || 0;
  const problemas = kpis.problemas?.ordenes || [];
  const resumen = kpis.problemas?.resumen || {};
  const ritmoMes = kpis.dia_del_mes ? Math.round((kpis.mes_actual / kpis.dia_del_mes) * kpis.dias_del_mes) : null;

  return (
    <div className="space-y-6">
      {/* KPIs de operación: Condor registra el trabajo, no la plata (ninguna orden trae monto) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Órdenes esta semana"
          value={<>{kpis.semana_actual}<Delta actual={kpis.semana_actual} anterior={kpis.semana_anterior_misma_altura} /></>}
          sublabel={`${kpis.semana_anterior_misma_altura} a esta altura la sem. pasada`}
          icon={ClipboardList}
          onClick={() => navigate('/ordenes')}
        />
        <KpiCard
          label="Órdenes este mes"
          value={<>{kpis.mes_actual}<Delta actual={kpis.mes_actual} anterior={kpis.mes_anterior_misma_altura} /></>}
          sublabel={`ritmo ≈${ritmoMes ?? '—'} · mes anterior ${kpis.mes_anterior}`}
          icon={TrendingUp}
        />
        <KpiCard
          label="Hidrojet este mes"
          value={`${kpis.hidrojet_horas_mes} h`}
          sublabel={`en ${kpis.hidrojet_ordenes_mes} ${kpis.hidrojet_ordenes_mes === 1 ? 'orden' : 'órdenes'}`}
          icon={Droplets}
        />
        <KpiCard
          label="Duración típica"
          value={minutosATexto(kpis.duracion_mediana_min)}
          sublabel={`promedio ${minutosATexto(kpis.duracion_promedio_min)} · 90 días`}
          icon={Clock}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4 sm:p-5 min-w-0">
          <h2 className="font-heading font-semibold text-gray-900 flex items-center gap-2 mb-1"><Users size={16} className="text-gray-400" /> Órdenes por técnico</h2>
          <p className="text-xs text-gray-400 mb-4">Últimos 30 días</p>
          {porTecnico.length === 0 ? <p className="text-sm text-gray-400">Sin órdenes en el período.</p> : (
            <Barras items={porTecnico.map((t) => ({ key: t.id, nombre: t.nombre, valor: t.ordenes, ultima: t.ultima }))} max={porTecnico[0]?.ordenes}
              onClick={(it) => navigate(`/usuarios/${it.key}`)} sub={(it) => `última ${formatFecha(it.ultima)}`} />
          )}
        </div>
        <div className="card p-4 sm:p-5 min-w-0">
          <h2 className="font-heading font-semibold text-gray-900 flex items-center gap-2 mb-1"><Building2 size={16} className="text-gray-400" /> Clientes con más órdenes</h2>
          <p className="text-xs text-gray-400 mb-4">Últimos 90 días · {totalClientes} órdenes · agrupado por RUT</p>
          {topClientes.length === 0 ? <p className="text-sm text-gray-400">Sin órdenes en el período.</p> : (
            <Barras items={topClientes.map((c) => ({ key: c.clave, nombre: c.nombre, valor: c.ordenes, rut: c.rut, cliente_id: c.cliente_id, pct: totalClientes ? Math.round((c.ordenes / totalClientes) * 100) : 0 }))}
              max={topClientes[0]?.ordenes} onClick={(it) => it.cliente_id && navigate(`/clientes/${it.cliente_id}`)}
              sub={(it) => `${it.pct} %${it.rut ? ` · ${formatRut(it.rut)}` : ''}`} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4 sm:p-5 lg:col-span-2 min-w-0">
          <h2 className="font-heading font-semibold text-gray-900 mb-1">Órdenes por día de la semana</h2>
          <p className="text-xs text-gray-400 mb-4">Acumulado de los últimos 6 meses</p>
          <WeeklyBars data={ordenesPorDia} />
        </div>
        <div className="card p-4 sm:p-5 min-w-0">
          <h2 className="font-heading font-semibold text-gray-900 mb-1">Top servicios del mes</h2>
          <p className="text-xs text-gray-400 mb-4">Cantidad registrada (horas, evacuaciones, etc.)</p>
          {topServicios.length === 0 ? <p className="text-sm text-gray-400">Sin servicios registrados este mes.</p> : (
            <Barras items={topServicios.map((s) => ({ key: s.nombre, nombre: s.nombre, valor: s.usos, ordenes: s.ordenes }))} max={topServicios[0]?.usos}
              sub={(it) => `${it.ordenes} ${it.ordenes === 1 ? 'orden' : 'órdenes'}`} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Órdenes con problemas — reemplaza "pendientes de facturar" (estado que nunca se usa) */}
        <div className="card">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-gray-100">
            <h2 className="font-heading font-semibold text-gray-900">Órdenes con problemas</h2>
            <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
              <span className={`px-2 py-0.5 rounded-full ${resumen.sin_pdf ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-500'}`}>{resumen.sin_pdf ?? 0} sin PDF</span>
              <span className={`px-2 py-0.5 rounded-full ${resumen.sin_fotos ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{resumen.sin_fotos ?? 0} sin fotos</span>
              {resumen.notif_fallidas_7d > 0 && <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700">{resumen.notif_fallidas_7d} avisos fallidos</span>}
              {resumen.jobs_fallidos > 0 && <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700">{resumen.jobs_fallidos} en cola con error</span>}
            </div>
          </div>
          {problemas.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400 text-center">Todo en orden: todas las órdenes tienen PDF y fotos.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {problemas.map((o) => (
                <button key={o.id} onClick={() => navigate(`/ordenes/${o.id}`)} className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-gray-50 transition-colors text-left">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">OT-{o.numero_orden_display} · {o.cliente_empresa || o.supervisor || 'Sin cliente'}</p>
                    <p className="text-xs text-gray-400">{formatFecha(o.fecha)} · hace {o.dias} {o.dias === 1 ? 'día' : 'días'}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {o.sin_pdf && <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700"><FileX size={11} /> Sin PDF</span>}
                    {o.sin_fotos && <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700"><ImageOff size={11} /> Sin fotos</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Últimas órdenes */}
        <div className="card">
          <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-gray-100">
            <h2 className="font-heading font-semibold text-gray-900">Últimas órdenes</h2>
            <button onClick={() => navigate('/ordenes')} className="text-xs font-semibold text-condor-700 hover:text-condor-900 inline-flex items-center gap-1">
              Ver todas <ArrowUpRight size={13} />
            </button>
          </div>
          {ultimasOrdenes.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400 text-center">Todavía no hay órdenes registradas.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {ultimasOrdenes.map((o) => (
                <button key={o.id} onClick={() => navigate(`/ordenes/${o.id}`)} className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-gray-50 transition-colors text-left">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">OT-{o.numero_orden_display} · {o.cliente_empresa || o.supervisor || 'Sin cliente'}</p>
                    <p className="text-xs text-gray-400">{formatFecha(o.fecha)}{o.tecnicos ? ` · ${o.tecnicos}` : ''}</p>
                  </div>
                  <EstadoBadge estado={o.estado} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
