import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AppFooter from '../components/AppFooter';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  Send,
  Loader2,
  CheckSquare,
  Square,
  Check,
  Camera,
  X,
  AlertCircle,
} from 'lucide-react';
import { METODOS_PAGO, GARANTIAS, WIZARD_STEPS, SERVICIOS_FALLBACK } from '../utils/constants';
import { formatRut, formatCLP, parseCLP, todayISO, compressImage, fileToBase64, base64ToFile } from '../utils/helpers';
import { buscarClientes, getTecnicosPublic, crearOrden, actualizarOrden, getServicios } from '../utils/api';
import SignaturePad from '../components/SignaturePad';
import Summary from '../components/Summary';

const MAX_FOTOS = 6;

const formatPatente = (value) => {
  const clean = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  let result = '';
  for (let i = 0; i < clean.length && i < 6; i++) {
    if (i === 2 || i === 4) result += '-';
    result += clean[i];
  }
  return result;
};

const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const initialFormData = () => ({
  clienteRut: '',
  clienteEmpresa: '',
  clienteEmail: '',
  clienteTelefono: '',
  direccion: '',
  comuna: '',
  ordenCompra: '',
  supervisor: '',
  horaInicio: '',
  horaTermino: '',
  trabajos: [],
  descripcion: '',
  observaciones: '',
  total: '',
  metodoPago: 'Efectivo',
  garantia: 'Sin garantía',
  requiereFactura: 'No',
  clienteRecordId: null,
  personal: [],
  patenteVehiculo: '',
  firmaBase64: null,
});

// Compress image and convert to JPEG base64
async function processImage(file) {
  const compressed = await compressImage(file);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsDataURL(compressed);
  });
}

function FieldError({ message }) {
  if (!message) return null;
  return (
    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
      <AlertCircle size={12} />
      {message}
    </p>
  );
}

const SESSION_KEY = 'condor_wizard_state';

function loadSessionState() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function saveSessionState(form, step, idempotencyKey) {
  try {
    // Exclude firma (too large for sessionStorage); photos are in refs, not in form
    const { firmaBase64, ...rest } = form;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ form: rest, step, idempotencyKey }));
  } catch { /* ignore quota errors */ }
}

export function clearWizardSession() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem('fotosAntes');
  sessionStorage.removeItem('fotosDespues');
}

export default function OrdenWizardPage({ user, onOrdenEnviada, editMode, subscriptionActive = true }) {
  const wizardNavigate = useNavigate();

  // Redirect to dashboard if subscription is inactive
  useEffect(() => {
    if (!subscriptionActive) wizardNavigate('/');
  }, [subscriptionActive, wizardNavigate]);

  const saved = useRef(editMode ? null : loadSessionState());
  const [step, setStep] = useState(saved.current?.step || 0);
  const [form, setForm] = useState(() => saved.current?.form ? { ...initialFormData(), ...saved.current.form } : initialFormData());
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [sendingText, setSendingText] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  const [errors, setErrors] = useState({});

  // Idempotency key — generated once per wizard session, reused on retry
  const [idempotencyKey] = useState(() => saved.current?.idempotencyKey || crypto.randomUUID());

  // Dynamic services from Airtable
  const [servicios, setServicios] = useState([]);
  const [serviciosLoading, setServiciosLoading] = useState(true);

  // RUT search with debounce
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  // Tecnicos
  const [tecnicos, setTecnicos] = useState([]);

  // Photo file input refs
  const fotosAntesInputRef = useRef(null);
  const fotosDespuesInputRef = useRef(null);

  // Photo files refs (persist across step changes)
  const fotosAntesFilesRef = useRef([]);
  const fotosDespuesFilesRef = useRef([]);

  // Photo previews (ObjectURLs for UI)
  const [fotosAntesPreview, setFotosAntesPreview] = useState([]);
  const [fotosDespuesPreview, setFotosDespuesPreview] = useState([]);

  const { recordId: editRecordId } = editMode ? useParams() : { recordId: null };
  const [editLoading, setEditLoading] = useState(!!editMode);

  // Custom service inputs
  const [customNombre, setCustomNombre] = useState('');
  const [customCantidad, setCustomCantidad] = useState('1');

  // Load services from Airtable
  const cargarServicios = async () => {
    setServiciosLoading(true);
    try {
      const res = await getServicios();
      const lista = res.data || [];
      setServicios(lista);
      setForm((prev) => {
        // Only set trabajos if not already loaded (edit mode may have set them)
        if (prev.trabajos.length > 0) return prev;
        return {
          ...prev,
          trabajos: lista.map((s) => ({ id: s.id, nombre: s.nombre, checked: false, cantidad: 0 })),
        };
      });
    } catch {
      // Offline or error: use fallback list
      const fallback = SERVICIOS_FALLBACK.map((nombre, i) => ({ id: `fallback_${i}`, nombre }));
      setServicios(fallback);
      setForm((prev) => {
        if (prev.trabajos.length > 0) return prev;
        return {
          ...prev,
          trabajos: fallback.map((s) => ({ id: s.id, nombre: s.nombre, checked: false, cantidad: 0 })),
        };
      });
    } finally {
      setServiciosLoading(false);
    }
  };

  useEffect(() => {
    cargarServicios();
    getTecnicosPublic()
      .then((res) => setTecnicos(res.data || []))
      .catch(() => {});
    setForm((prev) => ({ ...prev, personal: [{ nombre: user.nombre, esEmpleado: true, recordId: user.recordId || null }] }));
  }, [user.nombre]);

  // Load existing order for edit mode
  useEffect(() => {
    if (!editMode || !editRecordId) return;
    const loadOrden = async () => {
      try {
        const baseUrl = (import.meta.env.VITE_API_URL || 'https://clientes-condor-api.f8ihph.easypanel.host/api').replace(/\/api\/?$/, '');
        const res = await fetch(`${baseUrl}/api/ordenes`);
        const data = await res.json();
        const orden = (data.data || []).find(o => o.recordId === editRecordId);
        if (orden) {
          let trabajos = [];
          try { trabajos = typeof orden.trabajos === 'string' ? JSON.parse(orden.trabajos) : orden.trabajos || []; } catch { trabajos = []; }

          // Wait for servicios to be loaded to map correctly
          const srvRes = await getServicios();
          const srvList = srvRes.data || [];
          const mappedTrabajos = srvList.map(s => {
            const found = trabajos.find(t => (t.trabajo || t.nombre) === s.nombre);
            return { id: s.id, nombre: s.nombre, checked: found ? found.cantidad > 0 : false, cantidad: found ? found.cantidad : 0 };
          });

          setForm({
            clienteRut: typeof orden.clienteRut === 'object' ? '' : (orden.clienteRut || ''),
            clienteEmpresa: orden.clienteEmpresa || '',
            clienteEmail: orden.email || '',
            clienteTelefono: orden.telefono || '',
            direccion: orden.direccion || '',
            comuna: orden.comuna || '',
            ordenCompra: orden.ordenCompra || '',
            supervisor: orden.supervisor || '',
            horaInicio: orden.horaInicio || '',
            horaTermino: orden.horaTermino || '',
            trabajos: mappedTrabajos,
            descripcion: orden.descripcion || '',
            observaciones: orden.observaciones || '',
            total: orden.total ? String(orden.total) : '',
            metodoPago: orden.metodoPago || 'Efectivo',
            garantia: orden.garantia || 'Sin garantía',
            requiereFactura: orden.requiereFactura || 'No',
            personal: [{ nombre: user.nombre, esEmpleado: true, recordId: user.recordId || null }],
            patenteVehiculo: orden.patente || '',
            firmaBase64: null,
            clienteRecordId: null,
          });
        }
      } catch (err) {
        console.error('Error cargando orden para edición:', err);
      } finally {
        setEditLoading(false);
      }
    };
    loadOrden();
  }, [editMode, editRecordId, user.nombre, user.recordId]);

  // Persist form state to sessionStorage on changes (not in edit mode)
  useEffect(() => {
    if (editMode) return;
    saveSessionState(form, step, idempotencyKey);
  }, [form, step, idempotencyKey, editMode]);

  // Restore photos from sessionStorage on mount (survives page refresh)
  useEffect(() => {
    if (editMode) return;
    try {
      const savedAntes = sessionStorage.getItem('fotosAntes');
      if (savedAntes) {
        const meta = JSON.parse(savedAntes);
        const files = meta.map(m => base64ToFile(m.data, m.name));
        fotosAntesFilesRef.current = files;
        setFotosAntesPreview(files.map(f => ({ name: f.name, url: URL.createObjectURL(f) })));
      }
    } catch (err) { console.warn('Error restaurando fotos antes:', err); }
    try {
      const savedDespues = sessionStorage.getItem('fotosDespues');
      if (savedDespues) {
        const meta = JSON.parse(savedDespues);
        const files = meta.map(m => base64ToFile(m.data, m.name));
        fotosDespuesFilesRef.current = files;
        setFotosDespuesPreview(files.map(f => ({ name: f.name, url: URL.createObjectURL(f) })));
      }
    } catch (err) { console.warn('Error restaurando fotos después:', err); }
  }, []);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field when user types
    if (errors[field]) {
      setErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
    }
  };

  // Debounced RUT search
  const handleRutChange = useCallback((value) => {
    const formatted = formatRut(value);
    updateField('clienteRut', formatted);
    clearTimeout(debounceRef.current);
    const raw = value.replace(/[^0-9kK]/g, '');
    if (raw.length < 2) {
      setSearchResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await buscarClientes(raw);
        setSearchResults(res.data || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  const selectCliente = (cliente) => {
    setForm((prev) => ({
      ...prev,
      clienteRut: cliente.rut || '',
      clienteEmpresa: cliente.empresa && cliente.empresa.trim() ? cliente.empresa : (cliente.nombre || ''),
      supervisor: cliente.nombre || '',
      clienteEmail: cliente.email || '',
      clienteTelefono: cliente.telefono || '',
      direccion: cliente.direccion || '',
      comuna: cliente.comuna || '',
      clienteRecordId: cliente.recordId || null,
    }));
    setSearchResults([]);
    setErrors({});
  };

  // Trabajos
  const toggleTrabajo = (idx) => {
    setForm((prev) => {
      const trabajos = [...prev.trabajos];
      const t = { ...trabajos[idx] };
      t.checked = !t.checked;
      t.cantidad = t.checked ? Math.max(t.cantidad, 1) : 0;
      trabajos[idx] = t;
      return { ...prev, trabajos };
    });
    if (errors.trabajos) setErrors((prev) => { const next = { ...prev }; delete next.trabajos; return next; });
  };

  const updateCantidad = (idx, delta) => {
    setForm((prev) => {
      const trabajos = [...prev.trabajos];
      const t = { ...trabajos[idx] };
      t.cantidad = Math.max(0, t.cantidad + delta);
      if (t.cantidad === 0) t.checked = false;
      if (t.cantidad > 0) t.checked = true;
      trabajos[idx] = t;
      return { ...prev, trabajos };
    });
  };

  const addCustomService = () => {
    const nombre = customNombre.trim();
    if (!nombre) return;
    const cantidad = Math.max(1, parseInt(customCantidad) || 1);
    setForm((prev) => ({
      ...prev,
      trabajos: [...prev.trabajos, { id: `custom_${Date.now()}`, nombre, checked: true, cantidad }],
    }));
    setCustomNombre('');
    setCustomCantidad('1');
    if (errors.trabajos) setErrors((prev) => { const next = { ...prev }; delete next.trabajos; return next; });
  };

  // Personal
  const addTecnicoToPersonal = (tecnico) => {
    if (form.personal.some((p) => p.nombre === tecnico.nombre)) return;
    updateField('personal', [...form.personal, { nombre: tecnico.nombre, esEmpleado: true, recordId: tecnico.recordId || null }]);
  };

  const removePersonal = (idx) => {
    updateField('personal', form.personal.filter((_, i) => i !== idx));
  };

  // Photos — files live in refs, previews in state, persisted to sessionStorage as base64
  const saveFotosToSession = async (field, filesArray) => {
    try {
      const base64Array = await Promise.all(filesArray.map(f => fileToBase64(f)));
      const meta = filesArray.map((f, i) => ({ name: f.name, data: base64Array[i] }));
      sessionStorage.setItem(field, JSON.stringify(meta));
    } catch (err) {
      console.warn('No se pudieron guardar fotos en sessionStorage:', err);
    }
  };

  const handleFotoUpload = async (e, field) => {
    const files = Array.from(e.target.files || []);
    const filesRef = field === 'fotosAntes' ? fotosAntesFilesRef : fotosDespuesFilesRef;
    const setPreview = field === 'fotosAntes' ? setFotosAntesPreview : setFotosDespuesPreview;
    const remaining = MAX_FOTOS - filesRef.current.length;
    if (remaining <= 0) return;
    const toProcess = files.slice(0, remaining);
    const compressed = await Promise.all(toProcess.map(f => compressImage(f)));
    filesRef.current = [...filesRef.current, ...compressed];
    setPreview(filesRef.current.map(f => ({ name: f.name, url: URL.createObjectURL(f) })));
    saveFotosToSession(field, filesRef.current);
    if (errors[field]) setErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
    e.target.value = '';
  };

  const removeFoto = (field, idx) => {
    const filesRef = field === 'fotosAntes' ? fotosAntesFilesRef : fotosDespuesFilesRef;
    const setPreview = field === 'fotosAntes' ? setFotosAntesPreview : setFotosDespuesPreview;
    const preview = field === 'fotosAntes' ? fotosAntesPreview : fotosDespuesPreview;
    if (preview[idx]?.url) URL.revokeObjectURL(preview[idx].url);
    filesRef.current = filesRef.current.filter((_, i) => i !== idx);
    setPreview(filesRef.current.map(f => ({ name: f.name, url: URL.createObjectURL(f) })));
    saveFotosToSession(field, filesRef.current);
  };

  // --- VALIDATION (only at submit) ---
  const validateAll = () => {
    const errs = {};

    // Step 0: Cliente
    if (!form.clienteRut.trim()) errs.clienteRut = 'Debe buscar y seleccionar un cliente por RUT';
    if (!form.clienteEmpresa.trim()) errs.clienteEmpresa = 'El campo Cliente / Empresa es obligatorio';
    if (!form.supervisor.trim()) errs.supervisor = 'El campo Supervisor / Encargado es obligatorio';
    if (!form.clienteEmail.trim()) errs.clienteEmail = 'El email es obligatorio';
    else if (!validateEmail(form.clienteEmail.trim())) errs.clienteEmail = 'El formato del email no es válido';
    if (!form.clienteTelefono.trim()) errs.clienteTelefono = 'El teléfono es obligatorio';
    if (!form.direccion.trim()) errs.direccion = 'La dirección es obligatoria';
    if (!form.comuna.trim()) errs.comuna = 'La comuna es obligatoria';

    // Step 1: Trabajos
    if (!form.horaInicio) errs.horaInicio = 'La hora de inicio es obligatoria';
    if (!form.horaTermino) errs.horaTermino = 'La hora de término es obligatoria';
    const tieneTrabajos = form.trabajos.some((t) => t.cantidad > 0);
    if (!tieneTrabajos) errs.trabajos = 'Debe seleccionar al menos un trabajo realizado';
    if (!form.descripcion.trim()) errs.descripcion = 'La descripción del trabajo es obligatoria';

    // Step 2: Personal
    if (!form.patenteVehiculo.trim()) errs.patenteVehiculo = 'La patente es obligatoria';

    // Step 3: Fotos (check refs, not form state)
    if (fotosAntesFilesRef.current.length === 0) errs.fotosAntes = 'Debe adjuntar al menos 1 foto del antes';
    if (fotosDespuesFilesRef.current.length === 0) errs.fotosDespues = 'Debe adjuntar al menos 1 foto del después';

    // Step 4: Firma
    if (!form.firmaBase64) errs.firmaBase64 = 'La firma es obligatoria para enviar la orden';

    return errs;
  };

  // Map field names to their step index
  const fieldToStep = {
    clienteRut: 0, clienteEmpresa: 0, supervisor: 0, clienteEmail: 0, clienteTelefono: 0, direccion: 0, comuna: 0,
    horaInicio: 1, horaTermino: 1, trabajos: 1, descripcion: 1,
    patenteVehiculo: 2,
    fotosAntes: 3, fotosDespues: 3,
    firmaBase64: 4,
  };

  const handleNext = () => {
    setErrors({});
    setStep(step + 1);
  };

  // Navigation
  const goToStep = (s) => { setErrors({}); setStep(s); };

  const handleSubmit = async () => {
    // Validate ALL steps at once
    const errs = validateAll();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      // Navigate to the first step that has errors
      const firstErrField = Object.keys(errs)[0];
      const targetStep = fieldToStep[firstErrField] ?? 0;
      if (targetStep !== step) {
        setStep(targetStep);
      }
      setTimeout(() => {
        const el = document.querySelector('[data-error="true"]');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return;
    }

    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setSendingText('Preparando orden...');

    const payload = {
      fecha: todayISO(),
      idempotencyKey,
      clienteEmpresa: form.clienteEmpresa,
      clienteRut: form.clienteRut,
      clienteEmail: form.clienteEmail,
      clienteTelefono: form.clienteTelefono,
      direccion: form.direccion,
      comuna: form.comuna,
      ordenCompra: form.ordenCompra,
      supervisor: form.supervisor,
      horaInicio: form.horaInicio,
      horaTermino: form.horaTermino,
      trabajos: form.trabajos
        .filter((t) => t.cantidad > 0)
        .map((t) => ({ trabajo: t.nombre, cantidad: t.cantidad })),
      descripcion: form.descripcion,
      observaciones: form.observaciones,
      personal: form.personal.map((p) => p.nombre),
      patenteVehiculo: form.patenteVehiculo,
      total: parseCLP(form.total),
      metodoPago: form.metodoPago,
      garantia: form.garantia,
      requiereFactura: form.requiereFactura,
      fotosAntes: await Promise.all(fotosAntesFilesRef.current.map(processImage)),
      fotosDespues: await Promise.all(fotosDespuesFilesRef.current.map(processImage)),
      firmaBase64: form.firmaBase64,
      clienteRecordId: form.clienteRecordId,
      empleadosRecordIds: form.personal.filter(p => p.esEmpleado && p.recordId).map(p => p.recordId),
      serviciosIds: form.trabajos
        .filter(t => t.cantidad > 0 && t.id && !t.id.startsWith('fallback_') && !t.id.startsWith('custom_'))
        .map(t => t.id),
    };

    try {
      if (editMode && editRecordId) {
        setSendingText('Actualizando orden...');
        const result = await actualizarOrden(editRecordId, payload);
        if (result?.data?.webhookOk === false) {
          payload._webhookError = result.data.webhookError || 'Error desconocido en webhook';
        }
        if (result?.data?.airtableOk) {
          payload._airtableOk = true;
          payload._recordId = result.data.recordId;
        }
        if (result?.data?.webhookData) {
          payload._webhookData = result.data.webhookData;
        }
        if (result?.success === false) {
          payload._submitError = result.error || 'Error al actualizar la orden';
        }
      } else {
        if (!form.clienteRecordId && form.clienteRut) {
          setSendingText('Registrando cliente...');
        }
        setSendingText('Guardando orden...');
        const result = await crearOrden(payload);
        if (result?.offline) {
          payload._offline = true;
        } else {
          if (fotosAntesFilesRef.current.length > 0 || fotosDespuesFilesRef.current.length > 0) {
            setSendingText('Subiendo fotos...');
          }
          setSendingText('Procesando...');
          if (result?.data?.webhookOk === false) {
            payload._webhookError = result.data.webhookError || 'Error desconocido en webhook';
          }
          if (result?.data?.airtableOk) {
            payload._airtableOk = true;
            payload._recordId = result.data.recordId;
          }
          if (result?.data?.webhookData) {
            payload._webhookData = result.data.webhookData;
          }
          if (result?.data?.duplicate) {
            payload._duplicate = true;
          }
          if (result?.success === false) {
            payload._submitError = result.error || 'Error al enviar la orden';
          }
        }
      }
    } catch (err) {
      payload._submitError = err.message || 'Error al enviar la orden';
    }
    if (payload._submitError) {
      // Allow retry on error
      sendingRef.current = false;
    } else {
      // Clear sessionStorage on success
      clearWizardSession();
    }
    setSending(false);
    setSendingText('');
    onOrdenEnviada(payload);
  };

  if (editLoading) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-condor-400" />
          <p className="text-sm text-gray-400">Cargando orden...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)]">
      <div className="flex-1 max-w-lg mx-auto w-full px-4 pt-4 pb-24">
        {/* Step indicator */}
        <div className="flex items-start justify-between mb-8">
          {WIZARD_STEPS.map((s, i) => (
            <div key={s.id} className="flex flex-col items-center flex-1 relative">
              {i > 0 && (
                <div
                  className={`absolute top-4 right-1/2 w-full h-0.5 -translate-y-1/2 ${
                    i <= step ? 'bg-condor-900' : 'bg-gray-200'
                  }`}
                  style={{ left: '-50%' }}
                />
              )}
              <button
                type="button"
                onClick={() => i !== step && goToStep(i)}
                className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all cursor-pointer ${
                  i === step
                    ? 'bg-accent-600 text-white ring-4 ring-accent-100'
                    : i < step
                      ? 'bg-condor-900 text-white'
                      : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                }`}
              >
                {i < step ? <Check size={14} strokeWidth={3} /> : s.id}
              </button>
              <span
                className={`mt-1.5 text-[10px] font-medium ${
                  i === step ? 'text-accent-600' : i < step ? 'text-condor-900' : 'text-gray-400'
                }`}
              >
                {s.label}
              </span>
            </div>
          ))}
        </div>

        {/* Step 1: Cliente */}
        {step === 0 && (
          <div className="space-y-5">
            <h2 className="font-heading font-bold text-xl text-condor-900">
              Datos del Cliente
            </h2>

            {/* RUT unified search */}
            <div className="relative" data-error={!!errors.clienteRut}>
              <label className="label-field">RUT <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={form.clienteRut}
                onChange={(e) => handleRutChange(e.target.value)}
                placeholder="12.345.678-9"
                className={`input-field ${errors.clienteRut ? 'border-red-400 ring-1 ring-red-200' : ''}`}
                autoComplete="off"
              />
              {searching && (
                <Loader2 size={16} className="absolute right-3 top-9 animate-spin text-gray-400" />
              )}
              <FieldError message={errors.clienteRut} />
              {searchResults.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-2xl shadow-lg overflow-hidden">
                  {searchResults.map((c) => (
                    <button
                      key={c.rut}
                      type="button"
                      onClick={() => selectCliente(c)}
                      className="w-full text-left px-4 py-3 hover:bg-condor-50 border-b border-gray-100 last:border-0"
                    >
                      <p className="text-sm font-medium text-gray-900">{c.empresa || c.nombre}</p>
                      <p className="text-xs text-gray-500">{c.rut} — {c.nombre}{c.direccion ? ` — ${c.direccion}` : ''}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div data-error={!!errors.clienteEmpresa}>
                <label className="label-field">Cliente / Empresa <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={form.clienteEmpresa}
                  onChange={(e) => updateField('clienteEmpresa', e.target.value)}
                  className={`input-field ${errors.clienteEmpresa ? 'border-red-400 ring-1 ring-red-200' : ''}`}
                />
                <FieldError message={errors.clienteEmpresa} />
              </div>
              <div data-error={!!errors.supervisor}>
                <label className="label-field">Supervisor / Encargado <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={form.supervisor}
                  onChange={(e) => updateField('supervisor', e.target.value)}
                  className={`input-field ${errors.supervisor ? 'border-red-400 ring-1 ring-red-200' : ''}`}
                />
                <FieldError message={errors.supervisor} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div data-error={!!errors.clienteEmail}>
                  <label className="label-field">Email <span className="text-red-400">*</span></label>
                  <input
                    type="email"
                    value={form.clienteEmail}
                    onChange={(e) => updateField('clienteEmail', e.target.value)}
                    className={`input-field ${errors.clienteEmail ? 'border-red-400 ring-1 ring-red-200' : ''}`}
                  />
                  <FieldError message={errors.clienteEmail} />
                </div>
                <div data-error={!!errors.clienteTelefono}>
                  <label className="label-field">Teléfono <span className="text-red-400">*</span></label>
                  <input
                    type="tel"
                    value={form.clienteTelefono}
                    onChange={(e) => updateField('clienteTelefono', e.target.value)}
                    placeholder="+56 9"
                    className={`input-field ${errors.clienteTelefono ? 'border-red-400 ring-1 ring-red-200' : ''}`}
                  />
                  <FieldError message={errors.clienteTelefono} />
                </div>
              </div>
              <div data-error={!!errors.direccion}>
                <label className="label-field">Dirección <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={form.direccion}
                  onChange={(e) => updateField('direccion', e.target.value)}
                  className={`input-field ${errors.direccion ? 'border-red-400 ring-1 ring-red-200' : ''}`}
                />
                <FieldError message={errors.direccion} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div data-error={!!errors.comuna}>
                  <label className="label-field">Comuna <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={form.comuna}
                    onChange={(e) => updateField('comuna', e.target.value)}
                    className={`input-field ${errors.comuna ? 'border-red-400 ring-1 ring-red-200' : ''}`}
                  />
                  <FieldError message={errors.comuna} />
                </div>
                <div>
                  <label className="label-field">Orden de Compra</label>
                  <input
                    type="text"
                    value={form.ordenCompra}
                    onChange={(e) => updateField('ordenCompra', e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Trabajos */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="font-heading font-bold text-xl text-condor-900">
              Trabajos Realizados
            </h2>

            {/* Horarios */}
            <div className="flex flex-col gap-4 overflow-hidden">
              <div className="w-full" data-error={!!errors.horaInicio}>
                <label className="label-field">Fecha y Hora Inicio <span className="text-red-400">*</span></label>
                <input
                  type="datetime-local"
                  value={form.horaInicio}
                  onChange={(e) => updateField('horaInicio', e.target.value)}
                  className={`input-field w-full max-w-full box-border ${errors.horaInicio ? 'border-red-400 ring-1 ring-red-200' : ''}`}
                />
                <FieldError message={errors.horaInicio} />
              </div>
              <div className="w-full" data-error={!!errors.horaTermino}>
                <label className="label-field">Fecha y Hora Término <span className="text-red-400">*</span></label>
                <input
                  type="datetime-local"
                  value={form.horaTermino}
                  onChange={(e) => updateField('horaTermino', e.target.value)}
                  className={`input-field w-full max-w-full box-border ${errors.horaTermino ? 'border-red-400 ring-1 ring-red-200' : ''}`}
                />
                <FieldError message={errors.horaTermino} />
              </div>
            </div>

            {/* Services list */}
            {serviciosLoading ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 size={24} className="animate-spin text-condor-400 mb-2" />
                <p className="text-sm text-gray-400">Cargando servicios...</p>
              </div>
            ) : (
              <>
                <div className="space-y-2" data-error={!!errors.trabajos}>
                  {form.trabajos.map((t, idx) => (
                    <div
                      key={t.nombre}
                      className={`rounded-2xl border-2 transition-colors shadow-sm ${
                        t.checked
                          ? 'border-accent-200 bg-accent-50'
                          : 'border-gray-200 bg-white'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleTrabajo(idx)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left"
                      >
                        {t.checked ? (
                          <CheckSquare size={22} className="text-accent-600 shrink-0" />
                        ) : (
                          <Square size={22} className="text-gray-300 shrink-0" />
                        )}
                        <span
                          className={`text-sm font-medium flex-1 ${
                            t.checked ? 'text-gray-900' : 'text-gray-600'
                          }`}
                        >
                          {t.nombre}
                        </span>
                        {t.checked && (
                          <span className="text-xs font-bold text-white bg-accent-600 px-2.5 py-0.5 rounded-full">
                            {t.cantidad}
                          </span>
                        )}
                      </button>
                      {t.checked && (
                        <div className="flex items-center justify-end gap-3 px-4 pb-3">
                          <button
                            type="button"
                            onClick={() => updateCantidad(idx, -1)}
                            className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center active:bg-gray-100"
                          >
                            <Minus size={16} />
                          </button>
                          <span className="text-lg font-bold text-accent-700 w-8 text-center">
                            {t.cantidad}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCantidad(idx, 1)}
                            className="w-10 h-10 rounded-xl bg-accent-600 text-white flex items-center justify-center active:bg-accent-700"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <FieldError message={errors.trabajos} />

                {/* Custom service input */}
                <div className="flex items-end gap-2 mt-3">
                  <div className="flex-1 min-w-0">
                    <label className="text-xs text-gray-500 mb-1 block">Servicio no listado</label>
                    <input
                      type="text"
                      value={customNombre}
                      onChange={(e) => setCustomNombre(e.target.value)}
                      placeholder="Otro servicio..."
                      className="w-full input-field !py-2.5 text-sm"
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomService())}
                    />
                  </div>
                  <div className="w-20">
                    <label className="text-xs text-gray-500 mb-1 block">Cant.</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      value={customCantidad}
                      onChange={(e) => setCustomCantidad(e.target.value)}
                      className="w-full input-field !py-2.5 text-sm text-center"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => { if (customNombre.trim()) addCustomService(); }}
                    className="w-10 h-10 rounded-lg bg-green-500 hover:bg-green-600 active:bg-green-700 text-white flex items-center justify-center shrink-0 transition-colors"
                  >
                    <Check size={20} strokeWidth={3} />
                  </button>
                </div>
              </>
            )}

            <div data-error={!!errors.descripcion}>
              <label className="label-field">Descripción del Trabajo <span className="text-red-400">*</span></label>
              <textarea
                rows={4}
                value={form.descripcion}
                onChange={(e) => updateField('descripcion', e.target.value)}
                placeholder="Detalle de lo realizado..."
                className={`input-field resize-none ${errors.descripcion ? 'border-red-400 ring-1 ring-red-200' : ''}`}
              />
              <FieldError message={errors.descripcion} />
            </div>

            <div>
              <label className="label-field">Observaciones</label>
              <textarea
                rows={2}
                value={form.observaciones}
                onChange={(e) => updateField('observaciones', e.target.value)}
                placeholder="Opcional..."
                className="input-field resize-none"
              />
            </div>

            <div className="border-t border-gray-200 pt-5 space-y-4">
              <h3 className="font-heading font-semibold text-sm text-condor-900">
                Pago
              </h3>
              <div>
                <label className="label-field">Total a Pagar (CLP)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.total}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, '');
                    updateField('total', raw ? formatCLP(raw) : '');
                  }}
                  placeholder="$0"
                  className="input-field"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-field">Método de Pago</label>
                  <select
                    value={form.metodoPago}
                    onChange={(e) => updateField('metodoPago', e.target.value)}
                    className="input-field"
                  >
                    {METODOS_PAGO.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label-field">Garantía</label>
                  <select
                    value={form.garantia}
                    onChange={(e) => updateField('garantia', e.target.value)}
                    className="input-field"
                  >
                    {GARANTIAS.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label-field">Requiere Factura</label>
                <div className="flex gap-4">
                  {['Sí', 'No'].map((v) => (
                    <label key={v} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="requiereFactura"
                        value={v}
                        checked={form.requiereFactura === v}
                        onChange={(e) => updateField('requiereFactura', e.target.value)}
                        className="accent-accent-600 w-4 h-4"
                      />
                      <span className="text-sm">{v}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Personal */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="font-heading font-bold text-xl text-condor-900">
              Personal y Vehículo
            </h2>

            {/* 1. Patente Vehículo */}
            <div data-error={!!errors.patenteVehiculo}>
              <label className="label-field">Patente Vehículo <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={form.patenteVehiculo}
                onChange={(e) => updateField('patenteVehiculo', formatPatente(e.target.value))}
                placeholder="XX-XX-00"
                className={`input-field uppercase ${errors.patenteVehiculo ? 'border-red-400 ring-1 ring-red-200' : ''}`}
                maxLength={8}
              />
              <FieldError message={errors.patenteVehiculo} />
            </div>

            {/* 2. Personal asignado */}
            {form.personal.length > 0 && (
              <div>
                <label className="label-field">Personal asignado ({form.personal.length})</label>
                <div className="space-y-2">
                  {form.personal.map((p, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2.5 shadow-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{p.nombre}</span>
                        <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                          Técnico
                        </span>
                        {idx === 0 && (
                          <span className="text-[10px] text-gray-400">(responsable)</span>
                        )}
                      </div>
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={() => removePersonal(idx)}
                          className="text-gray-400 hover:text-red-500 p-1"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Técnicos Disponibles */}
            {tecnicos.length > 0 && (
              <div>
                <label className="label-field">Técnicos Disponibles</label>
                <div className="flex flex-wrap gap-2">
                  {tecnicos.map((t) => {
                    const isSelected = form.personal.some((p) => p.nombre === t.nombre);
                    return (
                      <button
                        key={t.id || t.nombre}
                        type="button"
                        onClick={() => !isSelected && addTecnicoToPersonal(t)}
                        className={`rounded-full px-4 py-2 border transition-colors flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-blue-50 border-blue-500 text-blue-800 cursor-default'
                            : 'bg-white border-gray-300 text-gray-700 hover:border-blue-500 cursor-pointer'
                        }`}
                      >
                        {isSelected && <Check size={14} className="text-blue-600" />}
                        <span className="text-sm font-medium">{t.nombre}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Fotos */}
        {step === 3 && (
          <div className="space-y-6">
            <h2 className="font-heading font-bold text-xl text-condor-900">
              Fotos del Trabajo
            </h2>

            {/* Fotos ANTES */}
            <div className={`bg-white border rounded-2xl p-4 shadow-sm ${errors.fotosAntes ? 'border-red-400' : 'border-gray-200'}`} data-error={!!errors.fotosAntes}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-heading font-semibold text-sm text-condor-900">
                  Fotos ANTES
                </h3>
                <span className="text-xs text-gray-400">{fotosAntesPreview.length}/{MAX_FOTOS}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {fotosAntesPreview.map((foto, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                    <img src={foto.url} alt={`Antes ${idx + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeFoto('fotosAntes', idx)}
                      className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center"
                    >
                      <X size={12} className="text-white" />
                    </button>
                  </div>
                ))}
                {fotosAntesPreview.length < MAX_FOTOS && (
                  <button
                    type="button"
                    onClick={() => fotosAntesInputRef.current?.click()}
                    className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 hover:border-condor-400 hover:bg-condor-50 transition-colors"
                  >
                    <Camera size={20} className="text-gray-400" />
                    <span className="text-[10px] text-gray-400">Agregar</span>
                  </button>
                )}
              </div>
              <input
                ref={fotosAntesInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFotoUpload(e, 'fotosAntes')}
              />
              <FieldError message={errors.fotosAntes} />
            </div>

            {/* Fotos DESPUÉS */}
            <div className={`bg-white border rounded-2xl p-4 shadow-sm ${errors.fotosDespues ? 'border-red-400' : 'border-gray-200'}`} data-error={!!errors.fotosDespues}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-heading font-semibold text-sm text-condor-900">
                  Fotos DESPUÉS
                </h3>
                <span className="text-xs text-gray-400">{fotosDespuesPreview.length}/{MAX_FOTOS}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {fotosDespuesPreview.map((foto, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                    <img src={foto.url} alt={`Después ${idx + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeFoto('fotosDespues', idx)}
                      className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center"
                    >
                      <X size={12} className="text-white" />
                    </button>
                  </div>
                ))}
                {fotosDespuesPreview.length < MAX_FOTOS && (
                  <button
                    type="button"
                    onClick={() => fotosDespuesInputRef.current?.click()}
                    className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 hover:border-condor-400 hover:bg-condor-50 transition-colors"
                  >
                    <Camera size={20} className="text-gray-400" />
                    <span className="text-[10px] text-gray-400">Agregar</span>
                  </button>
                )}
              </div>
              <input
                ref={fotosDespuesInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFotoUpload(e, 'fotosDespues')}
              />
              <FieldError message={errors.fotosDespues} />
            </div>
          </div>
        )}

        {/* Step 5: Firma */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="font-heading font-bold text-xl text-condor-900">
              {editMode ? 'Editar y Reenviar' : 'Resumen y Firma'}
            </h2>

            <Summary data={{ ...form, personal: form.personal.map((p) => p.nombre), fotosAntes: fotosAntesPreview.map(p => p.url), fotosDespues: fotosDespuesPreview.map(p => p.url) }} onEdit={(s) => { setConfirmado(false); goToStep(s); }} />

            <div className={`bg-white rounded-2xl p-4 border shadow-sm ${errors.firmaBase64 ? 'border-red-400' : 'border-gray-200'}`} data-error={!!errors.firmaBase64}>
              <p className="text-sm text-gray-500 mb-1">Firma del Supervisor <span className="text-red-400">*</span></p>
              <p className="text-sm font-medium mb-3">{form.supervisor || '—'}</p>
              <SignaturePad
                onSignatureChange={(data) => updateField('firmaBase64', data)}
              />
              <FieldError message={errors.firmaBase64} />
            </div>

            {/* Confirmación obligatoria */}
            <label className="flex items-start gap-3 bg-white rounded-2xl p-4 border border-gray-200 shadow-sm cursor-pointer">
              <input
                type="checkbox"
                checked={confirmado}
                onChange={(e) => setConfirmado(e.target.checked)}
                className="accent-accent-600 w-5 h-5 mt-0.5 shrink-0"
              />
              <span className="text-sm text-gray-700">
                Confirmo que los datos de esta orden de trabajo son correctos y deseo enviarla.
              </span>
            </label>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!confirmado || sending}
              className={`w-full font-bold rounded-2xl py-4 text-base transition-colors flex items-center justify-center gap-2 shadow-lg ${
                confirmado
                  ? 'bg-accent-600 hover:bg-accent-700 text-white'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {sending ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  {sendingText || 'Enviando...'}
                </>
              ) : (
                <>
                  <Send size={20} />
                  {editMode ? 'Actualizar y Reenviar' : 'Enviar Orden de Trabajo'}
                </>
              )}
            </button>
          </div>
        )}
        <AppFooter />
      </div>

      {/* Sticky bottom navigation */}
      {step < 4 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] px-4 py-3 z-40">
          <div className="max-w-lg mx-auto flex gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={() => { setErrors({}); setStep(step - 1); }}
                className="flex-1 btn-secondary py-3.5 flex items-center justify-center gap-1 rounded-2xl"
              >
                <ChevronLeft size={18} />
                Anterior
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              className="flex-1 bg-condor-900 hover:bg-condor-800 text-white font-semibold rounded-2xl py-3.5 text-sm transition-colors flex items-center justify-center gap-1"
            >
              Siguiente
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
      {step === 4 && step > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] px-4 py-3 z-40">
          <div className="max-w-lg mx-auto">
            <button
              type="button"
              onClick={() => { setErrors({}); setStep(step - 1); }}
              className="w-full btn-secondary py-3 flex items-center justify-center gap-1 rounded-2xl"
            >
              <ChevronLeft size={18} />
              Anterior
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
