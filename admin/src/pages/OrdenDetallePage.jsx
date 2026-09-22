import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getSession, hasRole, ROLES } from '../utils/auth';
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
  ChevronDown,
  ImageOff,
  AlertCircle,
  Save,
  Loader2,
  Camera,
  History,
  Plus,
  Trash2,
  Search,
  Link2,
  Unlink,
  RefreshCw,
  MoreHorizontal,
  User,
  Wrench,
  Bell,
} from 'lucide-react';
import EstadoBadge from '../components/EstadoBadge';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import { SkeletonText } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import ClienteSearchAdmin from '../components/ClienteSearchAdmin';
import { Section, Field, FieldGrid, EditarBtn, CancelarBtn, SeccionAcciones } from '../components/SectionCard';
import { compressImage, fileToBase64 } from '../utils/images';
import { formatCLP, formatFecha, formatFechaHora, formatDuracion, formatRut } from '../utils/format';
import { ESTADOS, METODOS_PAGO, GARANTIAS } from '../utils/constants';
import {
  getOrden,
  getNotificacionesOrden,
  reenviarOrden,
  eliminarOrden,
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
  // Swipe horizontal en touch (sin librería): solo lectura del gesto, la navegación es la
  // misma que los botones prev/next.
  const touchStartX = useRef(null);
  if (!open) return null;
  const foto = fotos[index];
  const prev = () => setIndex((i) => (i - 1 + fotos.length) % fotos.length);
  const next = () => setIndex((i) => (i + 1) % fotos.length);
  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e) => {
    if (touchStartX.current == null || fotos.length < 2) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) next();
    else prev();
  };
  return (
    <div
      className="fixed inset-0 z-[150] bg-black/90 flex items-center justify-center touch-pan-y select-none"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <button
        onClick={onClose}
        className="absolute top-3 right-3 z-10 h-11 w-11 inline-flex items-center justify-center rounded-full bg-black/40 text-white/80 hover:text-white"
        aria-label="Cerrar"
      >
        <X size={22} />
      </button>
      {fotos.length > 1 && (
        <button
          onClick={prev}
          className="absolute left-2 sm:left-4 z-10 h-11 w-11 inline-flex items-center justify-center rounded-full bg-black/40 text-white/80 hover:text-white"
          aria-label="Anterior"
        >
          <ChevronLeft size={28} />
        </button>
      )}
      {foto?.url ? (
        <img src={foto.url} alt={foto.label} className="max-w-[94vw] max-h-[86dvh] rounded-xl object-contain" draggable={false} />
      ) : (
        <div className="w-72 max-w-[80vw] h-72 max-h-[70dvh] rounded-xl flex items-center justify-center bg-gray-800">
          <div className="text-center text-gray-400">
            <ImageOff size={32} className="mx-auto mb-2" />
            <p className="text-sm">No se pudo cargar la imagen</p>
          </div>
        </div>
      )}
      {fotos.length > 1 && (
        <button
          onClick={next}
          className="absolute right-2 sm:right-4 z-10 h-11 w-11 inline-flex items-center justify-center rounded-full bg-black/40 text-white/80 hover:text-white"
          aria-label="Siguiente"
        >
          <ChevronRight size={28} />
        </button>
      )}
      <span className="absolute bottom-3 sm:bottom-5 left-1/2 -translate-x-1/2 text-white/70 text-xs bg-black/40 rounded-full px-3 py-1">
        {foto?.label} · {index + 1} / {fotos.length}
      </span>
    </div>
  );
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

// Payload completo del PUT/POST admin a partir del formulario (el backend siempre recibe
// la orden entera — al guardar UNA sección se manda todo, con solo esa sección cambiada).
function buildPayload(form) {
  return {
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
}

// Qué campos del formulario "pertenecen" a cada sección editable. Al guardar una sección
// se toma la orden actual como base y se pisan SOLO estos campos, así dos secciones
// abiertas a la vez no se contaminan entre sí.
const CAMPOS_SECCION = {
  cliente: ['clienteId', 'clienteLabel', 'clienteRut', 'unlinkCliente', 'clienteEmpresa', 'supervisor', 'clienteEmail', 'clienteTelefono', 'direccion', 'comuna'],
  trabajo: ['fecha', 'horaInicio', 'horaTermino', 'patenteVehiculo', 'garantia', 'trabajos', 'descripcionTrabajo', 'observaciones'],
  pago: ['total', 'metodoPago', 'requiereFactura', 'ordenCompra'],
  equipo: ['empleadoIds'],
};

function pick(obj, keys) {
  const out = {};
  for (const k of keys) out[k] = obj[k];
  return out;
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

// Menú desplegable simple (estado / más acciones) que se cierra al hacer clic afuera o con Escape.
function useClickOutside(ref, onOutside, active) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onOutside();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onOutside();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, onOutside, active]);
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
  // Eliminar es solo-admin también en el backend (requireRole); ocultarlo acá es solo UX.
  const puedeEliminar = hasRole(getSession()?.user, [ROLES.ADMIN]);
  const [confirmEliminar, setConfirmEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [regenerandoPdf, setRegenerandoPdf] = useState(false);
  const [confirmEstado, setConfirmEstado] = useState(null);
  const [estadoMenuOpen, setEstadoMenuOpen] = useState(false);
  const [masMenuOpen, setMasMenuOpen] = useState(false);
  const estadoMenuRef = useRef(null);
  const masMenuRef = useRef(null);
  useClickOutside(estadoMenuRef, () => setEstadoMenuOpen(false), estadoMenuOpen);
  useClickOutside(masMenuRef, () => setMasMenuOpen(false), masMenuOpen);

  // ---- Edición por secciones ----
  // Un solo formulario (`form`) y la lista de secciones abiertas. En modo creación
  // (/ordenes/nueva) todas las secciones están en edición sobre un formulario vacío y hay
  // un único botón "Crear orden" en la cabecera.
  const [form, setForm] = useState(esNuevaOrden ? buildFormVacio() : null);
  const [seccionesEditando, setSeccionesEditando] = useState([]);
  const [guardandoSeccion, setGuardandoSeccion] = useState(null);
  const [creando, setCreando] = useState(false);
  const [servicios, setServicios] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [buscandoCliente, setBuscandoCliente] = useState(false);

  // ---- Fotos (sección con su propio guardado: sube/elimina en R2 y regenera el PDF) ----
  const [fotosEditando, setFotosEditando] = useState(false);
  const [guardandoFotos, setGuardandoFotos] = useState(false);
  const [fotosNuevas, setFotosNuevas] = useState({ antes: [], despues: [] });
  const [fotosParaEliminar, setFotosParaEliminar] = useState([]);

  const editando = (seccion) => esNuevaOrden || seccionesEditando.includes(seccion);
  const algoEditando = esNuevaOrden || seccionesEditando.length > 0;

  const cargar = async ({ silencioso = false } = {}) => {
    if (esNuevaOrden) return; // nada que cargar — el formulario arranca vacío
    if (!silencioso) setLoading(true);
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
      if (!silencioso) setLoading(false);
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
    // Al pasar de /ordenes/nueva a /ordenes/:id el componente se reutiliza: hay que salir del
    // modo edición y limpiar el estado de creación (bug real de QA: la ficha recién creada
    // quedaba editable y sin acciones).
    setForm(esNuevaOrden ? buildFormVacio() : null);
    if (esNuevaOrden) {
      setOrden(null);
      setNotificaciones([]);
      setAuditoria([]);
    }
    setSeccionesEditando([]);
    setFotosEditando(false);
    setFotosNuevas({ antes: [], despues: [] });
    setFotosParaEliminar([]);
    setBuscandoCliente(false);
    setEstadoMenuOpen(false);
    setMasMenuOpen(false);
    cargar();
    cargarAuditoria();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, esNuevaOrden]);

  useEffect(() => {
    if (!algoEditando) return;
    listServicios().then((res) => setServicios(res.data || [])).catch(() => {});
    listEmpleados().then((res) => setTecnicos((res.data || []).filter((e) => e.activo))).catch(() => {});
  }, [algoEditando]);

  const fotos = useMemo(() => {
    if (!orden) return [];
    return (orden.fotos || [])
      .filter((f) => f.tipo === 'antes' || f.tipo === 'despues')
      .map((f) => ({ ...f, label: f.tipo === 'antes' ? 'Antes' : 'Después' }));
  }, [orden]);
  const firma = (orden?.fotos || []).find((f) => f.tipo === 'firma' && f.url) || null;
  const pdfFoto = useMemo(() => (orden?.fotos || []).find((f) => f.tipo === 'pdf'), [orden]);

  // Al pasar de /ordenes/:id a /ordenes/nueva el componente se reutiliza y `form` sigue en
  // null hasta que corre el useEffect de reset — un render intermedio sin formulario reventaba.
  if (loading || (esNuevaOrden && !form)) {
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

  // ---- Acciones de cabecera ----

  const handleEliminar = async () => {
    setEliminando(true);
    try {
      await eliminarOrden(orden.id);
      addToast(`OT-${orden.numero_orden_display} eliminada`, { type: 'success' });
      navigate('/ordenes');
    } catch (err) {
      addToast(`No se pudo eliminar: ${err.message}`, { type: 'error' });
      setEliminando(false);
      setConfirmEliminar(false);
    }
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
      cargar({ silencioso: true });
      cargarAuditoria();
    } catch (err) {
      addToast(`No se pudo reenviar: ${err.message}`, { type: 'error' });
    } finally {
      setReenviando(false);
    }
  };

  // Solo el PDF, sin notificar (para no re-avisar al cliente tras una edición administrativa).
  const handleRegenerarPdf = async () => {
    setRegenerandoPdf(true);
    try {
      await regenerarPdfOrden(orden.id);
      addToast('PDF regenerado correctamente.', { type: 'success' });
      await cargar({ silencioso: true });
      cargarAuditoria();
    } catch (err) {
      addToast(`No se pudo regenerar el PDF: ${err.message}`, { type: 'error' });
    } finally {
      setRegenerandoPdf(false);
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

  // ---- Edición por secciones ----

  const abrirSeccion = (seccion) => {
    const base = buildFormFromOrden(orden);
    // Si ya hay otra sección abierta se conserva lo que lleva escrito y solo se
    // refrescan los campos de la sección que se abre ahora.
    setForm((prev) => (prev ? { ...prev, ...pick(base, CAMPOS_SECCION[seccion]) } : base));
    if (seccion === 'cliente') setBuscandoCliente(false);
    setSeccionesEditando((prev) => (prev.includes(seccion) ? prev : [...prev, seccion]));
  };

  const cerrarSeccion = (seccion) => {
    if (seccion === 'cliente') setBuscandoCliente(false);
    setSeccionesEditando((prev) => {
      const next = prev.filter((s) => s !== seccion);
      if (next.length === 0) setForm(null);
      return next;
    });
  };

  const regenerarPdfTrasGuardar = async () => {
    addToast('Cambios guardados. Regenerando PDF...', { type: 'info', duration: 3000 });
    try {
      await regenerarPdfOrden(orden.id);
      addToast('PDF regenerado correctamente.', { type: 'success' });
    } catch (err) {
      addToast(`El PDF quedó pendiente: ${err.message}`, { type: 'error' });
    }
  };

  const guardarSeccion = async (seccion) => {
    setGuardandoSeccion(seccion);
    try {
      // Payload completo: la orden tal como está en el servidor + solo los campos de esta sección.
      const merged = { ...buildFormFromOrden(orden), ...pick(form, CAMPOS_SECCION[seccion]) };
      await actualizarOrdenAdmin(orden.id, buildPayload(merged));
      cerrarSeccion(seccion);
      await regenerarPdfTrasGuardar();
      await cargar({ silencioso: true });
      await cargarAuditoria();
    } catch (err) {
      addToast(`No se pudo guardar: ${err.message}`, { type: 'error' });
    } finally {
      setGuardandoSeccion(null);
    }
  };

  const handleCrear = async () => {
    setCreando(true);
    try {
      // Sin fotos/PDF/notificaciones acá — la orden nace en estado 'Enviada' y la
      // oficina usa "Regenerar PDF"/"Agregar foto" desde la ficha recién creada.
      const res = await crearOrdenAdmin(buildPayload(form));
      addToast(`Orden OT-${res.data.numero_orden_display} creada correctamente.`, { type: 'success' });
      navigate(`/ordenes/${res.data.id}`);
    } catch (err) {
      addToast(`No se pudo crear la orden: ${err.message}`, { type: 'error' });
      setCreando(false);
    }
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

  // ---- Fotos ----

  const abrirFotos = () => {
    setFotosNuevas({ antes: [], despues: [] });
    setFotosParaEliminar([]);
    setFotosEditando(true);
  };

  const cancelarFotos = () => {
    fotosNuevas.antes.forEach((f) => URL.revokeObjectURL(f.url));
    fotosNuevas.despues.forEach((f) => URL.revokeObjectURL(f.url));
    setFotosNuevas({ antes: [], despues: [] });
    setFotosParaEliminar([]);
    setFotosEditando(false);
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

  const guardarFotos = async () => {
    const hayCambios = fotosParaEliminar.length > 0 || fotosNuevas.antes.length > 0 || fotosNuevas.despues.length > 0;
    if (!hayCambios) {
      cancelarFotos();
      return;
    }
    setGuardandoFotos(true);
    try {
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
        const base64s = await Promise.all(nuevas.map(async (f) => fileToBase64(await compressImage(f.file))));
        await agregarFotosOrden(orden.id, tipo, base64s);
      }

      cancelarFotos();
      await regenerarPdfTrasGuardar();
      await cargar({ silencioso: true });
      await cargarAuditoria();
    } catch (err) {
      addToast(`No se pudieron guardar las fotos: ${err.message}`, { type: 'error' });
    } finally {
      setGuardandoFotos(false);
    }
  };

  const trabajos = orden?.trabajos || [];
  const empleados = orden?.empleados || [];
  const auditoriaVisible = auditoriaExpandida ? auditoria : auditoria.slice(0, 5);
  const clienteLinkLabel = orden?.cliente
    ? orden.cliente.empresa?.trim() ? orden.cliente.empresa : orden.cliente.nombre
    : null;

  // Botón "Editar"/"Cancelar" de la esquina de cada sección (oculto en modo creación).
  const accionSeccion = (seccion) => {
    if (esNuevaOrden) return null;
    return editando(seccion)
      ? <CancelarBtn onClick={() => cerrarSeccion(seccion)} disabled={guardandoSeccion === seccion} />
      : <EditarBtn onClick={() => abrirSeccion(seccion)} />;
  };

  // Pie Guardar/Cancelar de una sección abierta (en modo creación hay un único "Crear orden").
  const pieSeccion = (seccion) => {
    if (esNuevaOrden || !editando(seccion)) return null;
    return (
      <SeccionAcciones
        onGuardar={() => guardarSeccion(seccion)}
        onCancelar={() => cerrarSeccion(seccion)}
        guardando={guardandoSeccion === seccion}
      />
    );
  };

  return (
    <div className="space-y-5 pb-10 max-w-5xl">
      {/* ---- Cabecera: volver + título + acciones ---- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate(esNuevaOrden ? '/ordenes' : -1)}
            className="btn-secondary !px-2.5 shrink-0"
            aria-label="Volver"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            {/* h2: el h1 de la página lo pone el Topbar ("Detalle de orden") */}
            <h2 className="font-heading font-bold text-xl sm:text-2xl text-gray-900 leading-tight truncate">
              {esNuevaOrden ? 'Nueva orden' : `Orden ${orden.numero_orden_display}`}
            </h2>
            <p className="text-xs text-gray-400 truncate">
              {esNuevaOrden
                ? 'Se creará en estado "Enviada", sin fotos ni PDF — se completan después desde la ficha.'
                : `Trabajo del ${formatFecha(orden.fecha)} · creada ${formatFechaHora(orden.created_at)}`}
            </p>
          </div>
        </div>

        <div className="w-full sm:w-auto flex items-center gap-2 flex-wrap">
          {esNuevaOrden ? (
            <>
              <button className="btn-secondary flex-1 sm:flex-none" onClick={() => navigate('/ordenes')} disabled={creando}>
                Cancelar
              </button>
              <button className="btn-accent flex-1 sm:flex-none" onClick={handleCrear} disabled={creando}>
                {creando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {creando ? 'Creando...' : 'Crear orden'}
              </button>
            </>
          ) : (
            <>
              {/* Selector de estado: badge + flecha, menú con los demás estados, confirmación al elegir */}
              <div className="relative" ref={estadoMenuRef}>
                <button
                  type="button"
                  className="btn-secondary !pl-2 !pr-2.5"
                  onClick={() => setEstadoMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={estadoMenuOpen}
                  title="Cambiar estado"
                >
                  <EstadoBadge estado={orden.estado} solido />
                  <ChevronDown size={14} className="text-gray-400" />
                </button>
                {estadoMenuOpen && (
                  <div role="menu" className="absolute left-0 sm:left-auto sm:right-0 z-30 mt-1 w-56 card p-1 shadow-lg">
                    <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Cambiar a</p>
                    {ESTADOS.filter((e) => e !== orden.estado).map((e) => (
                      <button
                        key={e}
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          setEstadoMenuOpen(false);
                          setConfirmEstado(e);
                        }}
                        className="w-full text-left px-2.5 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                      >
                        → {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {pdfFoto ? (
                <a href={pdfFoto.url} target="_blank" rel="noopener noreferrer" className="btn-secondary">
                  <FileText size={15} /> Ver PDF
                </a>
              ) : (
                <button type="button" className="btn-secondary" disabled title="Todavía no se generó el PDF de esta orden">
                  <FileText size={15} /> Ver PDF
                </button>
              )}

              <button type="button" className="btn-primary" onClick={handleRegenerarPdf} disabled={regenerandoPdf}>
                <RefreshCw size={15} className={regenerandoPdf ? 'animate-spin' : ''} />
                {regenerandoPdf ? 'Regenerando...' : 'Regenerar PDF'}
              </button>

              {/* Más acciones: reenviar (PDF + notificaciones) y eliminar (solo admin) */}
              <div className="relative" ref={masMenuRef}>
                <button
                  type="button"
                  className="btn-secondary !px-2.5"
                  onClick={() => setMasMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={masMenuOpen}
                  aria-label="Más acciones"
                  title="Más acciones"
                >
                  <MoreHorizontal size={16} />
                </button>
                {masMenuOpen && (
                  <div role="menu" className="absolute right-0 z-30 mt-1 w-64 card p-1 shadow-lg">
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setMasMenuOpen(false);
                        setConfirmReenviar(true);
                      }}
                      className="w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                    >
                      <Send size={14} className="text-gray-400" /> Reenviar PDF y notificaciones
                    </button>
                    {puedeEliminar && (
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          setMasMenuOpen(false);
                          setConfirmEliminar(true);
                        }}
                        className="w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-md text-sm text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={14} /> Eliminar orden
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---- Cliente ---- */}
      <Section title="Cliente" icon={User} action={accionSeccion('cliente')}>
        {!editando('cliente') ? (
          <>
            <div className="mb-4">
              {orden.cliente_id ? (
                <button
                  type="button"
                  onClick={() => navigate(`/clientes/${orden.cliente_id}`)}
                  className="inline-flex items-center gap-1.5 max-w-full text-xs font-medium text-condor-800 bg-condor-50 border border-condor-100 rounded-full px-2.5 py-1 hover:bg-condor-100 transition-colors"
                  title="Abrir ficha del cliente"
                >
                  <Link2 size={12} className="shrink-0" />
                  <span className="truncate">
                    Vinculado a {clienteLinkLabel || `cliente #${orden.cliente_id}`}
                    {orden.cliente?.rut ? ` · RUT ${formatRut(orden.cliente.rut)}` : ''}
                  </span>
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1">
                  <Unlink size={12} /> Sin cliente vinculado
                </span>
              )}
            </div>
            <FieldGrid>
              <Field label="Cliente / Empresa" value={orden.cliente_empresa} />
              <Field label="Supervisor / Encargado" value={orden.supervisor} />
              <Field label="RUT" value={orden.cliente?.rut ? formatRut(orden.cliente.rut) : null} mono />
              <Field label="Email" value={orden.cliente_email} />
              <Field label="Teléfono" value={orden.cliente_telefono} />
              <Field label="Dirección" value={[orden.direccion, orden.comuna].filter(Boolean).join(', ')} />
            </FieldGrid>
          </>
        ) : (
          <div className="space-y-4">
            {/* Vincular / cambiar / desenlazar cliente del catálogo */}
            {buscandoCliente ? (
              <div className="max-w-lg">
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
              <div className="flex flex-wrap items-center justify-between gap-2 bg-condor-50 border border-condor-100 rounded-lg px-3 py-2.5 max-w-lg">
                <div className="min-w-0 flex items-center gap-2">
                  <Link2 size={14} className="text-condor-700 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-condor-900 truncate">{form.clienteLabel}</p>
                    {form.clienteRut && <p className="text-xs text-condor-700 font-mono">{formatRut(form.clienteRut)}</p>}
                  </div>
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
                    className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-800 px-2 py-1"
                  >
                    <Unlink size={12} /> Desvincular
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5 max-w-lg">
                <p className="text-sm text-gray-500 inline-flex items-center gap-1.5">
                  <Unlink size={13} /> Sin cliente vinculado
                </p>
                <button
                  type="button"
                  onClick={() => setBuscandoCliente(true)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-condor-700 hover:text-condor-900"
                >
                  <Search size={12} /> Buscar cliente
                </button>
              </div>
            )}

            <FieldGrid className="gap-y-3">
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
                <input type="email" value={form.clienteEmail} onChange={(e) => setCampo('clienteEmail', e.target.value)} className="input-field" />
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
            </FieldGrid>
            {pieSeccion('cliente')}
          </div>
        )}
      </Section>

      {/* ---- Trabajo ---- */}
      <Section title="Trabajo" icon={Wrench} action={accionSeccion('trabajo')}>
        {!editando('trabajo') ? (
          <FieldGrid>
            <Field label="Fecha de la orden" value={formatFecha(orden.fecha)} />
            <Field label="Hora inicio" value={formatFechaHora(orden.hora_inicio)} />
            <Field label="Hora término" value={formatFechaHora(orden.hora_termino)} />
            <Field label="Duración" value={formatDuracion(orden.hora_inicio, orden.hora_termino)} />
            <Field label="Patente vehículo" value={orden.patente_vehiculo} mono />
            <Field label="Garantía" value={orden.garantia} />
            <Field label={`Trabajos realizados (${trabajos.length})`} span>
              {trabajos.length === 0 ? (
                <p className="text-sm text-gray-400">—</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {trabajos.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-1.5 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1"
                    >
                      {t.servicio_nombre || t.nombre_personalizado}
                      <span className="text-xs font-semibold text-gray-500">x{t.cantidad}</span>
                    </span>
                  ))}
                </div>
              )}
            </Field>
            <Field label="Descripción del trabajo" span>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{orden.descripcion_trabajo || <span className="text-gray-400">Sin descripción.</span>}</p>
            </Field>
            {orden.observaciones && (
              <Field label="Observaciones" span>
                <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  <p className="text-sm text-amber-800 whitespace-pre-wrap">{orden.observaciones}</p>
                </div>
              </Field>
            )}
          </FieldGrid>
        ) : (
          <div className="space-y-4">
            <FieldGrid className="gap-y-3">
              <div>
                <label className="label-field">Fecha de la orden</label>
                <input type="date" value={form.fecha || ''} onChange={(e) => setCampo('fecha', e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="label-field">Hora inicio</label>
                <input type="datetime-local" value={form.horaInicio} onChange={(e) => setCampo('horaInicio', e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="label-field">Hora término</label>
                <input type="datetime-local" value={form.horaTermino} onChange={(e) => setCampo('horaTermino', e.target.value)} className="input-field" />
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
            </FieldGrid>

            <div>
              <label className="label-field">Trabajos realizados</label>
              <div className="space-y-2">
                {form.trabajos.length === 0 && (
                  <p className="text-sm text-gray-400">Sin trabajos — agrega al menos uno.</p>
                )}
                {form.trabajos.map((t) => (
                  <div key={t.key} className="flex flex-wrap items-center gap-2">
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
                      className="input-field flex-1 min-w-[140px]"
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
                        className="input-field order-last sm:order-none w-full sm:w-auto sm:flex-1 sm:min-w-[160px]"
                      />
                    )}
                    <input
                      type="number"
                      min="1"
                      value={t.cantidad}
                      onChange={(e) => actualizarTrabajo(t.key, { cantidad: e.target.value })}
                      className="input-field w-16 sm:w-20 shrink-0"
                      aria-label="Cantidad"
                    />
                    <button
                      type="button"
                      onClick={() => quitarTrabajo(t.key)}
                      className="shrink-0 h-10 w-10 inline-flex items-center justify-center text-gray-400 hover:text-red-600 transition-colors"
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
            {pieSeccion('trabajo')}
          </div>
        )}
      </Section>

      {/* ---- Pago ---- */}
      <Section title="Pago" icon={Wallet} action={accionSeccion('pago')}>
        {!editando('pago') ? (
          <FieldGrid>
            <Field label="Total" value={formatCLP(orden.total)} />
            <Field label="Método de pago" value={orden.metodo_pago} />
            <Field label="Requiere factura" value={orden.requiere_factura ? 'Sí' : 'No'} />
            <Field label="Orden de compra" value={orden.orden_compra} />
          </FieldGrid>
        ) : (
          <div className="space-y-4">
            <FieldGrid className="gap-y-3">
              <div>
                <label className="label-field">Total (CLP)</label>
                <input type="number" min="0" value={form.total} onChange={(e) => setCampo('total', e.target.value)} className="input-field" />
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
              <div>
                <label className="label-field">Orden de compra</label>
                <input value={form.ordenCompra} onChange={(e) => setCampo('ordenCompra', e.target.value)} className="input-field" />
              </div>
            </FieldGrid>
            {pieSeccion('pago')}
          </div>
        )}
      </Section>

      {/* ---- Equipo ---- */}
      <Section title="Equipo" icon={Truck} action={accionSeccion('equipo')}>
        {!editando('equipo') ? (
          <FieldGrid>
            <Field label={empleados.length === 1 ? 'Técnico' : 'Técnicos'} span>
              {empleados.length === 0 ? (
                <p className="text-sm text-gray-400">Sin personal asignado.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {empleados.map((t) => (
                    <span key={t.id} className="text-xs font-medium bg-condor-50 text-condor-800 rounded-full px-2.5 py-1">
                      {t.nombre}
                    </span>
                  ))}
                </div>
              )}
            </Field>
          </FieldGrid>
        ) : (
          <div className="space-y-4">
            {tecnicos.length === 0 ? (
              <p className="text-sm text-gray-400">Cargando técnicos...</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-w-3xl">
                {tecnicos.map((t) => (
                  <label key={t.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.empleadoIds.includes(t.id)}
                      onChange={() => toggleTecnico(t.id)}
                      className="rounded border-gray-300 text-condor-600 focus:ring-condor-400"
                    />
                    <span className="text-sm text-gray-700 truncate">{t.nombre}</span>
                    {t.codigo && <span className="text-xs text-gray-400 font-mono ml-auto">{t.codigo}</span>}
                  </label>
                ))}
              </div>
            )}
            {pieSeccion('equipo')}
          </div>
        )}
      </Section>

      {/* Fotos / Notificaciones / Historial — no aplican en modo creación: la orden
          todavía no existe, no puede tener fotos, notificaciones ni cambios auditados. */}
      {!esNuevaOrden && (
        <>
          {/* ---- Fotos ---- */}
          <Section
            title={`Evidencia fotográfica (${fotos.length})`}
            icon={Camera}
            action={
              fotosEditando
                ? <CancelarBtn onClick={cancelarFotos} disabled={guardandoFotos} />
                : <EditarBtn onClick={abrirFotos} />
            }
          >
            {fotosEditando ? (
              <div className="space-y-5">
                {['antes', 'despues'].map((tipo) => {
                  const existentes = (orden.fotos || []).filter((f) => f.tipo === tipo);
                  return (
                    <div key={tipo}>
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">{tipo === 'antes' ? 'Antes' : 'Después'}</p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                        {existentes.map((f) => {
                          const marcada = fotosParaEliminar.includes(f.id);
                          return (
                            <div key={f.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                              {f.url ? (
                                <img src={f.url} alt="" className={`w-full h-full object-cover transition-opacity ${marcada ? 'opacity-30' : ''}`} />
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                                  <ImageOff size={18} />
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => toggleEliminarFotoExistente(f.id)}
                                className={`absolute top-1 right-1 rounded-full p-1.5 ${
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
                              className="absolute top-1 right-1 rounded-full p-1.5 bg-black/50 text-white hover:bg-red-600"
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
                <SeccionAcciones onGuardar={guardarFotos} onCancelar={cancelarFotos} guardando={guardandoFotos} guardarLabel="Guardar fotos" />
              </div>
            ) : (
              <>
                {fotos.length === 0 ? (
                  <p className="text-sm text-gray-400">Esta orden no tiene fotos registradas.</p>
                ) : (
                  <div className="space-y-4">
                    {['antes', 'despues'].map((tipo) => {
                      const lista = fotos.filter((f) => f.tipo === tipo);
                      if (lista.length === 0) return null;
                      return (
                        <div key={tipo}>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
                            {tipo === 'antes' ? 'Antes' : 'Después'} ({lista.length})
                          </p>
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                            {lista.map((f) => (
                              <button
                                key={f.id}
                                onClick={() => openViewer(fotos.indexOf(f))}
                                className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 hover:ring-2 hover:ring-condor-400 transition-all group"
                              >
                                {f.url ? (
                                  <img src={f.url} alt={f.label} className="w-full h-full object-cover" loading="lazy" />
                                ) : (
                                  <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                                    <ImageOff size={20} />
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className={`${fotos.length > 0 ? 'mt-5 pt-5 border-t border-gray-100' : 'mt-4'}`}>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Firma del supervisor</p>
                  {firma ? (
                    <div className="inline-block rounded-lg border border-gray-200 bg-white p-2">
                      <img src={firma.url} alt="Firma del supervisor" className="h-20 object-contain" />
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">No registrada.</p>
                  )}
                </div>
              </>
            )}
          </Section>

          {/* ---- Notificaciones ---- */}
          <Section title="Notificaciones" icon={Bell}>
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
                        Plantilla: {n.plantilla || '—'} · {formatFechaHora(n.sent_at)}
                      </p>
                      {!n.ok && n.error && <p className="text-xs text-red-500 mt-0.5 break-words">{n.error}</p>}
                    </div>
                    {n.ok ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 shrink-0">
                        <CheckCircle2 size={14} /> Entregado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500 shrink-0" title={n.error}>
                        <XCircle size={14} /> Falló
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ---- Historial de cambios (auditoría) ---- */}
          <Section
            title="Historial de cambios"
            icon={History}
            action={
              auditoria.length > 5 && (
                <button
                  type="button"
                  onClick={() => setAuditoriaExpandida((v) => !v)}
                  className="text-xs font-semibold text-condor-700 hover:text-condor-900"
                >
                  {auditoriaExpandida ? 'Ver menos' : `Ver todo (${auditoria.length})`}
                </button>
              )
            }
          >
            {auditoria.length === 0 ? (
              <p className="text-sm text-gray-400">Sin cambios registrados todavía.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {auditoriaVisible.map((a) => (
                  <div key={a.id} className="py-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-2">
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
          </Section>
        </>
      )}

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
        open={confirmEliminar}
        onClose={() => setConfirmEliminar(false)}
        onConfirm={handleEliminar}
        loading={eliminando}
        danger
        title="Eliminar orden"
        message={orden ? `Se eliminará OT-${orden.numero_orden_display} con sus trabajos, fotos y PDF. Esta acción no se puede deshacer.` : ''}
        confirmLabel="Eliminar orden"
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
