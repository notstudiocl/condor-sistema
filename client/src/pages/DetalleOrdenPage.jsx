import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Edit3, RotateCcw, ExternalLink } from 'lucide-react';
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
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${styles[estado] || 'bg-gray-100 text-gray-600'}`}>
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

export default function DetalleOrdenPage() {
  const { recordId } = useParams();
  const navigate = useNavigate();
  const [orden, setOrden] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reenviando, setReenviando] = useState(false);

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
    if (!orden) return;
    setReenviando(true);
    try {
      const webhookUrl = `${API_URL}/api/ordenes/${recordId}`;
      await fetch(webhookUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteNombre: orden.cliente,
          clienteEmail: orden.email,
          clienteTelefono: orden.telefono,
          direccion: orden.direccion,
          comuna: orden.comuna,
          ordenCompra: orden.ordenCompra,
          supervisor: orden.supervisor,
          horaInicio: orden.horaInicio,
          horaTermino: orden.horaTermino,
          trabajos: orden.trabajos,
          descripcion: orden.descripcion,
          observaciones: orden.observaciones,
          patenteVehiculo: orden.patente,
          total: orden.total,
          metodoPago: orden.metodoPago,
          requiereFactura: orden.requiereFactura,
        }),
      });
      navigate('/');
    } catch {
    } finally {
      setReenviando(false);
    }
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
        <button onClick={() => navigate('/')} className="btn-secondary px-4 py-2">Volver</button>
      </div>
    );
  }

  let trabajos = [];
  try { trabajos = typeof orden.trabajos === 'string' ? JSON.parse(orden.trabajos) : orden.trabajos || []; } catch { trabajos = []; }
  const trabajosActivos = trabajos.filter(t => t.cantidad > 0);

  return (
    <div className="min-h-[calc(100vh-56px)] bg-gray-50">
      <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/')} className="p-2 rounded-xl hover:bg-gray-200 transition-colors">
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <div className="flex-1">
            <h1 className="font-heading font-bold text-lg text-condor-900">{orden.numeroOrden || 'Orden'}</h1>
            <p className="text-xs text-gray-400">{orden.fecha}</p>
          </div>
          <EstadoBadge estado={orden.estado} />
        </div>

        {/* Cliente */}
        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm mb-4">
          <h3 className="font-heading font-semibold text-condor-900 mb-2">Cliente</h3>
          <Field label="Nombre" value={orden.cliente} />
          <Field label="RUT" value={typeof orden.clienteRut === 'object' ? '' : orden.clienteRut} />
          <Field label="Email" value={orden.email} />
          <Field label="Telefono" value={orden.telefono} />
          <Field label="Direccion" value={orden.direccion} />
          <Field label="Comuna" value={orden.comuna} />
          <Field label="Orden de Compra" value={orden.ordenCompra} />
          <Field label="Supervisor" value={orden.supervisor} />
          <Field label="Inicio" value={orden.horaInicio} />
          <Field label="Termino" value={orden.horaTermino} />
        </div>

        {/* Trabajos */}
        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm mb-4">
          <h3 className="font-heading font-semibold text-condor-900 mb-2">Trabajos Realizados</h3>
          {trabajosActivos.length > 0 ? (
            <div className="space-y-1">
              {trabajosActivos.map((t, i) => (
                <div key={i} className="flex justify-between py-1 border-b border-gray-100 last:border-0">
                  <span className="text-sm text-gray-700">{t.trabajo || t.nombre}</span>
                  <span className="text-sm font-semibold text-accent-700 bg-accent-50 px-2 rounded">x{t.cantidad}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Sin trabajos</p>
          )}
          <Field label="Descripcion" value={orden.descripcion} />
          <Field label="Observaciones" value={orden.observaciones} />
          <div className="mt-2 pt-2 border-t border-gray-200">
            <Field label="Total" value={formatCLP(orden.total)} />
            <Field label="Metodo de Pago" value={orden.metodoPago} />
            <Field label="Requiere Factura" value={orden.requiereFactura} />
          </div>
        </div>

        {/* Personal */}
        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm mb-4">
          <h3 className="font-heading font-semibold text-condor-900 mb-2">Personal</h3>
          <Field label="Patente" value={orden.patente} />
        </div>

        {/* Fotos */}
        {(orden.fotosAntes.length > 0 || orden.fotosDespues.length > 0) && (
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm mb-4">
            <h3 className="font-heading font-semibold text-condor-900 mb-2">Fotos</h3>
            {orden.fotosAntes.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-gray-400 mb-1">Antes ({orden.fotosAntes.length})</p>
                <div className="flex gap-2 flex-wrap">
                  {orden.fotosAntes.map((f, i) => (
                    <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 block">
                      <img src={f.url} alt={`Antes ${i+1}`} className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}
            {orden.fotosDespues.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Despues ({orden.fotosDespues.length})</p>
                <div className="flex gap-2 flex-wrap">
                  {orden.fotosDespues.map((f, i) => (
                    <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 block">
                      <img src={f.url} alt={`Despues ${i+1}`} className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Firma */}
        {orden.firma && orden.firma.length > 0 && (
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm mb-4">
            <h3 className="font-heading font-semibold text-condor-900 mb-2">Firma</h3>
            <div className="w-48 h-24 border border-gray-200 rounded-lg overflow-hidden bg-white">
              <img src={orden.firma[0].url} alt="Firma" className="w-full h-full object-contain" />
            </div>
          </div>
        )}

        {/* Botones de accion */}
        <div className="space-y-3 mt-6">
          {(orden.estado === 'Error' || orden.estado === 'Pendiente') && (
            <button
              onClick={handleReenviar}
              disabled={reenviando}
              className="w-full bg-accent-600 hover:bg-accent-700 disabled:opacity-50 text-white font-bold rounded-2xl py-4 text-sm transition-colors flex items-center justify-center gap-2"
            >
              {reenviando ? <Loader2 size={18} className="animate-spin" /> : <RotateCcw size={18} />}
              {reenviando ? 'Reenviando...' : 'Reintentar Envio'}
            </button>
          )}
          <button
            onClick={() => navigate(`/orden/${recordId}/editar`)}
            className="w-full bg-condor-900 hover:bg-condor-800 text-white font-semibold rounded-2xl py-4 text-sm transition-colors flex items-center justify-center gap-2"
          >
            <Edit3 size={18} />
            Editar y Reenviar
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full btn-secondary py-3 rounded-2xl flex items-center justify-center gap-2"
          >
            <ArrowLeft size={18} />
            Volver al Inicio
          </button>
        </div>
      </div>
    </div>
  );
}
