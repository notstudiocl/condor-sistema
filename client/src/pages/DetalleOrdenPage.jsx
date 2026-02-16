import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, RotateCcw, FileText, X } from 'lucide-react';
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
    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${styles[estado] || 'bg-gray-400 text-white'}`}>
      {estado}
    </span>
  );
}

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right max-w-[60%]">{value}</span>
    </div>
  );
}

function PhotoViewer({ fotos, initialIndex, onClose }) {
  const [index, setIndex] = useState(initialIndex);
  const foto = fotos[index];

  const handlePrev = () => setIndex((i) => (i > 0 ? i - 1 : fotos.length - 1));
  const handleNext = () => setIndex((i) => (i < fotos.length - 1 ? i + 1 : 0));

  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between p-4">
        <span className="text-white/60 text-sm">{index + 1} / {fotos.length}</span>
        <button onClick={onClose} className="p-2 text-white/80 hover:text-white">
          <X size={24} />
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center px-4" onClick={(e) => e.stopPropagation()}>
        <img src={foto.url} alt="" className="max-w-full max-h-full object-contain" />
      </div>
      {fotos.length > 1 && (
        <div className="flex justify-center gap-6 p-4" onClick={(e) => e.stopPropagation()}>
          <button onClick={handlePrev} className="px-6 py-3 bg-white/10 text-white rounded-xl text-sm font-medium active:bg-white/20">
            Anterior
          </button>
          <button onClick={handleNext} className="px-6 py-3 bg-white/10 text-white rounded-xl text-sm font-medium active:bg-white/20">
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}

export default function DetalleOrdenPage() {
  const { recordId } = useParams();
  const navigate = useNavigate();
  const [orden, setOrden] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reenviando, setReenviando] = useState(false);
  const [reenvioMsg, setReenvioMsg] = useState(null);
  const [viewerFotos, setViewerFotos] = useState(null);
  const [viewerIndex, setViewerIndex] = useState(0);

  useEffect(() => {
    const cargar = async () => {
      try {
        const res = await fetch(`${API_URL}/api/ordenes`);
        const data = await res.json();
        const found = (data.data || []).find(o => o.recordId === recordId);
        setOrden(found || null);
      } catch {
        setOrden(null);
      } finally {
        setLoading(false);
      }
    };
    cargar();
  }, [recordId]);

  const handleReenviar = async () => {
    if (reenviando) return;
    setReenviando(true);
    setReenvioMsg(null);
    try {
      const res = await fetch(`${API_URL}/api/ordenes/${recordId}/reenviar`, { method: 'POST' });
      const result = await res.json();
      if (result?.data?.webhookOk) {
        setReenvioMsg({ ok: true, text: 'Orden reenviada correctamente' });
      } else {
        setReenvioMsg({ ok: false, text: result?.data?.webhookError || 'Error al reenviar' });
      }
    } catch (err) {
      setReenvioMsg({ ok: false, text: err.message });
    } finally {
      setReenviando(false);
    }
  };

  const openViewer = (fotos, index) => {
    setViewerFotos(fotos);
    setViewerIndex(index);
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-condor-400" />
      </div>
    );
  }

  if (!orden) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex flex-col items-center justify-center p-4">
        <p className="text-gray-400 mb-4">Orden no encontrada</p>
        <button onClick={() => navigate('/')} className="btn-secondary px-4 py-2 rounded-xl">Volver</button>
      </div>
    );
  }

  let trabajos = [];
  try { trabajos = typeof orden.trabajos === 'string' ? JSON.parse(orden.trabajos) : orden.trabajos || []; } catch { trabajos = []; }
  const trabajosActivos = trabajos.filter(t => t.cantidad > 0);
  const hasPdf = orden.pdf && orden.pdf.length > 0;

  return (
    <div className="min-h-[calc(100vh-56px)] bg-gray-50">
      <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/')} className="p-2.5 rounded-xl hover:bg-gray-200 active:bg-gray-300 transition-colors">
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <div className="flex-1">
            <h1 className="font-heading font-bold text-lg text-condor-900">{orden.numeroOrden || 'Orden'}</h1>
            <p className="text-xs text-gray-400">{orden.fecha}</p>
          </div>
          <EstadoBadge estado={orden.estado} />
        </div>

        {/* Información del Cliente */}
        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm mb-3">
          <h3 className="font-heading font-semibold text-condor-900 mb-2">Información del Cliente</h3>
          <Field label="Cliente / Empresa" value={orden.clienteEmpresa} />
          <Field label="Supervisor / Encargado" value={orden.supervisor} />
          <Field label="Email" value={orden.email} />
          <Field label="Teléfono" value={orden.telefono} />
          <Field label="Dirección" value={orden.direccion} />
          <Field label="Comuna" value={orden.comuna} />
          <Field label="Orden de Compra" value={orden.ordenCompra} />
        </div>

        {/* Trabajo */}
        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm mb-3">
          <h3 className="font-heading font-semibold text-condor-900 mb-2">Trabajo</h3>
          {(orden.horaInicio || orden.horaTermino) && (
            <div className="flex gap-2 mb-2">
              {orden.horaInicio && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">Inicio: {orden.horaInicio}</span>}
              {orden.horaTermino && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">Término: {orden.horaTermino}</span>}
            </div>
          )}
          {trabajosActivos.length > 0 ? (
            <div className="space-y-1 mb-2">
              {trabajosActivos.map((t, i) => (
                <div key={i} className="flex justify-between py-1 border-b border-gray-100 last:border-0">
                  <span className="text-sm text-gray-700">{t.trabajo || t.nombre}</span>
                  <span className="text-sm font-semibold text-accent-700 bg-accent-50 px-2 rounded">x{t.cantidad}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 mb-2">Sin trabajos</p>
          )}
          <Field label="Descripción" value={orden.descripcion} />
          <Field label="Observaciones" value={orden.observaciones} />
        </div>

        {/* Equipo */}
        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm mb-3">
          <h3 className="font-heading font-semibold text-condor-900 mb-2">Equipo</h3>
          <Field label="Patente" value={orden.patente} />
        </div>

        {/* Pago */}
        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm mb-3">
          <h3 className="font-heading font-semibold text-condor-900 mb-2">Pago</h3>
          <Field label="Total" value={formatCLP(orden.total)} />
          <Field label="Método de Pago" value={orden.metodoPago} />
          <Field label="Requiere Factura" value={orden.requiereFactura} />
        </div>

        {/* Fotos Antes */}
        {orden.fotosAntes && orden.fotosAntes.length > 0 && (
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm mb-3">
            <h3 className="font-heading font-semibold text-condor-900 mb-2">Fotos Antes ({orden.fotosAntes.length})</h3>
            <div className="grid grid-cols-3 gap-2">
              {orden.fotosAntes.map((f, i) => (
                <button
                  key={i}
                  onClick={() => openViewer(orden.fotosAntes, i)}
                  className="aspect-square rounded-xl overflow-hidden bg-gray-100"
                >
                  <img src={f.url} alt={`Antes ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Fotos Después */}
        {orden.fotosDespues && orden.fotosDespues.length > 0 && (
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm mb-3">
            <h3 className="font-heading font-semibold text-condor-900 mb-2">Fotos Después ({orden.fotosDespues.length})</h3>
            <div className="grid grid-cols-3 gap-2">
              {orden.fotosDespues.map((f, i) => (
                <button
                  key={i}
                  onClick={() => openViewer(orden.fotosDespues, i)}
                  className="aspect-square rounded-xl overflow-hidden bg-gray-100"
                >
                  <img src={f.url} alt={`Después ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Firma */}
        {orden.firma && orden.firma.length > 0 && (
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm mb-3">
            <h3 className="font-heading font-semibold text-condor-900 mb-2">Firma</h3>
            <div className="w-48 h-24 border border-gray-200 rounded-lg overflow-hidden bg-white">
              <img src={orden.firma[0].url} alt="Firma" className="w-full h-full object-contain" />
            </div>
          </div>
        )}

        {/* PDF */}
        <div className="mb-3">
          {hasPdf ? (
            <button
              onClick={() => window.open(orden.pdf[0].url, '_blank')}
              className="w-full bg-condor-900 hover:bg-condor-800 active:bg-condor-700 text-white font-bold rounded-2xl py-4 text-sm transition-colors flex items-center justify-center gap-2 shadow-lg"
            >
              <FileText size={20} />
              Ver PDF de la Orden
            </button>
          ) : (
            <button
              disabled
              className="w-full bg-gray-200 text-gray-400 font-semibold rounded-2xl py-4 text-sm cursor-not-allowed flex items-center justify-center gap-2"
            >
              <FileText size={20} />
              PDF pendiente de generar
            </button>
          )}
        </div>

        {/* Reenvío message */}
        {reenvioMsg && (
          <div className={`rounded-2xl p-3 mb-3 text-sm font-medium text-center ${reenvioMsg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {reenvioMsg.text}
          </div>
        )}

        {/* Botones de acción */}
        <div className="space-y-3 mt-4">
          {(orden.estado === 'Error' || orden.estado === 'Pendiente' || !hasPdf) && (
            <button
              onClick={handleReenviar}
              disabled={reenviando}
              className="w-full bg-accent-600 hover:bg-accent-700 active:bg-accent-800 disabled:opacity-50 text-white font-bold rounded-2xl py-4 text-sm transition-colors flex items-center justify-center gap-2"
            >
              {reenviando ? <Loader2 size={18} className="animate-spin" /> : <RotateCcw size={18} />}
              {reenviando ? 'Reenviando...' : 'Reintentar Envío'}
            </button>
          )}
          <button
            onClick={() => navigate('/')}
            className="w-full btn-secondary py-3.5 rounded-2xl flex items-center justify-center gap-2 text-sm"
          >
            <ArrowLeft size={18} />
            Volver al Inicio
          </button>
        </div>
      </div>

      {/* Photo Viewer Modal */}
      {viewerFotos && (
        <PhotoViewer
          fotos={viewerFotos}
          initialIndex={viewerIndex}
          onClose={() => setViewerFotos(null)}
        />
      )}
    </div>
  );
}
