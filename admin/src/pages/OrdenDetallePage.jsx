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
  Pencil,
  Save,
  Loader2,
  Camera,
  History,
  Plus,
  Trash2,
  Search,
} from 'lucide-react';
import EstadoBadge from '../components/EstadoBadge';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import { SkeletonText } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import ClienteSearchAdmin from '../components/ClienteSearchAdmin';
import { compressImage, fileToBase64 } from '../utils/images';
import { formatCLP, formatFecha, formatHora, formatFechaHora, formatDuracion, formatRut } from '../utils/format';
import { ESTADOS, METODOS_PAGO, GARANTIAS } from '../utils/constants';
import {
  getOrden,
  getNotificacionesOrden,
  reenviarOrden,
  cambiarEstadoOrden,
  actualizarOrdenAdmin,
  crearOrdenAdmin,
  agregarFotosOrden,
  eliminarFotoOrden,
  regenerarPdfOrden,
  getAuditoriaOrden,
  listServicios,
  listEmpleados,
} from '../utils/api';

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

// timestamptz de Postgres -> valor de <input type="datetime-local">, en hora LOCAL del
// navegador (oficina de Condor opera en America/Santiago). Se envía tal cual de vuelta,
// mismo criterio que ya usa el wizard del técnico (client/OrdenWizardPage) para estos campos.
function toDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseNumeroInput(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const num = typeof value === 'string' ? parseInt(value.replace(/[^\d]/g, ''), 10) : value;
  return isNaN(num) ? 0 : num;
}

// Fecha de hoy en zona horaria Chile, formato YYYY-MM-DD (input type="date") — 'en-CA'
// es un truco estándar para obtener ISO directo de toLocaleDateString.
function todayISOChile() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
}

function buildFormFromOrden(orden) {
  return {
    fecha: orden.fecha ? String(orden.fecha).slice(0, 10) : '',
    horaInicio: toDatetimeLocalValue(orden.hora_inicio),
    horaTermino: toDatetimeLocalValue(orden.hora_termino),
    patenteVehiculo: orden.patente_vehiculo || '',
    direccion: orden.direccion || '',
    comuna: orden.comuna || '',
    supervisor: orden.supervisor || '',
    ordenCompra: orden.orden_compra || '',
    clienteEmpresa: orden.cliente_empresa || '',
    clienteEmail: orden.cliente_email || '',
    clienteTelefono: orden.cliente_telefono || '',
    descripcionTrabajo: orden.descripcion_trabajo || '',
    observaciones: orden.observaciones || '',
    garantia: orden.garantia || 'Sin garantía',
    total: orden.total || 0,
    metodoPago: orden.metodo_pago || '',
    requiereFactura: !!orden.requiere_factura,
    clienteId: orden.cliente_id || null,
    clienteLabel: orden.cliente ? (orden.cliente.empresa?.trim() ? orden.cliente.empresa : orden.cliente.nombre) : null,
    clienteRut: orden.cliente?.rut || null,
    unlinkCliente: false,
    empleadoIds: (orden.empleados || []).map((e) => e.id),
    trabajos: (orden.trabajos || []).map((t, i) => ({
      key: `t-${t.id ?? i}`,
      servicioId: t.servicio_id || null,
      trabajo: t.servicio_nombre || t.nombre_personalizado || '',
      cantidad: t.cantidad || 1,
    })),
  };
}

// Formulario vacío para el modo creación (/ordenes/nueva) — reusa buildFormFromOrden
// con un objeto vacío (todos los campos caen a sus defaults de '' / [] / null) y solo
// pisa la fecha con la de hoy, como hace el wizard del técnico.
function buildFormVacio() {
  return { ...buildFormFromOrden({}), fecha: todayISOChile() };
}

const ACCION_LABELS = {
  crear_orden: 'Creó la orden',
  editar_orden: 'Editó la orden',
  agregar_foto: 'Agregó fotos',
  eliminar_foto: 'Eliminó una foto',
  regenerar_pdf: 'Regeneró el PDF',
  cambio_estado_masivo: 'Cambio de estado masivo',
  eliminar_orden: 'Eliminó la orden',
};

function ResumenDetalleAuditoria({ detalle }) {
  if (!detalle || typeof detalle !== 'object') return null;
  const entries = Object.entries(detalle);
  if (entries.length === 0) return null;
  const visibles = entries.slice(0, 3);
  return (
    <p className="text-xs text-gray-400 mt-0.5 truncate">
      {visibles.map(([campo, val], i) => (
        <span key={campo}>
          {i > 0 && ' · '}
          {val && typeof val === 'object' && 'de' in val && 'a' in val
            ? `${campo}: ${String(val.de ?? '—')} → ${String(val.a ?? '—')}`
            : `${campo}: ${JSON.stringify(val)}`}
        </span>
      ))}
      {entries.length > 3 && ` · +${entries.length - 3} más`}
    </p>
  );
}

export default function OrdenDetallePage({ esNuevaOrden = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(!esNuevaOrden);
  const [error, setError] = useState('');
  const [orden, setOrden] = useState(null);
  const [notificaciones, setNotificaciones] = useState([]);
  const [auditoria, setAuditoria] = useState([]);
  const [auditoriaExpandida, setAuditoriaExpandida] = useState(false);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [confirmReenviar, setConfirmReenviar] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [confirmEstado, setConfirmEstado] = useState(null);

  // ---- Edición ----
  // En modo creación (/ordenes/nueva) arranca directo en editMode con un formulario
  // vacío — no hay orden que cargar ni toggle "Editar orden" que apretar.
  const [editMode, setEditMode] = useState(esNuevaOrden);
  const [form, setForm] = useState(esNuevaOrden ? buildFormVacio() : null);
  const [guardando, setGuardando] = useState(false);
  const [servicios, setServicios] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [fotosNuevas, setFotosNuevas] = useState({ antes: [], despues: [] });
  const [fotosParaEliminar, setFotosParaEliminar] = useState([]);

  const cargar = async () => {
    if (esNuevaOrden) return; // nada que cargar — el formulario arranca vacío
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

  const cargarAuditoria = async () => {
    if (esNuevaOrden) return;
    try {
      const res = await getAuditoriaOrden(id);
      setAuditoria(res.data || []);
    } catch {
      // silencioso — la ficha ya se ve sin el historial de cambios
    }
  };

  useEffect(() => {
    cargar();
    cargarAuditoria();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!editMode) return;
    listServicios().then((res) => setServicios(res.data || [])).catch(() => {});
    listEmpleados().then((res) => setTecnicos((res.data || []).filter((e) => e.activo))).catch(() => {});
  }, [editMode]);

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

  if (!esNuevaOrden && (error || !orden)) {
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
        // webhookOk solo confirma el PDF — las notificaciones (Resend/Telegram) se
        // intentan aparte y pueden fallar en silencio (p.ej. sin credenciales
        // configuradas todavía) sin que el request falle, ver ordenService.reenviarOrden.
        // Se revisa el detalle real en vez de asumir éxito para no informar de más.
        const notifs = res.data?.webhookData?.notificaciones || [];
        const notifsOk = notifs.filter((n) => n.ok).length;
        if (notifs.length === 0) {
          addToast('PDF regenerado correctamente.', { type: 'success' });
        } else if (notifsOk === notifs.length) {
          addToast('PDF regenerado y notificaciones reenviadas.', { type: 'success' });
        } else if (notifsOk > 0) {
          addToast(`PDF regenerado. ${notifsOk} de ${notifs.length} notificaciones se enviaron correctamente.`, { type: 'info' });
        } else {
          addToast('PDF regenerado, pero ninguna notificación pudo enviarse. Revisa Configuración → Notificaciones.', { type: 'error' });
        }
      } else {
        addToast(`Orden reenviada, pero el PDF quedó pendiente: ${res.data?.webhookError || 'error desconocido'}`, { type: 'error' });
      }
      cargar();
      cargarAuditoria();
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

  // ---- Edición ----

  const entrarEdicion = () => {
    setForm(buildFormFromOrden(orden));
    setFotosNuevas({ antes: [], despues: [] });
    setFotosParaEliminar([]);
    setBuscandoCliente(false);
    setEditMode(true);
  };

  const cancelarEdicion = () => {
    fotosNuevas.antes.forEach((f) => URL.revokeObjectURL(f.url));
    fotosNuevas.despues.forEach((f) => URL.revokeObjectURL(f.url));
    setFotosNuevas({ antes: [], despues: [] });
    setFotosParaEliminar([]);
    setForm(null);
    setEditMode(false);
  };

  // En modo creación no hay una orden previa a la que "cancelar" volviendo: el botón
  // simplemente descarta el formulario y vuelve al listado.
  const handleCancelar = () => {
    if (esNuevaOrden) {
      navigate('/ordenes');
      return;
    }
    cancelarEdicion();
  };

  const setCampo = (campo, valor) => setForm((prev) => ({ ...prev, [campo]: valor }));

  const agregarTrabajo = () => {
    setForm((prev) => ({
      ...prev,
      trabajos: [...prev.trabajos, { key: `t-nuevo-${Date.now()}`, servicioId: null, trabajo: '', cantidad: 1 }],
    }));
  };
  const quitarTrabajo = (key) => {
    setForm((prev) => ({ ...prev, trabajos: prev.trabajos.filter((t) => t.key !== key) }));
  };
  const actualizarTrabajo = (key, patch) => {
    setForm((prev) => ({ ...prev, trabajos: prev.trabajos.map((t) => (t.key === key ? { ...t, ...patch } : t)) }));
  };

  const toggleTecnico = (empId) => {
    setForm((prev) => ({
      ...prev,
      empleadoIds: prev.empleadoIds.includes(empId)
        ? prev.empleadoIds.filter((v) => v !== empId)
        : [...prev.empleadoIds, empId],
    }));
  };

  const seleccionarCliente = (cliente) => {
    setForm((prev) => ({
      ...prev,
      clienteId: cliente.id,
      unlinkCliente: false,
      clienteLabel: cliente.empresa?.trim() ? cliente.empresa : cliente.nombre,
      clienteRut: cliente.rut,
      clienteEmpresa: cliente.empresa || prev.clienteEmpresa,
      supervisor: cliente.nombre || prev.supervisor,
      clienteEmail: cliente.email || prev.clienteEmail,
      clienteTelefono: cliente.telefono || prev.clienteTelefono,
      direccion: cliente.direccion || prev.direccion,
      comuna: cliente.comuna || prev.comuna,
    }));
    setBuscandoCliente(false);
  };

  const desenlazarCliente = () => {
    setForm((prev) => ({ ...prev, clienteId: null, unlinkCliente: true, clienteLabel: null, clienteRut: null }));
    setBuscandoCliente(false);
  };

  const handleAgregarFotos = (tipo, fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    const nuevas = files.map((file) => ({
      tempId: `nuevo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      url: URL.createObjectURL(file),
    }));
    setFotosNuevas((prev) => ({ ...prev, [tipo]: [...prev[tipo], ...nuevas] }));
  };

  const quitarFotoNueva = (tipo, tempId) => {
    setFotosNuevas((prev) => {
      const target = prev[tipo].find((f) => f.tempId === tempId);
      if (target) URL.revokeObjectURL(target.url);
      return { ...prev, [tipo]: prev[tipo].filter((f) => f.tempId !== tempId) };
    });
  };

  const toggleEliminarFotoExistente = (fotoId) => {
    setFotosParaEliminar((prev) => (prev.includes(fotoId) ? prev.filter((v) => v !== fotoId) : [...prev, fotoId]));
  };

  const handleGuardar = async () => {
    setGuardando(true);
    try {
      const payload = {
        fecha: form.fecha || null,
        horaInicio: form.horaInicio || null,
        horaTermino: form.horaTermino || null,
        patenteVehiculo: form.patenteVehiculo,
        direccion: form.direccion,
        comuna: form.comuna,
        supervisor: form.supervisor,
        ordenCompra: form.ordenCompra,
        clienteEmpresa: form.clienteEmpresa,
        clienteEmail: form.clienteEmail,
        clienteTelefono: form.clienteTelefono,
        descripcionTrabajo: form.descripcionTrabajo,
        observaciones: form.observaciones,
        garantia: form.garantia,
        total: parseNumeroInput(form.total),
        metodoPago: form.metodoPago || null,
        requiereFactura: form.requiereFactura,
        clienteId: form.unlinkCliente ? null : form.clienteId,
        unlinkCliente: form.unlinkCliente,
        empleadoIds: form.empleadoIds,
        trabajos: form.trabajos
          .filter((t) => (t.trabajo || '').trim())
          .map((t) => ({ servicioId: t.servicioId || undefined, trabajo: t.trabajo.trim(), cantidad: Number(t.cantidad) || 1 })),
      };

      if (esNuevaOrden) {
        // Sin fotos/PDF/notificaciones acá — la orden nace en estado 'Enviada' y la
        // oficina usa "Regenerar PDF"/"Agregar foto" desde la ficha recién creada.
        const res = await crearOrdenAdmin(payload);
        addToast(`Orden OT-${res.data.numero_orden_display} creada correctamente.`, { type: 'success' });
        navigate(`/ordenes/${res.data.id}`);
        return;
      }

      await actualizarOrdenAdmin(orden.id, payload);

      for (const fotoId of fotosParaEliminar) {
        try {
          await eliminarFotoOrden(orden.id, fotoId);
        } catch (err) {
          addToast(`No se pudo eliminar una foto: ${err.message}`, { type: 'error' });
        }
      }

      for (const tipo of ['antes', 'despues']) {
        const nuevas = fotosNuevas[tipo];
        if (nuevas.length === 0) continue;
        const base64s = await Promise.all(
          nuevas.map(async (f) => fileToBase64(await compressImage(f.file)))
        );
        await agregarFotosOrden(orden.id, tipo, base64s);
      }

      addToast('Cambios guardados. Regenerando PDF...', { type: 'info', duration: 3000 });

      try {
        await regenerarPdfOrden(orden.id);
        addToast('PDF regenerado correctamente.', { type: 'success' });
      } catch (err) {
        addToast(`El PDF quedó pendiente: ${err.message}`, { type: 'error' });
      }

      cancelarEdicion();
      await cargar();
      await cargarAuditoria();
    } catch (err) {
      addToast(`No se pudo ${esNuevaOrden ? 'crear la orden' : 'guardar'}: ${err.message}`, { type: 'error' });
    } finally {
      setGuardando(false);
    }
  };

  const timeline = orden ? buildTimeline(orden.estado) : [];
  const trabajos = orden?.trabajos || [];
  const empleados = orden?.empleados || [];
  const auditoriaVisible = auditoriaExpandida ? auditoria : auditoria.slice(0, 5);

  return (
    <div className="space-y-5 pb-10">
      {/* Header sticky con acciones */}
      <div className="sticky top-16 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-gray-50/95 backdrop-blur border-b border-gray-200 flex flex-wrap items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <p className="font-heading font-bold text-lg text-gray-900">
            {esNuevaOrden ? 'Nueva orden' : `OT-${orden.numero_orden_display}`}
          </p>
          {!esNuevaOrden && <p className="text-xs text-gray-400">{formatFecha(orden.fecha)}</p>}
        </div>
        {!esNuevaOrden && <EstadoBadge estado={orden.estado} solido />}

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {editMode ? (
            <>
              <button className="btn-secondary" onClick={handleCancelar} disabled={guardando}>
                Cancelar
              </button>
              <button className="btn-accent" onClick={handleGuardar} disabled={guardando}>
                {guardando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {guardando
                  ? esNuevaOrden ? 'Creando...' : 'Guardando...'
                  : esNuevaOrden ? 'Crear orden' : 'Guardar cambios'}
              </button>
            </>
          ) : (
            <>
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
              <button onClick={() => setConfirmReenviar(true)} className="btn-secondary">
                <Send size={15} /> Reenviar
              </button>
              <button onClick={entrarEdicion} className="btn-primary">
                <Pencil size={15} /> Editar orden
              </button>
            </>
          )}
        </div>
      </div>

      {/* Timeline de estados — no aplica todavía en modo creación (la orden no existe) */}
      {!esNuevaOrden && (
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
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-5">
          {/* Trabajo */}
          <div className="card p-5">
            <h2 className="font-heading font-semibold text-gray-900 mb-4">Trabajo realizado</h2>

            {editMode ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="label-field">Hora inicio</label>
                    <input
                      type="datetime-local"
                      value={form.horaInicio}
                      onChange={(e) => setCampo('horaInicio', e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="label-field">Hora término</label>
                    <input
                      type="datetime-local"
                      value={form.horaTermino}
                      onChange={(e) => setCampo('horaTermino', e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="label-field">Patente vehículo</label>
                    <input
                      value={form.patenteVehiculo}
                      onChange={(e) => setCampo('patenteVehiculo', e.target.value)}
                      className="input-field font-mono"
                      placeholder="AB-CD-12"
                    />
                  </div>
                </div>

                <div>
                  <label className="label-field">Trabajos realizados</label>
                  <div className="space-y-2">
                    {form.trabajos.map((t) => (
                      <div key={t.key} className="flex items-center gap-2">
                        <select
                          value={t.servicioId ? String(t.servicioId) : ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) {
                              actualizarTrabajo(t.key, { servicioId: null, trabajo: '' });
                            } else {
                              const servicio = servicios.find((s) => String(s.id) === val);
                              actualizarTrabajo(t.key, { servicioId: Number(val), trabajo: servicio?.nombre || '' });
                            }
                          }}
                          className="input-field flex-1 min-w-0"
                        >
                          <option value="">Personalizado...</option>
                          {servicios.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.nombre}
                            </option>
                          ))}
                        </select>
                        {!t.servicioId && (
                          <input
                            value={t.trabajo}
                            onChange={(e) => actualizarTrabajo(t.key, { trabajo: e.target.value })}
                            placeholder="Nombre del trabajo"
                            className="input-field flex-1 min-w-0"
                          />
                        )}
                        <input
                          type="number"
                          min="1"
                          value={t.cantidad}
                          onChange={(e) => actualizarTrabajo(t.key, { cantidad: e.target.value })}
                          className="input-field w-20 shrink-0"
                        />
                        <button
                          type="button"
                          onClick={() => quitarTrabajo(t.key)}
                          className="shrink-0 p-2 text-gray-400 hover:text-red-600 transition-colors"
                          title="Quitar trabajo"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={agregarTrabajo}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-condor-700 hover:text-condor-900"
                  >
                    <Plus size={14} /> Agregar trabajo
                  </button>
                </div>

                <div>
                  <label className="label-field">Descripción del trabajo</label>
                  <textarea
                    value={form.descripcionTrabajo}
                    onChange={(e) => setCampo('descripcionTrabajo', e.target.value)}
                    rows={3}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="label-field">Observaciones</label>
                  <textarea
                    value={form.observaciones}
                    onChange={(e) => setCampo('observaciones', e.target.value)}
                    rows={2}
                    className="input-field"
                  />
                </div>
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>

          {/* Fotos / Notificaciones / Historial — no aplican en modo creación: la orden
              todavía no existe, no puede tener fotos, notificaciones ni cambios auditados. */}
          {!esNuevaOrden && (
          <>
          <div className="card p-5">
            <h2 className="font-heading font-semibold text-gray-900 mb-4">Evidencia fotográfica</h2>

            {editMode ? (
              <div className="space-y-5">
                {['antes', 'despues'].map((tipo) => {
                  const existentes = (orden.fotos || []).filter((f) => f.tipo === tipo);
                  return (
                    <div key={tipo}>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        {tipo === 'antes' ? 'Antes' : 'Después'}
                      </p>
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                        {existentes.map((f) => {
                          const marcada = fotosParaEliminar.includes(f.id);
                          return (
                            <div key={f.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                              {f.url ? (
                                <img
                                  src={f.url}
                                  alt=""
                                  className={`w-full h-full object-cover transition-opacity ${marcada ? 'opacity-30' : ''}`}
                                />
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                                  <ImageOff size={18} />
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => toggleEliminarFotoExistente(f.id)}
                                className={`absolute top-1 right-1 rounded-full p-1 ${
                                  marcada ? 'bg-emerald-600 text-white' : 'bg-black/50 text-white hover:bg-red-600'
                                }`}
                                title={marcada ? 'Deshacer eliminación' : 'Marcar para eliminar'}
                              >
                                {marcada ? <Check size={12} /> : <X size={12} />}
                              </button>
                              {marcada && (
                                <span className="absolute bottom-1 left-1 right-1 text-center text-[9px] font-bold bg-red-600 text-white rounded px-1">
                                  Se eliminará
                                </span>
                              )}
                            </div>
                          );
                        })}
                        {fotosNuevas[tipo].map((f) => (
                          <div key={f.tempId} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 ring-2 ring-emerald-400">
                            <img src={f.url} alt="" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => quitarFotoNueva(tipo, f.tempId)}
                              className="absolute top-1 right-1 rounded-full p-1 bg-black/50 text-white hover:bg-red-600"
                              title="Quitar"
                            >
                              <X size={12} />
                            </button>
                            <span className="absolute bottom-1 left-1 right-1 text-center text-[9px] font-bold bg-emerald-600 text-white rounded px-1">
                              Nueva
                            </span>
                          </div>
                        ))}
                        <label className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-condor-400 hover:text-condor-600 cursor-pointer transition-colors">
                          <Camera size={18} />
                          <span className="text-[10px] font-semibold">Agregar</span>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              handleAgregarFotos(tipo, e.target.files);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : fotos.length === 0 ? (
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

          {/* Historial de cambios (auditoría) */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading font-semibold text-gray-900 flex items-center gap-2">
                <History size={16} className="text-gray-400" /> Historial de cambios
              </h2>
              {auditoria.length > 5 && (
                <button
                  onClick={() => setAuditoriaExpandida((v) => !v)}
                  className="text-xs font-semibold text-condor-700 hover:text-condor-900"
                >
                  {auditoriaExpandida ? 'Ver menos' : `Ver todo (${auditoria.length})`}
                </button>
              )}
            </div>
            {auditoria.length === 0 ? (
              <p className="text-sm text-gray-400">Sin cambios registrados todavía.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {auditoriaVisible.map((a) => (
                  <div key={a.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-gray-800">
                        <span className="font-medium">{a.admin_nombre || a.admin_email || 'Sistema'}</span>
                        {' — '}
                        {ACCION_LABELS[a.accion] || a.accion}
                      </p>
                      <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">{formatFechaHora(a.created_at)}</span>
                    </div>
                    <ResumenDetalleAuditoria detalle={a.detalle} />
                  </div>
                ))}
              </div>
            )}
          </div>
          </>
          )}
        </div>

        {/* Lateral */}
        <div className="space-y-5">
          <div className="card p-5">
            <h2 className="font-heading font-semibold text-gray-900 mb-3">Cliente</h2>

            {editMode ? (
              <div className="space-y-3">
                {buscandoCliente ? (
                  <div>
                    <ClienteSearchAdmin onSelect={seleccionarCliente} />
                    <button
                      type="button"
                      onClick={() => setBuscandoCliente(false)}
                      className="mt-2 text-xs font-semibold text-gray-500 hover:text-gray-700"
                    >
                      Cancelar búsqueda
                    </button>
                  </div>
                ) : form.clienteId ? (
                  <div className="flex items-center justify-between gap-2 bg-condor-50 border border-condor-100 rounded-lg px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-condor-900 truncate">{form.clienteLabel}</p>
                      {form.clienteRut && <p className="text-xs text-condor-700 font-mono">{formatRut(form.clienteRut)}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setBuscandoCliente(true)}
                        className="text-xs font-semibold text-condor-700 hover:text-condor-900 px-2 py-1"
                      >
                        Cambiar
                      </button>
                      <button
                        type="button"
                        onClick={desenlazarCliente}
                        className="text-xs font-semibold text-red-600 hover:text-red-800 px-2 py-1"
                      >
                        Desenlazar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
                    <p className="text-sm text-gray-500">Sin cliente vinculado</p>
                    <button
                      type="button"
                      onClick={() => setBuscandoCliente(true)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-condor-700 hover:text-condor-900"
                    >
                      <Search size={12} /> Buscar cliente
                    </button>
                  </div>
                )}

                <div>
                  <label className="label-field">Cliente / Empresa</label>
                  <input value={form.clienteEmpresa} onChange={(e) => setCampo('clienteEmpresa', e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="label-field">Supervisor / Encargado</label>
                  <input value={form.supervisor} onChange={(e) => setCampo('supervisor', e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="label-field">Email</label>
                  <input value={form.clienteEmail} onChange={(e) => setCampo('clienteEmail', e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="label-field">Teléfono</label>
                  <input value={form.clienteTelefono} onChange={(e) => setCampo('clienteTelefono', e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="label-field">Dirección</label>
                  <input value={form.direccion} onChange={(e) => setCampo('direccion', e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="label-field">Comuna</label>
                  <input value={form.comuna} onChange={(e) => setCampo('comuna', e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="label-field">Orden de compra</label>
                  <input value={form.ordenCompra} onChange={(e) => setCampo('ordenCompra', e.target.value)} className="input-field" />
                </div>
              </div>
            ) : (
              <>
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
                      onClick={() => navigate(`/clientes/${orden.cliente_id}`)}
                      className="text-xs font-semibold text-condor-700 hover:text-condor-900"
                    >
                      Ver ficha del cliente →
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="card p-5">
            <h2 className="font-heading font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Wallet size={16} className="text-gray-400" /> Pago
            </h2>

            {editMode ? (
              <div className="space-y-3">
                <div>
                  <label className="label-field">Total (CLP)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.total}
                    onChange={(e) => setCampo('total', e.target.value)}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="label-field">Método de pago</label>
                  <select value={form.metodoPago} onChange={(e) => setCampo('metodoPago', e.target.value)} className="input-field">
                    <option value="">Sin especificar</option>
                    {METODOS_PAGO.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label-field">Garantía</label>
                  <select value={form.garantia} onChange={(e) => setCampo('garantia', e.target.value)} className="input-field">
                    {GARANTIAS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label-field">Requiere factura</label>
                  <select
                    value={form.requiereFactura ? 'si' : 'no'}
                    onChange={(e) => setCampo('requiereFactura', e.target.value === 'si')}
                    className="input-field"
                  >
                    <option value="no">No</option>
                    <option value="si">Sí</option>
                  </select>
                </div>
              </div>
            ) : (
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
            )}
          </div>

          <div className="card p-5">
            <h2 className="font-heading font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Truck size={16} className="text-gray-400" /> Equipo
            </h2>

            {editMode ? (
              tecnicos.length === 0 ? (
                <p className="text-sm text-gray-400">Cargando técnicos...</p>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {tecnicos.map((t) => (
                    <label
                      key={t.id}
                      className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={form.empleadoIds.includes(t.id)}
                        onChange={() => toggleTecnico(t.id)}
                        className="rounded border-gray-300 text-condor-600 focus:ring-condor-400"
                      />
                      <span className="text-sm text-gray-700">{t.nombre}</span>
                      {t.codigo && <span className="text-xs text-gray-400 font-mono ml-auto">{t.codigo}</span>}
                    </label>
                  ))}
                </div>
              )
            ) : empleados.length === 0 ? (
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
        message={orden ? `¿Confirmas cambiar el estado de OT-${orden.numero_orden_display} a "${confirmEstado}"?` : ''}
        confirmLabel="Cambiar estado"
      />
    </div>
  );
}
