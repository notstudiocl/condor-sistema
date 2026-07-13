import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  Send,
  Check,
  Truck,
  Wallet,
  Mail,
  MessageCircle,
  CheckCircle2,
  XCircle,
  X,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  AlertCircle,
} from 'lucide-react';
import EstadoBadge from '../components/EstadoBadge';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import { SkeletonText } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { formatCLP, formatFecha, formatHora, formatDuracion, formatRut } from '../utils/format';
import { ESTADOS } from '../utils/constants';
import { getOrden, getNotificacionesOrden, reenviarOrden, cambiarEstadoOrden } from '../utils/api';

function PhotoViewer({ open, onClose, fotos, index, setIndex }) {
  if (!open) return null;
  const foto = fotos[index];
  return (
    <div className="fixed inset-0 z-[150] bg-black/90 flex items-center justify-center">
      <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white p-2">
        <X size={22} />
      </button>
      {fotos.length > 1 && (
        <button
          onClick={() => setIndex((i) => (i - 1 + fotos.length) % fotos.length)}
          className="absolute left-4 text-white/70 hover:text-white p-2"
        >
          <ChevronLeft size={28} />
        </button>
      )}
      {foto?.url ? (
        <img src={foto.url} alt={foto.label} className="max-w-[90vw] max-h-[80vh] rounded-xl object-contain" />
      ) : (
        <div className="w-72 h-72 rounded-xl flex items-center justify-center bg-gray-800">
          <div className="text-center text-gray-400">
            <ImageOff size={32} className="mx-auto mb-2" />
            <p className="text-sm">No se pudo cargar la imagen</p>
          </div>
        </div>
      )}
      {fotos.length > 1 && (
        <button
          onClick={() => setIndex((i) => (i + 1) % fotos.length)}
          className="absolute right-4 text-white/70 hover:text-white p-2"
        >
          <ChevronRight size={28} />
        </button>
      )}
      <span className="absolute bottom-5 text-white/60 text-xs">
        {foto?.label} · {index + 1} / {fotos.length}
      </span>
    </div>
  );
}

function buildTimeline(estado) {
  const idxActual = ESTADOS.indexOf(estado);
  return ESTADOS.map((e, i) => ({ estado: e, hecho: i <= idxActual }));
}

export default function OrdenDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [orden, setOrden] = useState(null);
  const [notificaciones, setNotificaciones] = useState([]);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [confirmReenviar, setConfirmReenviar] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [confirmEstado, setConfirmEstado] = useState(null);

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const [ordenRes, notifRes] = await Promise.all([
        getOrden(id),
        getNotificacionesOrden(id).catch(() => ({ data: [] })),
      ]);
      setOrden(ordenRes.data);
      setNotificaciones(notifRes.data || []);
    } catch (err) {
      setError(err.message || 'No se pudo cargar la orden');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fotos = useMemo(() => {
    if (!orden) return [];
    return (orden.fotos || [])
      .filter((f) => f.tipo === 'antes' || f.tipo === 'despues')
      .map((f) => ({ ...f, label: f.tipo === 'antes' ? 'Antes' : 'Después' }));
  }, [orden]);

  const pdfFoto = useMemo(() => (orden?.fotos || []).find((f) => f.tipo === 'pdf'), [orden]);

  if (loading) {
    return (
      <div className="card p-6">
        <SkeletonText lines={8} />
      </div>
    );
  }

  if (error || !orden) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Orden no encontrada"
        description={error || `No existe una orden con id ${id}.`}
        actionLabel="Volver a Órdenes"
        onAction={() => navigate('/ordenes')}
      />
    );
  }

  const openViewer = (i) => {
    setViewerIndex(i);
    setViewerOpen(true);
  };

  const handleReenviar = async () => {
    setReenviando(true);
    try {
      const res = await reenviarOrden(orden.id);
      setConfirmReenviar(false);
      if (res.data?.webhookOk) {
        addToast('PDF regenerado y notificaciones reenviadas.', { type: 'success' });
      } else {
        addToast(`Orden reenviada, pero el PDF quedó pendiente: ${res.data?.webhookError || 'error desconocido'}`, { type: 'error' });
      }
      cargar();
    } catch (err) {
      addToast(`No se pudo reenviar: ${err.message}`, { type: 'error' });
    } finally {
      setReenviando(false);
    }
  };

  const handleCambiarEstado = async () => {
    const nuevoEstado = confirmEstado;
    const anterior = orden.estado;
    try {
      await cambiarEstadoOrden(orden.id, nuevoEstado);
      setOrden((prev) => ({ ...prev, estado: nuevoEstado }));
      addToast(`Estado actualizado a "${nuevoEstado}".`, {
        type: 'success',
        actionLabel: 'Deshacer',
        onAction: async () => {
          try {
            await cambiarEstadoOrden(orden.id, anterior);
            setOrden((prev) => ({ ...prev, estado: anterior }));
            addToast('Se deshizo el cambio de estado.', { type: 'info' });
          } catch (err) {
            addToast(`No se pudo deshacer: ${err.message}`, { type: 'error' });
          }
        },
      });
    } catch (err) {
      addToast(`No se pudo cambiar el estado: ${err.message}`, { type: 'error' });
    } finally {
      setConfirmEstado(null);
    }
  };

  const timeline = buildTimeline(orden.estado);
  const trabajos = orden.trabajos || [];
  const empleados = orden.empleados || [];

  return (
    <div className="space-y-5 pb-10">
      {/* Header sticky con acciones */}
      <div className="sticky top-16 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-gray-50/95 backdrop-blur border-b border-gray-200 flex flex-wrap items-center gap-3">
        <button
          onClick={() => navigate('/ordenes')}
          className="p-2 -ml-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <p className="font-heading font-bold text-lg text-gray-900">OT-{orden.numero_orden_display}</p>
          <p className="text-xs text-gray-400">{formatFecha(orden.fecha)}</p>
        </div>
        <EstadoBadge estado={orden.estado} solido />

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <select
            value=""
            onChange={(e) => e.target.value && setConfirmEstado(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-condor-400"
          >
            <option value="">Cambiar estado...</option>
            {ESTADOS.filter((e) => e !== orden.estado).map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          {pdfFoto && (
            <a href={pdfFoto.url} target="_blank" rel="noopener noreferrer" className="btn-secondary">
              <FileText size={15} /> Ver PDF
            </a>
          )}
          <button onClick={() => setConfirmReenviar(true)} className="btn-primary">
            <Send size={15} /> Reenviar
          </button>
        </div>
      </div>

      {/* Timeline de estados */}
      <div className="card p-5">
        <div className="flex items-center overflow-x-auto">
          {timeline.map((step, i) => (
            <div key={step.estado} className="flex items-center flex-1 min-w-[110px] last:flex-initial">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    step.hecho ? 'bg-condor-900 text-white' : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {step.hecho ? <Check size={14} /> : i + 1}
                </div>
                <span className={`text-[11px] text-center leading-tight ${step.hecho ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                  {step.estado}
                </span>
              </div>
              {i < timeline.length - 1 && (
                <div className={`h-0.5 flex-1 mx-1 ${timeline[i + 1].hecho ? 'bg-condor-900' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-5">
          {/* Trabajo */}
          <div className="card p-5">
            <h2 className="font-heading font-semibold text-gray-900 mb-4">Trabajo realizado</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Inicio</p>
                <p className="font-medium text-gray-800">{formatHora(orden.hora_inicio)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Término</p>
                <p className="font-medium text-gray-800">{formatHora(orden.hora_termino)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Duración</p>
                <p className="font-medium text-gray-800">{formatDuracion(orden.hora_inicio, orden.hora_termino)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Patente</p>
                <p className="font-medium text-gray-800 font-mono">{orden.patente_vehiculo || '—'}</p>
              </div>
            </div>
            {trabajos.length > 0 && (
              <div className="space-y-1.5 mb-4">
                {trabajos.map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-gray-700">{t.servicio_nombre || t.nombre_personalizado}</span>
                    <span className="text-xs font-semibold text-gray-500">x{t.cantidad}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-sm text-gray-600 leading-relaxed">{orden.descripcion_trabajo || 'Sin descripción.'}</p>
            {orden.observaciones && (
              <div className="mt-3 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">Observaciones</p>
                <p className="text-sm text-amber-800">{orden.observaciones}</p>
              </div>
            )}
          </div>

          {/* Fotos */}
          <div className="card p-5">
            <h2 className="font-heading font-semibold text-gray-900 mb-4">Evidencia fotográfica</h2>
            {fotos.length === 0 ? (
              <p className="text-sm text-gray-400">Esta orden no tiene fotos registradas.</p>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {fotos.map((f, i) => (
                  <button
                    key={f.id}
                    onClick={() => openViewer(i)}
                    className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 hover:ring-2 hover:ring-condor-400 transition-all group"
                  >
                    {f.url ? (
                      <img src={f.url} alt={f.label} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                        <ImageOff size={20} />
                      </div>
                    )}
                    <span className="absolute bottom-1 left-1 text-[10px] font-semibold bg-black/40 text-white rounded px-1.5 py-0.5">
                      {f.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notificaciones */}
          <div className="card p-5">
            <h2 className="font-heading font-semibold text-gray-900 mb-4">Notificaciones de esta orden</h2>
            {notificaciones.length === 0 ? (
              <p className="text-sm text-gray-400">Todavía no se ha enviado ninguna notificación para esta orden.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {notificaciones.map((n) => (
                  <div key={n.id} className="flex items-center gap-3 py-3">
                    <div className={`shrink-0 rounded-lg p-2 ${n.ok ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-500'}`}>
                      {n.canal === 'resend' ? <Mail size={16} /> : <MessageCircle size={16} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {n.canal === 'resend' ? 'Email' : 'Telegram'} · {n.destinatario || '—'}
                      </p>
                      <p className="text-xs text-gray-400">
                        Plantilla: {n.plantilla || '—'} · {formatFecha(n.sent_at)}
                      </p>
                    </div>
                    {n.ok ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                        <CheckCircle2 size={14} /> Entregado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500" title={n.error}>
                        <XCircle size={14} /> Falló
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Lateral */}
        <div className="space-y-5">
          <div className="card p-5">
            <h2 className="font-heading font-semibold text-gray-900 mb-3">Cliente</h2>
            <p className="text-sm font-medium text-gray-800">{orden.cliente_empresa || orden.supervisor || 'Sin cliente'}</p>
            <p className="text-sm text-gray-500">{orden.supervisor}</p>
            <div className="mt-3 space-y-1.5 text-sm text-gray-500">
              <p className="font-mono">{formatRut(orden.cliente?.rut)}</p>
              <p>{orden.cliente_email || 'Sin email'}</p>
              <p>{orden.cliente_telefono || 'Sin teléfono'}</p>
              <p>{orden.direccion}, {orden.comuna}</p>
              {orden.orden_compra && <p>OC: {orden.orden_compra}</p>}
              {orden.cliente_id && (
                <button
                  onClick={() => navigate(`/clientes?ficha=${orden.cliente_id}`)}
                  className="text-xs font-semibold text-condor-700 hover:text-condor-900"
                >
                  Ver ficha del cliente →
                </button>
              )}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-heading font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Wallet size={16} className="text-gray-400" /> Pago
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Total</span>
                <span className="font-semibold text-gray-900">{formatCLP(orden.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Método</span>
                <span className="text-gray-800">{orden.metodo_pago || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Garantía</span>
                <span className="text-gray-800">{orden.garantia || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Factura</span>
                <span className="text-gray-800">{orden.requiere_factura ? 'Sí' : 'No'}</span>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-heading font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Truck size={16} className="text-gray-400" /> Equipo
            </h2>
            {empleados.length === 0 ? (
              <p className="text-sm text-gray-400">Sin personal asignado.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {empleados.map((t) => (
                  <span key={t.id} className="text-xs font-medium bg-condor-50 text-condor-800 rounded-full px-2.5 py-1">
                    {t.nombre}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <PhotoViewer open={viewerOpen} onClose={() => setViewerOpen(false)} fotos={fotos} index={viewerIndex} setIndex={setViewerIndex} />

      <ConfirmDialog
        open={confirmReenviar}
        onClose={() => setConfirmReenviar(false)}
        onConfirm={handleReenviar}
        loading={reenviando}
        title="Reenviar orden"
        message="Se regenerará el PDF y se reenviarán las notificaciones de esta orden (email al cliente, email interno y Telegram)."
        confirmLabel="Reenviar"
      />

      <ConfirmDialog
        open={!!confirmEstado}
        onClose={() => setConfirmEstado(null)}
        onConfirm={handleCambiarEstado}
        title="Cambiar estado de la orden"
        message={`¿Confirmas cambiar el estado de OT-${orden.numero_orden_display} a "${confirmEstado}"?`}
        confirmLabel="Cambiar estado"
      />
    </div>
  );
}
