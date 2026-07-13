import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, EyeOff, AlertCircle, Pencil, Check, X } from 'lucide-react';
import DataTable from '../components/DataTable';
import SearchInput from '../components/SearchInput';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/Toast';
import { formatFecha } from '../utils/format';
import { listServicios, crearServicio, actualizarServicio, eliminarServicio } from '../utils/api';

function Switch({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
        checked ? 'bg-emerald-500' : 'bg-gray-200'
      }`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-1'}`} />
    </button>
  );
}

export default function ServiciosPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [servicios, setServicios] = useState([]);
  const [query, setQuery] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [creando, setCreando] = useState(false);
  const [target, setTarget] = useState(null); // servicio a eliminar/desactivar
  const [editandoId, setEditandoId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const editInputRef = useRef(null);

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listServicios();
      setServicios(res.data || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los servicios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const filtrados = useMemo(() => {
    if (!query.trim()) return servicios;
    const q = query.toLowerCase().trim();
    return servicios.filter((s) => s.nombre.toLowerCase().includes(q));
  }, [servicios, query]);

  const toggleActivo = async (servicio) => {
    const nuevoActivo = !servicio.activo;
    setServicios((prev) => prev.map((s) => (s.id === servicio.id ? { ...s, activo: nuevoActivo } : s)));
    try {
      await actualizarServicio(servicio.id, { activo: nuevoActivo });
      addToast(`"${servicio.nombre}" ${nuevoActivo ? 'activado' : 'desactivado'}.`, {
        type: 'success',
        actionLabel: 'Deshacer',
        onAction: async () => {
          setServicios((prev) => prev.map((s) => (s.id === servicio.id ? { ...s, activo: servicio.activo } : s)));
          try {
            await actualizarServicio(servicio.id, { activo: servicio.activo });
          } catch (err) {
            addToast(`No se pudo deshacer: ${err.message}`, { type: 'error' });
          }
        },
      });
    } catch (err) {
      setServicios((prev) => prev.map((s) => (s.id === servicio.id ? { ...s, activo: servicio.activo } : s)));
      addToast(`No se pudo actualizar: ${err.message}`, { type: 'error' });
    }
  };

  const handleAlta = async (e) => {
    e.preventDefault();
    const nombre = nuevoNombre.trim();
    if (!nombre) return;
    setCreando(true);
    try {
      await crearServicio(nombre);
      setNuevoNombre('');
      addToast(`Servicio "${nombre}" creado.`, { type: 'success' });
      cargar();
    } catch (err) {
      addToast(`No se pudo crear el servicio: ${err.message}`, { type: 'error' });
    } finally {
      setCreando(false);
    }
  };

  const iniciarEdicion = (servicio) => {
    setEditandoId(servicio.id);
    setEditValue(servicio.nombre);
    // el input recién se monta este mismo tick — foco+selección en el siguiente frame
    requestAnimationFrame(() => editInputRef.current?.select());
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setEditValue('');
  };

  const guardarNombre = async (servicio) => {
    const nombre = editValue.trim();
    if (!nombre) {
      cancelarEdicion();
      return;
    }
    if (nombre === servicio.nombre) {
      cancelarEdicion();
      return;
    }
    setGuardandoNombre(true);
    try {
      await actualizarServicio(servicio.id, { nombre });
      setServicios((prev) => prev.map((s) => (s.id === servicio.id ? { ...s, nombre } : s)));
      addToast(`Servicio renombrado a "${nombre}". El nuevo nombre también se ve en las órdenes históricas que lo usan.`, { type: 'success' });
      cancelarEdicion();
    } catch (err) {
      addToast(`No se pudo renombrar: ${err.message}`, { type: 'error' });
    } finally {
      setGuardandoNombre(false);
    }
  };

  const handleEliminarOConfirmar = (servicio) => {
    if (servicio.usos > 0) {
      // No se puede eliminar: solo se ofrece desactivar
      toggleActivo(servicio);
      return;
    }
    setTarget(servicio);
  };

  const confirmarEliminar = async () => {
    try {
      await eliminarServicio(target.id);
      addToast(`Servicio "${target.nombre}" eliminado.`, { type: 'success' });
      cargar();
    } catch (err) {
      addToast(`No se pudo eliminar: ${err.message}`, { type: 'error' });
    } finally {
      setTarget(null);
    }
  };

  const columns = [
    {
      key: 'nombre',
      label: 'Servicio',
      sortable: true,
      render: (s) =>
        editandoId === s.id ? (
          <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5">
            <input
              ref={editInputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') guardarNombre(s);
                if (e.key === 'Escape') cancelarEdicion();
              }}
              disabled={guardandoNombre}
              className="input-field py-1 text-sm flex-1 min-w-0"
            />
            <button
              onClick={() => guardarNombre(s)}
              disabled={guardandoNombre}
              title="Guardar"
              className="shrink-0 p-1 rounded-lg text-emerald-600 hover:bg-emerald-50"
            >
              <Check size={15} />
            </button>
            <button onClick={cancelarEdicion} title="Cancelar" className="shrink-0 p-1 rounded-lg text-gray-400 hover:bg-gray-100">
              <X size={15} />
            </button>
          </div>
        ) : (
          <div className="group/nombre flex items-center gap-1.5">
            <span>{s.nombre}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                iniciarEdicion(s);
              }}
              title="Renombrar servicio"
              className="shrink-0 p-1 rounded text-gray-300 opacity-0 group-hover/nombre:opacity-100 hover:text-condor-700 hover:bg-condor-50 transition-opacity"
            >
              <Pencil size={13} />
            </button>
          </div>
        ),
    },
    { key: 'usos', label: 'Usos', sortable: true, align: 'right' },
    {
      key: 'ultimo_uso',
      label: 'Última vez usado',
      sortable: true,
      render: (s) => (s.ultimo_uso ? formatFecha(s.ultimo_uso) : <span className="text-gray-300">Nunca</span>),
    },
    {
      key: 'activo',
      label: 'Activo',
      align: 'center',
      render: (s) => (
        <div onClick={(e) => e.stopPropagation()} className="flex justify-center">
          <Switch checked={s.activo} onChange={() => toggleActivo(s)} />
        </div>
      ),
    },
    {
      key: 'acciones',
      label: '',
      align: 'right',
      render: (s) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleEliminarOConfirmar(s);
          }}
          title={s.usos > 0 ? 'En uso: se desactivará en vez de eliminar' : 'Eliminar servicio'}
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-red-600 transition-colors"
        >
          {s.usos > 0 ? <EyeOff size={14} /> : <Trash2 size={14} />}
        </button>
      ),
    },
  ];

  if (error && !loading) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="No se pudieron cargar los servicios"
        description={error}
        actionLabel="Reintentar"
        onAction={cargar}
      />
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAlta} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <input
          value={nuevoNombre}
          onChange={(e) => setNuevoNombre(e.target.value)}
          placeholder="Nombre del nuevo servicio (ej: Limpieza de rejillas)"
          className="input-field flex-1"
        />
        <button type="submit" className="btn-primary shrink-0" disabled={creando}>
          <Plus size={16} /> {creando ? 'Agregando...' : 'Agregar servicio'}
        </button>
      </form>

      <div className="flex items-center justify-between gap-3">
        <SearchInput placeholder="Buscar servicio..." value={query} onChange={setQuery} className="w-72" />
        <p className="text-sm text-gray-400 shrink-0">{filtrados.length} servicios</p>
      </div>

      <DataTable
        columns={columns}
        rows={filtrados}
        loading={loading}
        emptyTitle="Sin servicios"
        emptyDescription="Agrega el primero con el formulario de arriba."
      />

      <ConfirmDialog
        open={!!target}
        onClose={() => setTarget(null)}
        onConfirm={confirmarEliminar}
        danger
        title="Eliminar servicio"
        message={`"${target?.nombre}" no tiene usos registrados, así que se puede eliminar sin dejar huérfanos. ¿Confirmas?`}
        confirmLabel="Eliminar"
      />
    </div>
  );
}
