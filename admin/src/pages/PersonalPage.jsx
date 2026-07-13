import { useEffect, useMemo, useState } from 'react';
import { Plus, KeyRound, Copy, Check, AlertCircle, Smartphone, UserX, UserCheck } from 'lucide-react';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import SearchInput from '../components/SearchInput';
import DataTable from '../components/DataTable';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/Toast';
import { formatCLP, formatRut, formatFecha, formatRelativo, iniciales } from '../utils/format';
import { listEmpleados, getEmpleado, crearEmpleado, actualizarEmpleado, resetPinEmpleado } from '../utils/api';

function EstadoTecnicoBadge({ activo }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap border ${
        activo ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${activo ? 'bg-emerald-500' : 'bg-gray-400'}`} />
      {activo ? 'Activo' : 'Inactivo'}
    </span>
  );
}

// Convierte los datos crudos del empleado (API) al estado editable del form de la ficha.
function toFichaForm(data) {
  return {
    nombre: data.nombre || '',
    rut: data.rut || '',
    telefono: data.telefono || '',
    usuario: data.usuario || '',
    activo: data.activo ?? true,
    fechaIngreso: data.fecha_ingreso ? String(data.fecha_ingreso).slice(0, 10) : '',
    especialidades: Array.isArray(data.especialidades) ? data.especialidades.join(', ') : '',
  };
}

function PinRevelado({ pin, label }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="bg-condor-50 border border-condor-200 rounded-xl p-4 text-center">
      <p className="text-xs font-semibold text-condor-700 uppercase tracking-wide mb-1.5">{label}</p>
      <p className="font-mono text-3xl font-bold text-condor-900 tracking-[0.3em] mb-3">{pin}</p>
      <button
        onClick={() => {
          navigator.clipboard?.writeText(pin).catch(() => {});
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1500);
        }}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-condor-700 hover:text-condor-900"
      >
        {copiado ? <Check size={13} /> : <Copy size={13} />}
        {copiado ? 'Copiado' : 'Copiar PIN'}
      </button>
      <p className="mt-2 text-[11px] text-condor-600">Este PIN solo se muestra una vez. Compártelo de forma segura.</p>
    </div>
  );
}

export default function PersonalPage() {
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [empleados, setEmpleados] = useState([]);

  const [query, setQuery] = useState('');
  const [ficha, setFicha] = useState(null);
  const [fichaForm, setFichaForm] = useState(null);
  const [guardandoFicha, setGuardandoFicha] = useState(false);
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [creando, setCreando] = useState(false);
  const [pinNuevo, setPinNuevo] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [reseteando, setReseteando] = useState(false);
  const [pinReset, setPinReset] = useState(null);
  const [confirmDesactivar, setConfirmDesactivar] = useState(null);

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listEmpleados();
      setEmpleados(res.data || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los técnicos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const filtrados = useMemo(() => {
    if (!query.trim()) return empleados;
    const q = query.toLowerCase().trim();
    return empleados.filter((e) =>
      [e.nombre, e.rut, e.usuario, e.codigo].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [empleados, query]);

  const handleCrear = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const data = {
      nombre: form.get('nombre'),
      rut: form.get('rut'),
      telefono: form.get('telefono'),
      usuario: form.get('usuario'),
    };
    setCreando(true);
    try {
      const res = await crearEmpleado(data);
      setNuevoOpen(false);
      setPinNuevo(res.data.pin);
      cargar();
    } catch (err) {
      addToast(`No se pudo crear el técnico: ${err.message}`, { type: 'error' });
    } finally {
      setCreando(false);
    }
  };

  const handleResetPin = async () => {
    setReseteando(true);
    try {
      const res = await resetPinEmpleado(resetTarget.id);
      setPinReset(res.data.pin);
    } catch (err) {
      addToast(`No se pudo resetear el PIN: ${err.message}`, { type: 'error' });
    } finally {
      setReseteando(false);
    }
  };

  const handleDesactivar = async () => {
    const target = confirmDesactivar;
    try {
      await actualizarEmpleado(target.id, { activo: !target.activo });
      addToast(`${target.nombre} ${target.activo ? 'desactivado' : 'reactivado'}.`, { type: 'success' });
      cargar();
    } catch (err) {
      addToast(`No se pudo actualizar: ${err.message}`, { type: 'error' });
    } finally {
      setConfirmDesactivar(null);
    }
  };

  const abrirFicha = async (e) => {
    setFicha({ ...e, ultimasOrdenes: [] });
    setFichaForm(toFichaForm(e));
    try {
      const res = await getEmpleado(e.id);
      setFicha(res.data);
      setFichaForm(toFichaForm(res.data));
    } catch {
      // silencioso — la ficha básica ya se ve
    }
  };

  const cerrarFicha = () => {
    setFicha(null);
    setFichaForm(null);
  };

  const handleGuardarFicha = async (e) => {
    e.preventDefault();
    if (!ficha || !fichaForm) return;
    setGuardandoFicha(true);
    try {
      const especialidades = fichaForm.especialidades
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await actualizarEmpleado(ficha.id, {
        nombre: fichaForm.nombre,
        rut: fichaForm.rut,
        telefono: fichaForm.telefono,
        usuario: fichaForm.usuario,
        activo: fichaForm.activo,
        fechaIngreso: fichaForm.fechaIngreso || null,
        especialidades,
      });
      setFicha((prev) => ({ ...prev, ...res.data }));
      addToast('Cambios guardados.', { type: 'success' });
      cargar();
    } catch (err) {
      addToast(`No se pudieron guardar los cambios: ${err.message}`, { type: 'error' });
    } finally {
      setGuardandoFicha(false);
    }
  };

  const columns = [
    {
      key: 'nombre',
      label: 'Técnico',
      sortable: true,
      render: (e) => (
        <div className="flex items-center gap-3 min-w-0">
          <span className="h-8 w-8 rounded-lg bg-condor-900 text-white text-xs font-bold flex items-center justify-center shrink-0">
            {iniciales(e.nombre)}
          </span>
          <div className="min-w-0">
            <p className="font-heading font-semibold text-gray-900 truncate">{e.nombre}</p>
            <p className="text-[11px] text-gray-400 font-mono">{e.codigo}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'rut',
      label: 'RUT',
      sortable: true,
      render: (e) => <span className="font-mono text-xs">{formatRut(e.rut)}</span>,
    },
    {
      key: 'telefono',
      label: 'Contacto',
      render: (e) => (e.telefono ? <span>{e.telefono}</span> : <span className="text-gray-300">Sin teléfono</span>),
    },
    {
      key: 'total_ordenes',
      label: 'Órdenes',
      sortable: true,
      align: 'right',
      render: (e) => <span className="font-mono font-bold text-gray-900">{e.total_ordenes}</span>,
    },
    {
      key: 'ultima_orden',
      label: 'Última / Generado',
      sortValue: (e) => e.ultima_orden,
      render: (e) => {
        const monto = Number(e.monto_generado) || 0;
        if (monto > 0) return <span className="text-xs">{formatCLP(monto)}</span>;
        const ultima = formatRelativo(e.ultima_orden);
        return ultima ? <span className="text-xs text-gray-400 capitalize">{ultima}</span> : <span className="text-gray-300">—</span>;
      },
    },
    {
      key: 'activo',
      label: 'Estado',
      align: 'center',
      sortValue: (e) => (e.activo ? 1 : 0),
      sortable: true,
      render: (e) => <EstadoTecnicoBadge activo={e.activo} />,
    },
    {
      key: 'acciones',
      label: '',
      align: 'right',
      render: (e) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(ev) => ev.stopPropagation()}>
          <button
            onClick={() => {
              setResetTarget(e);
              setPinReset(null);
            }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-condor-700 hover:bg-condor-50"
            title="Resetear PIN"
          >
            <KeyRound size={14} />
          </button>
          <button
            onClick={() => setConfirmDesactivar(e)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
            title={e.activo ? 'Desactivar' : 'Reactivar'}
          >
            {e.activo ? <UserX size={14} /> : <UserCheck size={14} />}
          </button>
        </div>
      ),
    },
  ];

  if (error && !loading) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="No se pudieron cargar los técnicos"
        description={error}
        actionLabel="Reintentar"
        onAction={cargar}
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 flex items-center gap-1.5">
        <Smartphone size={14} className="text-gray-400 shrink-0" />
        Técnicos que usan la app móvil de terreno (Usuario + PIN) — distinto de los{' '}
        <span className="font-medium text-gray-600">Usuarios</span> del panel de oficina.
      </p>

      <div className="flex items-center justify-between gap-3">
        <SearchInput placeholder="Buscar por nombre, RUT o código..." value={query} onChange={setQuery} className="w-80" />
        <button onClick={() => setNuevoOpen(true)} className="btn-primary shrink-0">
          <Plus size={16} /> Nuevo técnico
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={filtrados}
        loading={loading}
        onRowClick={abrirFicha}
        emptyTitle="Sin técnicos"
        emptyDescription="Prueba ajustando la búsqueda."
      />

      {/* Nuevo técnico */}
      <Modal
        open={nuevoOpen}
        onClose={() => setNuevoOpen(false)}
        title="Nuevo técnico"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setNuevoOpen(false)}>
              Cancelar
            </button>
            <button className="btn-primary" type="submit" form="form-nuevo-tecnico" disabled={creando}>
              {creando ? 'Creando...' : 'Crear técnico'}
            </button>
          </>
        }
      >
        <form id="form-nuevo-tecnico" onSubmit={handleCrear} className="space-y-4">
          <div>
            <label className="label-field">Nombre completo</label>
            <input name="nombre" required className="input-field" placeholder="Ej: Juan Pérez" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-field">RUT</label>
              <input name="rut" required className="input-field" placeholder="12.345.678-9" />
            </div>
            <div>
              <label className="label-field">Teléfono</label>
              <input name="telefono" className="input-field" placeholder="+56 9 1234 5678" />
            </div>
          </div>
          <div>
            <label className="label-field">Usuario</label>
            <input name="usuario" required className="input-field" placeholder="nombre.apellido@condor.cl" />
          </div>
          <p className="text-xs text-gray-400">El PIN de acceso se genera automáticamente y se muestra una sola vez.</p>
        </form>
      </Modal>

      {/* PIN recién creado */}
      <Modal open={!!pinNuevo} onClose={() => setPinNuevo(null)} title="Técnico creado" size="sm">
        {pinNuevo && <PinRevelado pin={pinNuevo} label="PIN de acceso" />}
      </Modal>

      {/* Reset PIN */}
      <Modal
        open={!!resetTarget}
        onClose={() => setResetTarget(null)}
        title={`Resetear PIN — ${resetTarget?.nombre || ''}`}
        size="sm"
        footer={
          !pinReset && (
            <>
              <button className="btn-secondary" onClick={() => setResetTarget(null)}>
                Cancelar
              </button>
              <button className="btn-accent" onClick={handleResetPin} disabled={reseteando}>
                {reseteando ? 'Generando...' : 'Generar nuevo PIN'}
              </button>
            </>
          )
        }
      >
        {pinReset ? (
          <PinRevelado pin={pinReset} label="Nuevo PIN" />
        ) : (
          <p className="text-sm text-gray-600">
            Se generará un PIN nuevo aleatorio para <span className="font-medium">{resetTarget?.nombre}</span>. El PIN
            anterior dejará de funcionar de inmediato. Queda registrado en auditoría quién y cuándo lo reseteó.
          </p>
        )}
      </Modal>

      {/* Ficha — datos reales editables, guardado real vía PUT */}
      <Modal
        open={!!ficha}
        onClose={cerrarFicha}
        title={ficha ? ficha.nombre : ''}
        size="lg"
        footer={
          ficha && (
            <>
              <button className="btn-secondary" onClick={cerrarFicha}>
                Cerrar
              </button>
              <button className="btn-primary" type="submit" form="form-editar-tecnico" disabled={guardandoFicha}>
                {guardandoFicha ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </>
          )
        }
      >
        {ficha && fichaForm && (
          <div className="space-y-5">
            <div className={`grid grid-cols-2 gap-3 ${Number(ficha.monto_generado ?? ficha.montoGenerado ?? 0) > 0 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[11px] text-gray-400 uppercase">Código</p>
                <p className="font-heading font-bold text-lg text-gray-900 font-mono">{ficha.codigo}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[11px] text-gray-400 uppercase">Órdenes</p>
                <p className="font-heading font-bold text-lg text-gray-900">{ficha.total_ordenes ?? ficha.totalOrdenes ?? 0}</p>
              </div>
              {Number(ficha.monto_generado ?? ficha.montoGenerado ?? 0) > 0 && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[11px] text-gray-400 uppercase">Generado</p>
                  <p className="font-heading font-bold text-lg text-gray-900">{formatCLP(ficha.monto_generado ?? ficha.montoGenerado ?? 0)}</p>
                </div>
              )}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[11px] text-gray-400 uppercase">Estado</p>
                <p className="font-heading font-bold text-lg text-gray-900">{fichaForm.activo ? 'Activo' : 'Inactivo'}</p>
              </div>
            </div>

            <form id="form-editar-tecnico" onSubmit={handleGuardarFicha} className="space-y-4">
              <div>
                <label className="label-field">Nombre completo</label>
                <input
                  className="input-field"
                  required
                  value={fichaForm.nombre}
                  onChange={(ev) => setFichaForm((f) => ({ ...f, nombre: ev.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-field">RUT</label>
                  <input
                    className="input-field"
                    placeholder="12.345.678-9"
                    value={fichaForm.rut}
                    onChange={(ev) => setFichaForm((f) => ({ ...f, rut: ev.target.value }))}
                  />
                </div>
                <div>
                  <label className="label-field">Teléfono</label>
                  <input
                    className="input-field"
                    placeholder="+56 9 1234 5678"
                    value={fichaForm.telefono}
                    onChange={(ev) => setFichaForm((f) => ({ ...f, telefono: ev.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-field">Usuario (login app móvil)</label>
                  <input
                    className="input-field"
                    required
                    value={fichaForm.usuario}
                    onChange={(ev) => setFichaForm((f) => ({ ...f, usuario: ev.target.value }))}
                  />
                </div>
                <div>
                  <label className="label-field">Fecha de ingreso</label>
                  <input
                    type="date"
                    className="input-field"
                    value={fichaForm.fechaIngreso}
                    onChange={(ev) => setFichaForm((f) => ({ ...f, fechaIngreso: ev.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="label-field">Especialidades</label>
                <input
                  className="input-field"
                  placeholder="Ej: Hidrojet, CCTV, Fosas sépticas"
                  value={fichaForm.especialidades}
                  onChange={(ev) => setFichaForm((f) => ({ ...f, especialidades: ev.target.value }))}
                />
                <p className="text-xs text-gray-400 mt-1">Separadas por coma.</p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="rounded border-gray-300"
                  checked={fichaForm.activo}
                  onChange={(ev) => setFichaForm((f) => ({ ...f, activo: ev.target.checked }))}
                />
                Activo (puede iniciar sesión en la app de terreno)
              </label>
            </form>

            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Últimas órdenes</h3>
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
                {(ficha.ultimasOrdenes || []).length === 0 ? (
                  <p className="text-sm text-gray-400 px-3 py-4 text-center">Sin órdenes registradas.</p>
                ) : (
                  ficha.ultimasOrdenes.map((o) => (
                    <div key={o.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                      <span className="text-gray-700">OT-{o.numero_orden_display}</span>
                      <span className="text-gray-400">{formatFecha(o.fecha)}</span>
                      <span className="font-medium text-gray-800">{formatCLP(o.total)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmDesactivar}
        onClose={() => setConfirmDesactivar(null)}
        onConfirm={handleDesactivar}
        danger={confirmDesactivar?.activo}
        title={confirmDesactivar?.activo ? 'Desactivar técnico' : 'Reactivar técnico'}
        message={
          confirmDesactivar?.activo
            ? `${confirmDesactivar?.nombre} no podrá iniciar sesión en la app de terreno hasta ser reactivado.`
            : `${confirmDesactivar?.nombre} podrá volver a iniciar sesión en la app de terreno.`
        }
        confirmLabel={confirmDesactivar?.activo ? 'Desactivar' : 'Reactivar'}
      />
    </div>
  );
}
