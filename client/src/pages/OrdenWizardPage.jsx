import { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'lucide-react';
import { TRABAJOS, METODOS_PAGO, GARANTIAS, WIZARD_STEPS } from '../utils/constants';
import { formatRut, formatCLP, parseCLP, todayISO } from '../utils/helpers';
import { buscarClientes, getTecnicosPublic, crearOrden } from '../utils/api';
import SignaturePad from '../components/SignaturePad';
import Summary from '../components/Summary';

const MAX_FOTOS = 5;
const MAX_DIMENSION = 1200;

const initialFormData = () => ({
  clienteRut: '',
  clienteNombre: '',
  clienteEmail: '',
  clienteTelefono: '',
  direccion: '',
  comuna: '',
  ordenCompra: '',
  supervisor: '',
  horaInicio: '',
  horaTermino: '',
  trabajos: TRABAJOS.map((nombre) => ({ nombre, checked: false, cantidad: 0 })),
  descripcion: '',
  observaciones: '',
  total: '',
  metodoPago: 'Efectivo',
  garantia: 'Sin garantía',
  requiereFactura: 'No',
  personal: [],
  patenteVehiculo: '',
  fotosAntes: [],
  fotosDespues: [],
  firmaBase64: null,
});

// Resize image to max dimension, convert to PNG base64
function processImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          } else {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function OrdenWizardPage({ user, onOrdenEnviada }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialFormData);
  const [sending, setSending] = useState(false);

  // RUT search with debounce
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  // Tecnicos
  const [tecnicos, setTecnicos] = useState([]);
  const [nuevoPersonal, setNuevoPersonal] = useState('');

  // Photo refs
  const fotosAntesRef = useRef(null);
  const fotosDespuesRef = useRef(null);

  useEffect(() => {
    getTecnicosPublic()
      .then((res) => setTecnicos(res.data || []))
      .catch(() => {});
    setForm((prev) => ({ ...prev, personal: [{ nombre: user.nombre, esEmpleado: true }] }));
  }, [user.nombre]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
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
      clienteNombre: cliente.nombre || '',
      clienteEmail: cliente.email || '',
      clienteTelefono: cliente.telefono || '',
      direccion: cliente.direccion || '',
      comuna: cliente.comuna || '',
    }));
    setSearchResults([]);
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

  // Personal
  const addPersonal = () => {
    const name = nuevoPersonal.trim();
    if (!name || form.personal.some((p) => p.nombre === name)) return;
    updateField('personal', [...form.personal, { nombre: name, esEmpleado: false }]);
    setNuevoPersonal('');
  };

  const addTecnicoToPersonal = (tecnico) => {
    if (form.personal.some((p) => p.nombre === tecnico.nombre)) return;
    updateField('personal', [...form.personal, { nombre: tecnico.nombre, esEmpleado: true }]);
  };

  const removePersonal = (idx) => {
    updateField('personal', form.personal.filter((_, i) => i !== idx));
  };

  // Photos
  const handleFotoUpload = async (e, field) => {
    const files = Array.from(e.target.files || []);
    const current = form[field];
    const remaining = MAX_FOTOS - current.length;
    if (remaining <= 0) return;
    const toProcess = files.slice(0, remaining);
    const processed = await Promise.all(toProcess.map(processImage));
    updateField(field, [...current, ...processed]);
    e.target.value = '';
  };

  const removeFoto = (field, idx) => {
    updateField(field, form[field].filter((_, i) => i !== idx));
  };

  // Navigation
  const goToStep = (s) => setStep(s);

  const handleSubmit = async () => {
    setSending(true);
    const payload = {
      fecha: todayISO(),
      clienteNombre: form.clienteNombre,
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
      fotosAntes: form.fotosAntes,
      fotosDespues: form.fotosDespues,
      firmaBase64: form.firmaBase64,
    };

    try {
      const result = await crearOrden(payload);
      if (result?.offline) payload._offline = true;
      if (result?.data?.webhookOk === false) {
        payload._webhookError = result.data.webhookError || 'Error desconocido en webhook';
      }
    } catch (err) {
      payload._submitError = err.message || 'Error al enviar la orden';
    }
    setSending(false);
    onOrdenEnviada(payload);
  };

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
                onClick={() => i < step && goToStep(i)}
                className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  i === step
                    ? 'bg-accent-600 text-white ring-4 ring-accent-100'
                    : i < step
                      ? 'bg-condor-900 text-white cursor-pointer'
                      : 'bg-gray-100 text-gray-400'
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
            <div className="relative">
              <label className="label-field">RUT</label>
              <input
                type="text"
                value={form.clienteRut}
                onChange={(e) => handleRutChange(e.target.value)}
                placeholder="12.345.678-9"
                className="input-field"
                autoComplete="off"
              />
              {searching && (
                <Loader2 size={16} className="absolute right-3 top-9 animate-spin text-gray-400" />
              )}
              {searchResults.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-2xl shadow-lg overflow-hidden">
                  {searchResults.map((c) => (
                    <button
                      key={c.rut}
                      type="button"
                      onClick={() => selectCliente(c)}
                      className="w-full text-left px-4 py-3 hover:bg-condor-50 border-b border-gray-100 last:border-0"
                    >
                      <p className="text-sm font-medium text-gray-900">{c.nombre}</p>
                      <p className="text-xs text-gray-500">{c.rut} — {c.direccion}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="label-field">Cliente / Nombre</label>
                <input
                  type="text"
                  value={form.clienteNombre}
                  onChange={(e) => updateField('clienteNombre', e.target.value)}
                  className="input-field"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-field">Email</label>
                  <input
                    type="email"
                    value={form.clienteEmail}
                    onChange={(e) => updateField('clienteEmail', e.target.value)}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="label-field">Teléfono</label>
                  <input
                    type="tel"
                    value={form.clienteTelefono}
                    onChange={(e) => updateField('clienteTelefono', e.target.value)}
                    placeholder="+56 9"
                    className="input-field"
                  />
                </div>
              </div>
              <div>
                <label className="label-field">Dirección</label>
                <input
                  type="text"
                  value={form.direccion}
                  onChange={(e) => updateField('direccion', e.target.value)}
                  className="input-field"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-field">Comuna</label>
                  <input
                    type="text"
                    value={form.comuna}
                    onChange={(e) => updateField('comuna', e.target.value)}
                    className="input-field"
                  />
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
              <div>
                <label className="label-field">Supervisor / Encargado</label>
                <input
                  type="text"
                  value={form.supervisor}
                  onChange={(e) => updateField('supervisor', e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label-field">Fecha y Hora Inicio</label>
                <input
                  type="datetime-local"
                  value={form.horaInicio}
                  onChange={(e) => updateField('horaInicio', e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label-field">Fecha y Hora Término</label>
                <input
                  type="datetime-local"
                  value={form.horaTermino}
                  onChange={(e) => updateField('horaTermino', e.target.value)}
                  className="input-field"
                />
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

            <div className="space-y-2">
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

            <div>
              <label className="label-field">Descripción del Trabajo</label>
              <textarea
                rows={4}
                value={form.descripcion}
                onChange={(e) => updateField('descripcion', e.target.value)}
                placeholder="Detalle de lo realizado..."
                className="input-field resize-none"
              />
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
            <div>
              <label className="label-field">Patente Vehículo</label>
              <input
                type="text"
                value={form.patenteVehiculo}
                onChange={(e) => updateField('patenteVehiculo', e.target.value.toUpperCase())}
                placeholder="ABCD-12"
                className="input-field uppercase"
                maxLength={7}
              />
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
                        {p.esEmpleado ? (
                          <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                            Técnico
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                            Externo
                          </span>
                        )}
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
                        {t.especialidad && (
                          <span className="text-[10px] text-gray-400">{t.especialidad}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 4. Agregar persona externa */}
            <div>
              <label className="label-field">Agregar persona externa</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nuevoPersonal}
                  onChange={(e) => setNuevoPersonal(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPersonal())}
                  placeholder="Nombre completo"
                  className="input-field flex-1"
                />
                <button
                  type="button"
                  onClick={addPersonal}
                  className="btn-secondary px-3"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Fotos */}
        {step === 3 && (
          <div className="space-y-6">
            <h2 className="font-heading font-bold text-xl text-condor-900">
              Fotos del Trabajo
            </h2>

            {/* Fotos ANTES */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-heading font-semibold text-sm text-condor-900">
                  Fotos ANTES
                </h3>
                <span className="text-xs text-gray-400">{form.fotosAntes.length}/{MAX_FOTOS}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {form.fotosAntes.map((foto, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                    <img src={foto} alt={`Antes ${idx + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeFoto('fotosAntes', idx)}
                      className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center"
                    >
                      <X size={12} className="text-white" />
                    </button>
                  </div>
                ))}
                {form.fotosAntes.length < MAX_FOTOS && (
                  <button
                    type="button"
                    onClick={() => fotosAntesRef.current?.click()}
                    className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 hover:border-condor-400 hover:bg-condor-50 transition-colors"
                  >
                    <Camera size={20} className="text-gray-400" />
                    <span className="text-[10px] text-gray-400">Agregar</span>
                  </button>
                )}
              </div>
              <input
                ref={fotosAntesRef}
                type="file"
                accept="image/*"

                multiple
                className="hidden"
                onChange={(e) => handleFotoUpload(e, 'fotosAntes')}
              />
            </div>

            {/* Fotos DESPUÉS */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-heading font-semibold text-sm text-condor-900">
                  Fotos DESPUÉS
                </h3>
                <span className="text-xs text-gray-400">{form.fotosDespues.length}/{MAX_FOTOS}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {form.fotosDespues.map((foto, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                    <img src={foto} alt={`Después ${idx + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeFoto('fotosDespues', idx)}
                      className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center"
                    >
                      <X size={12} className="text-white" />
                    </button>
                  </div>
                ))}
                {form.fotosDespues.length < MAX_FOTOS && (
                  <button
                    type="button"
                    onClick={() => fotosDespuesRef.current?.click()}
                    className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 hover:border-condor-400 hover:bg-condor-50 transition-colors"
                  >
                    <Camera size={20} className="text-gray-400" />
                    <span className="text-[10px] text-gray-400">Agregar</span>
                  </button>
                )}
              </div>
              <input
                ref={fotosDespuesRef}
                type="file"
                accept="image/*"

                multiple
                className="hidden"
                onChange={(e) => handleFotoUpload(e, 'fotosDespues')}
              />
            </div>
          </div>
        )}

        {/* Step 5: Firma */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="font-heading font-bold text-xl text-condor-900">
              Resumen y Firma
            </h2>

            <Summary data={{ ...form, personal: form.personal.map((p) => p.nombre) }} onEdit={(s) => goToStep(s)} />

            <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
              <p className="text-sm text-gray-500 mb-1">Supervisor</p>
              <p className="text-sm font-medium mb-3">{form.supervisor || '—'}</p>
              <SignaturePad
                onSignatureChange={(data) => updateField('firmaBase64', data)}
              />
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={sending}
              className="w-full bg-accent-600 hover:bg-accent-700 disabled:opacity-50 text-white font-bold rounded-2xl py-4 text-base transition-colors flex items-center justify-center gap-2 shadow-lg"
            >
              {sending ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send size={20} />
                  Enviar Orden de Trabajo
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Sticky bottom navigation */}
      {step < 4 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] px-4 py-3 z-40">
          <div className="max-w-lg mx-auto flex gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="flex-1 btn-secondary py-3.5 flex items-center justify-center gap-1 rounded-2xl"
              >
                <ChevronLeft size={18} />
                Anterior
              </button>
            )}
            <button
              type="button"
              onClick={() => setStep(step + 1)}
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
              onClick={() => setStep(step - 1)}
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
