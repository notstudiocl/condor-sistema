import { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
  Minus,
  Trash2,
  Send,
  Loader2,
  CheckSquare,
  Square,
} from 'lucide-react';
import { TRABAJOS, METODOS_PAGO, GARANTIAS, WIZARD_STEPS } from '../utils/constants';
import { formatRut, formatCLP, parseCLP, todayISO } from '../utils/helpers';
import { buscarClientes, getTecnicos, crearOrden } from '../utils/api';
import SignaturePad from '../components/SignaturePad';
import Summary from '../components/Summary';

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
  firmaBase64: null,
  confirmado: false,
});

export default function OrdenWizardPage({ user, onOrdenEnviada }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialFormData);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  // Search & tecnico state
  const [rutSearch, setRutSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [tecnicos, setTecnicos] = useState([]);
  const [nuevoPersonal, setNuevoPersonal] = useState('');

  // Load técnicos on mount and add logged-in user as first personal
  useEffect(() => {
    getTecnicos()
      .then((res) => {
        setTecnicos(res.data || []);
      })
      .catch(() => {});
    setForm((prev) => ({
      ...prev,
      personal: [user.nombre],
    }));
  }, [user.nombre]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // RUT search
  const handleRutSearch = async () => {
    if (rutSearch.length < 3) return;
    setSearching(true);
    try {
      const res = await buscarClientes(rutSearch);
      setSearchResults(res.data || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

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
    setRutSearch('');
  };

  // Trabajo toggle
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

  // Personal management
  const addPersonal = () => {
    const name = nuevoPersonal.trim();
    if (!name || form.personal.includes(name)) return;
    updateField('personal', [...form.personal, name]);
    setNuevoPersonal('');
  };

  const addTecnicoToPersonal = (nombre) => {
    if (form.personal.includes(nombre)) return;
    updateField('personal', [...form.personal, nombre]);
  };

  const removePersonal = (idx) => {
    updateField(
      'personal',
      form.personal.filter((_, i) => i !== idx)
    );
  };

  // Navigation
  const canNext = () => {
    if (step === 0) {
      return form.clienteNombre.trim() && form.direccion.trim() && form.supervisor.trim();
    }
    if (step === 1) {
      return form.descripcion.trim();
    }
    if (step === 2) {
      return form.personal.length > 0;
    }
    return true;
  };

  const goToStep = (s) => {
    setStep(s);
  };

  const handleSubmit = async () => {
    if (!form.confirmado) {
      setSendError('Debe confirmar los datos antes de enviar');
      return;
    }

    setSending(true);
    setSendError('');

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
      personal: form.personal,
      patenteVehiculo: form.patenteVehiculo,
      total: parseCLP(form.total),
      metodoPago: form.metodoPago,
      garantia: form.garantia,
      requiereFactura: form.requiereFactura,
      firmaBase64: form.firmaBase64,
    };

    try {
      await crearOrden(payload);
      onOrdenEnviada(payload);
    } catch (err) {
      setSendError(err.message || 'Error al enviar la orden');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto p-4 pb-8">
      {/* Step indicator */}
      <div className="flex items-center justify-between mb-6">
        {WIZARD_STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center flex-1">
            <button
              type="button"
              onClick={() => i < step && goToStep(i)}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors border-2 ${
                i === step
                  ? 'border-accent-600 bg-white text-accent-600'
                  : i < step
                    ? 'border-condor-900 bg-condor-900 text-white cursor-pointer'
                    : 'border-gray-300 bg-white text-gray-400'
              }`}
            >
              {s.id}
            </button>
            <span
              className={`ml-1.5 text-xs font-medium hidden sm:inline ${
                i === step ? 'text-accent-600' : i < step ? 'text-condor-900' : 'text-gray-400'
              }`}
            >
              {s.label}
            </span>
            {i < WIZARD_STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 rounded ${
                  i < step ? 'bg-condor-900' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Cliente */}
      {step === 0 && (
        <div className="space-y-4">
          <h2 className="font-heading font-bold text-lg text-condor-900">
            Datos del Cliente
          </h2>

          {/* RUT search */}
          <div>
            <label className="label-field">Buscar por RUT</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={rutSearch}
                onChange={(e) => setRutSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleRutSearch())}
                placeholder="Ej: 12.345.678-9"
                className="input-field flex-1"
              />
              <button
                type="button"
                onClick={handleRutSearch}
                disabled={searching}
                className="btn-secondary px-3"
              >
                {searching ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="mt-2 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                {searchResults.map((c) => (
                  <button
                    key={c.rut}
                    type="button"
                    onClick={() => selectCliente(c)}
                    className="w-full text-left px-4 py-3 hover:bg-condor-50 border-b border-gray-100 last:border-0"
                  >
                    <p className="text-sm font-medium">{c.nombre}</p>
                    <p className="text-xs text-gray-500">{c.rut} — {c.direccion}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="label-field">
                Cliente / Nombre <span className="text-accent-600">*</span>
              </label>
              <input
                type="text"
                value={form.clienteNombre}
                onChange={(e) => updateField('clienteNombre', e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="label-field">RUT</label>
              <input
                type="text"
                value={form.clienteRut}
                onChange={(e) => updateField('clienteRut', formatRut(e.target.value))}
                placeholder="12.345.678-9"
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
              <label className="label-field">
                Dirección <span className="text-accent-600">*</span>
              </label>
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
              <label className="label-field">
                Supervisor / Encargado <span className="text-accent-600">*</span>
              </label>
              <input
                type="text"
                value={form.supervisor}
                onChange={(e) => updateField('supervisor', e.target.value)}
                className="input-field"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-field">Hora Inicio</label>
                <input
                  type="time"
                  value={form.horaInicio}
                  onChange={(e) => updateField('horaInicio', e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label-field">Hora Término</label>
                <input
                  type="time"
                  value={form.horaTermino}
                  onChange={(e) => updateField('horaTermino', e.target.value)}
                  className="input-field"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Trabajos */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="font-heading font-bold text-lg text-condor-900">
            Trabajos Realizados
          </h2>

          <div className="space-y-2">
            {form.trabajos.map((t, idx) => (
              <div
                key={t.nombre}
                className={`rounded-xl border-2 transition-colors ${
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
                    <span className="text-xs font-bold text-white bg-accent-600 px-2 py-0.5 rounded-full">
                      {t.cantidad}
                    </span>
                  )}
                </button>
                {t.checked && (
                  <div className="flex items-center justify-end gap-3 px-4 pb-3">
                    <button
                      type="button"
                      onClick={() => updateCantidad(idx, -1)}
                      className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center active:bg-gray-100"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="text-lg font-bold text-accent-700 w-8 text-center">
                      {t.cantidad}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateCantidad(idx, 1)}
                      className="w-9 h-9 rounded-lg bg-accent-600 text-white flex items-center justify-center active:bg-accent-700"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div>
            <label className="label-field">
              Descripción del Trabajo <span className="text-accent-600">*</span>
            </label>
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

          <div className="border-t border-gray-200 pt-4 space-y-3">
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
                    <option key={m} value={m}>
                      {m}
                    </option>
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
                    <option key={g} value={g}>
                      {g}
                    </option>
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
        <div className="space-y-4">
          <h2 className="font-heading font-bold text-lg text-condor-900">
            Personal y Vehículo
          </h2>

          <div>
            <label className="label-field">
              Personal que ejecuta <span className="text-accent-600">*</span>
            </label>
            <div className="space-y-2">
              {form.personal.map((nombre, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5"
                >
                  <span className="text-sm font-medium text-gray-900">
                    {nombre}
                    {idx === 0 && (
                      <span className="text-xs text-condor-600 ml-2">(responsable)</span>
                    )}
                  </span>
                  {idx > 0 && (
                    <button
                      type="button"
                      onClick={() => removePersonal(idx)}
                      className="text-gray-400 hover:text-accent-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Agregar de lista de técnicos */}
          {tecnicos.length > 0 && (
            <div>
              <label className="label-field">Agregar técnico</label>
              <div className="flex flex-wrap gap-2">
                {tecnicos
                  .filter((t) => !form.personal.includes(t.nombre))
                  .map((t) => (
                    <button
                      key={t.nombre}
                      type="button"
                      onClick={() => addTecnicoToPersonal(t.nombre)}
                      className="text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 hover:border-condor-300 hover:bg-condor-50 transition-colors"
                    >
                      + {t.nombre}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Agregar manual */}
          <div>
            <label className="label-field">Agregar otro nombre</label>
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

          <div>
            <label className="label-field">Patente Vehículo</label>
            <input
              type="text"
              value={form.patenteVehiculo}
              onChange={(e) =>
                updateField('patenteVehiculo', e.target.value.toUpperCase())
              }
              placeholder="ABCD-12"
              className="input-field uppercase"
              maxLength={7}
            />
          </div>
        </div>
      )}

      {/* Step 4: Firma */}
      {step === 3 && (
        <div className="space-y-4">
          <h2 className="font-heading font-bold text-lg text-condor-900">
            Resumen y Firma
          </h2>

          <Summary data={form} onEdit={(s) => goToStep(s)} />

          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <p className="text-sm text-gray-500 mb-1">Supervisor</p>
            <p className="text-sm font-medium mb-3">{form.supervisor || '—'}</p>
            <SignaturePad
              onSignatureChange={(data) => updateField('firmaBase64', data)}
            />
          </div>

          <label className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-xl p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={form.confirmado}
              onChange={(e) => updateField('confirmado', e.target.checked)}
              className="accent-accent-600 w-5 h-5 mt-0.5 shrink-0"
            />
            <span className="text-sm text-gray-900">
              Confirmo que los datos ingresados son correctos y que el trabajo fue
              realizado según lo descrito.
            </span>
          </label>

          {sendError && (
            <p className="text-accent-600 text-sm text-center bg-accent-50 rounded-lg py-2">
              {sendError}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={sending || !form.confirmado}
            className="w-full bg-accent-600 hover:bg-accent-700 disabled:opacity-50 text-white font-bold rounded-xl py-4 text-sm transition-colors flex items-center justify-center gap-2 shadow-lg"
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

      {/* Navigation buttons */}
      {step < 3 && (
        <div className="flex gap-3 mt-6">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="flex-1 btn-secondary py-3.5 flex items-center justify-center gap-1"
            >
              <ChevronLeft size={18} />
              Anterior
            </button>
          )}
          <button
            type="button"
            onClick={() => setStep(step + 1)}
            disabled={!canNext()}
            className="flex-1 bg-condor-900 hover:bg-condor-800 disabled:opacity-40 text-white font-semibold rounded-xl py-3.5 text-sm transition-colors flex items-center justify-center gap-1"
          >
            Siguiente
            <ChevronRight size={18} />
          </button>
        </div>
      )}
      {step === 3 && step > 0 && (
        <button
          type="button"
          onClick={() => setStep(step - 1)}
          className="w-full mt-3 btn-secondary py-3 flex items-center justify-center gap-1"
        >
          <ChevronLeft size={18} />
          Anterior
        </button>
      )}
    </div>
  );
}
