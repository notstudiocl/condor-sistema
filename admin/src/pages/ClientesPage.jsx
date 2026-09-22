import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  GitMerge, ShieldCheck, AlertTriangle, Building2, User, AlertCircle, Plus, ArrowLeft, Pencil, Save, X,
  ClipboardList, Layers, ExternalLink,
} from 'lucide-react';
import DataTable from '../components/DataTable';
import SearchInput from '../components/SearchInput';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import EstadoBadge from '../components/EstadoBadge';
import { SkeletonText } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { formatCLP, formatFecha, formatRelativo, formatRut, formatRutInput, iniciales } from '../utils/format';
import {
  listClientes,
  listClientesDuplicados,
  getCliente,
  getOrdenesCliente,
  crearCliente,
  actualizarCliente,
  fusionarClientes,
  descartarDuplicadoCliente,
  getClientesMismoRut,
} from '../utils/api';

const CAMPOS_FICHA = [
  ['rut', 'RUT'],
  ['nombre', 'Nombre contacto'],
  ['empresa', 'Empresa'],
  ['email', 'Email'],
  ['telefono', 'Teléfono'],
  ['direccion', 'Dirección'],
  ['comuna', 'Comuna'],
];

// Campos editables desde la ficha (mismo whitelist que PUT /api/admin/clientes/:id).
const CAMPOS_EDITABLES = ['rut', 'nombre', 'tipo', 'empresa', 'email', 'telefono', 'direccion', 'comuna'];

function TipoChip({ tipo }) {
  if (!tipo) return <span className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-gray-100 text-gray-500 border-gray-200">Sin tipo</span>;
  const empresa = tipo === 'Empresa';
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${empresa ? 'bg-condor-50 text-condor-700 border-condor-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
      {empresa ? <Building2 size={11} /> : <User size={11} />} {tipo}
    </span>
  );
}

// ─────────────────────────── Ficha ───────────────────────────
// Ficha 360 como página propia (/clientes/:id), no como modal: así queda en el historial
// del navegador y al volver de "Ver orden" u "Otros locales con este RUT" el back
// del navegador reabre esta misma ficha.

function ClienteFicha({ id, onVolver }) {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [cliente, setCliente] = useState(null);
  const [ordenes, setOrdenes] = useState([]);
  const [mismoRut, setMismoRut] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setEditando(false);
    (async () => {
      try {
        const res = await getCliente(id);
        if (cancelled) return;
        setCliente(res.data);
        setForm({ ...res.data });
        // Historial completo (el endpoint de la ficha solo trae las últimas 10).
        setOrdenes(res.data.ultimasOrdenes || []);
      } catch (err) {
        if (!cancelled) setError(err.message || 'No se pudo cargar el cliente');
        return;
      } finally {
        if (!cancelled) setLoading(false);
      }
      const [ordRes, rutRes] = await Promise.allSettled([getOrdenesCliente(id), getClientesMismoRut(id)]);
      if (cancelled) return;
      if (ordRes.status === 'fulfilled') setOrdenes(ordRes.value.data || []);
      setMismoRut(rutRes.status === 'fulfilled' ? rutRes.value.data || [] : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const cancelarEdicion = () => {
    setForm({ ...cliente });
    setEditando(false);
  };

  const guardar = async () => {
    if (!form.nombre || !form.nombre.trim()) return addToast('El nombre de contacto es requerido', { type: 'error' });
    setGuardando(true);
    try {
      const payload = {};
      for (const k of CAMPOS_EDITABLES) payload[k] = k === 'tipo' ? form.tipo || null : form[k];
      const res = await actualizarCliente(id, payload);
      // PUT devuelve la fila cruda (sin stats): se mezcla sobre lo que ya teníamos.
      setCliente((c) => ({ ...c, ...res.data }));
      setForm((f) => ({ ...f, ...res.data }));
      setEditando(false);
      addToast('Cambios guardados.', { type: 'success' });
      // El RUT puede haber cambiado: refrescar "otros locales con este RUT".
      getClientesMismoRut(id).then((r) => setMismoRut(r.data || [])).catch(() => {});
    } catch (err) {
      addToast(`No se pudo guardar: ${err.message}`, { type: 'error' });
    } finally {
      setGuardando(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <button className="btn-secondary py-2 px-3" onClick={onVolver}><ArrowLeft size={15} /> Clientes</button>
        <div className="card p-5"><SkeletonText lines={6} /></div>
      </div>
    );
  }

  if (error || !cliente) {
    return (
      <div className="card p-10 text-center">
        <AlertCircle size={22} className="mx-auto text-red-500 mb-2" />
        <p className="text-sm text-gray-600">{error || 'Cliente no encontrado'}</p>
        <button className="btn-secondary mt-4" onClick={onVolver}><ArrowLeft size={15} /> Volver a clientes</button>
      </div>
    );
  }

  const titulo = cliente.empresa || cliente.nombre || `Cliente #${cliente.id}`;
  const ultimaOrden = ordenes[0] || null;
  const totalOrdenes = Number(cliente.total_ordenes ?? ordenes.length ?? 0);

  const DATOS = [
    ['RUT', cliente.rut ? <span className="font-mono">{formatRut(cliente.rut)}</span> : null],
    ['Nombre contacto', cliente.nombre],
    ['Empresa', cliente.empresa],
    ['Email', cliente.email ? <a href={`mailto:${cliente.email}`} className="text-condor-700 hover:underline break-all">{cliente.email}</a> : null],
    ['Teléfono', cliente.telefono ? <a href={`tel:${cliente.telefono}`} className="text-condor-700 hover:underline">{cliente.telefono}</a> : null],
    ['Dirección', cliente.direccion],
    ['Comuna', cliente.comuna],
    ['Tipo', cliente.tipo],
  ];

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-secondary py-2 px-3" onClick={onVolver}><ArrowLeft size={15} /> Clientes</button>
        <div className="flex items-center gap-3 min-w-0">
          <span className="h-11 w-11 rounded-full bg-condor-900 text-white text-sm font-bold flex items-center justify-center shrink-0">
            {iniciales(titulo)}
          </span>
          <div className="min-w-0">
            <h2 className="font-heading font-semibold text-gray-900 text-lg leading-tight truncate">{titulo}</h2>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {cliente.rut && (
                <span className="inline-flex text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full border bg-gray-50 text-gray-700 border-gray-200">
                  {formatRut(cliente.rut)}
                </span>
              )}
              <TipoChip tipo={cliente.tipo} />
              {cliente.empresa && cliente.nombre && <span className="text-xs text-gray-400 truncate">{cliente.nombre}</span>}
            </div>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {editando ? (
            <>
              <button className="btn-secondary" onClick={cancelarEdicion} disabled={guardando}><X size={15} /> Cancelar</button>
              <button className="btn-primary" onClick={guardar} disabled={guardando}><Save size={15} /> {guardando ? 'Guardando...' : 'Guardar'}</button>
            </>
          ) : (
            <button className="btn-secondary" onClick={() => setEditando(true)}><Pencil size={15} /> Editar</button>
          )}
        </div>
      </div>

      {cliente.merged_into && (
        <div className="card p-4 border-amber-200 bg-amber-50 flex flex-wrap items-center gap-3">
          <GitMerge size={18} className="text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 flex-1 min-w-0">
            Este cliente fue fusionado: sus órdenes quedaron vinculadas al registro resultante y ya no aparece en la lista.
          </p>
          <Link to={`/clientes/${cliente.merged_into}`} className="btn-secondary py-1.5 px-3 text-xs shrink-0">
            <ExternalLink size={13} /> Ver registro resultante
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Datos del cliente */}
        <div className="card p-5 space-y-4 lg:col-span-2">
          <h3 className="font-heading font-semibold text-gray-900 text-sm flex items-center gap-1.5">
            <User size={15} className="text-condor-600" /> Datos del cliente
          </h3>

          {editando && form ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="label-field">RUT</label>
                <input
                  className="input-field font-mono"
                  value={form.rut || ''}
                  placeholder="12.345.678-9"
                  onChange={(e) => set('rut', formatRutInput(e.target.value))}
                />
              </div>
              <div>
                <label className="label-field">Nombre contacto *</label>
                <input className="input-field" value={form.nombre || ''} onChange={(e) => set('nombre', e.target.value)} />
              </div>
              <div>
                <label className="label-field">Empresa</label>
                <input className="input-field" value={form.empresa || ''} onChange={(e) => set('empresa', e.target.value)} />
              </div>
              <div>
                <label className="label-field">Email</label>
                <input className="input-field" type="email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} />
              </div>
              <div>
                <label className="label-field">Teléfono</label>
                <input className="input-field" value={form.telefono || ''} onChange={(e) => set('telefono', e.target.value)} />
              </div>
              <div>
                <label className="label-field">Dirección</label>
                <input className="input-field" value={form.direccion || ''} onChange={(e) => set('direccion', e.target.value)} />
              </div>
              <div>
                <label className="label-field">Comuna</label>
                <input className="input-field" value={form.comuna || ''} onChange={(e) => set('comuna', e.target.value)} />
              </div>
              <div>
                <label className="label-field">Tipo</label>
                <select className="input-field" value={form.tipo || ''} onChange={(e) => set('tipo', e.target.value || null)}>
                  <option value="">Sin especificar</option>
                  <option value="Particular">Particular</option>
                  <option value="Empresa">Empresa</option>
                </select>
              </div>
            </div>
          ) : (
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3 text-sm">
              {DATOS.map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wide text-gray-400">{k}</dt>
                  <dd className={`mt-0.5 break-words ${v ? 'text-gray-800' : 'text-gray-300'}`}>{v || '—'}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {/* Estadísticas */}
        <div className="card p-5 space-y-3">
          <h3 className="font-heading font-semibold text-gray-900 text-sm flex items-center gap-1.5">
            <ClipboardList size={15} className="text-gray-400" /> Estadísticas
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-xs text-gray-400">Órdenes</p>
              <p className="text-xl font-heading font-semibold text-gray-900">{totalOrdenes}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-xs text-gray-400">Total histórico</p>
              <p className="text-xl font-heading font-semibold text-gray-900">{formatCLP(cliente.total_historico)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 col-span-2 lg:col-span-1">
              <p className="text-xs text-gray-400">Última orden</p>
              {ultimaOrden ? (
                <Link to={`/ordenes/${ultimaOrden.id}`} className="block">
                  <p className="text-xl font-heading font-semibold text-condor-700 hover:underline">OT-{ultimaOrden.numero_orden_display}</p>
                  <p className="text-xs text-gray-400">{formatFecha(ultimaOrden.fecha)}{formatRelativo(ultimaOrden.fecha) ? ` · ${formatRelativo(ultimaOrden.fecha)}` : ''}</p>
                </Link>
              ) : (
                <p className="text-sm text-gray-400 mt-1">Sin órdenes todavía</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Otros locales con este RUT */}
      {mismoRut.length > 0 && (
        <div className="card p-5 space-y-3">
          <h3 className="font-heading font-semibold text-gray-900 text-sm flex items-center gap-1.5">
            <Layers size={15} className="text-gray-400" /> Otros locales con este RUT
            <span className="text-xs font-normal text-gray-400">({mismoRut.length})</span>
          </h3>
          <p className="text-xs text-gray-400">
            Varios registros pueden compartir RUT de forma legítima (distintas sucursales de una misma empresa). Si es un duplicado por error, fusiónalos desde la lista de clientes.
          </p>
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
            {mismoRut.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/clientes/${c.id}`}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0 flex items-center gap-2.5">
                    <span className="h-8 w-8 rounded-full bg-gray-100 text-gray-600 text-[11px] font-bold flex items-center justify-center shrink-0">
                      {iniciales(c.empresa || c.nombre)}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 truncate">{c.empresa || c.nombre}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {c.comuna || 'Sin comuna'}
                        {c.direccion ? ` · ${c.direccion}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-gray-500">
                    {c.total_ordenes} orden{Number(c.total_ordenes) === 1 ? '' : 'es'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Historial de órdenes */}
      <div className="card p-5 space-y-3">
        <h3 className="font-heading font-semibold text-gray-900 text-sm flex items-center gap-1.5">
          <ClipboardList size={15} className="text-gray-400" /> Historial de órdenes
          <span className="text-xs font-normal text-gray-400">({ordenes.length})</span>
        </h3>
        {ordenes.length === 0 ? (
          <p className="text-sm text-gray-400">Este cliente aún no tiene órdenes de trabajo.</p>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="py-2 pr-2 sm:pr-3 font-semibold">Orden</th>
                  <th className="py-2 px-2 sm:px-3 font-semibold">Fecha</th>
                  <th className="py-2 px-2 sm:px-3 font-semibold">Estado</th>
                  <th className="py-2 pl-2 sm:pl-3 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ordenes.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => navigate(`/ordenes/${o.id}`)}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-2.5 pr-2 sm:pr-3 whitespace-nowrap">
                      <Link to={`/ordenes/${o.id}`} className="font-medium text-condor-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                        OT-{o.numero_orden_display}
                      </Link>
                    </td>
                    <td className="py-2.5 px-2 sm:px-3 whitespace-nowrap text-gray-600">{formatFecha(o.fecha)}</td>
                    <td className="py-2.5 px-2 sm:px-3 whitespace-nowrap"><EstadoBadge estado={o.estado} /></td>
                    <td className="py-2.5 pl-2 sm:pl-3 whitespace-nowrap text-right font-medium text-gray-800">{formatCLP(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── Lista ───────────────────────────

export default function ClientesPage() {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { id: fichaId } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [clientes, setClientes] = useState([]);
  const [duplicados, setDuplicados] = useState([]);

  const [query, setQuery] = useState('');

  const [grupoFusion, setGrupoFusion] = useState(null);
  const [ganador, setGanador] = useState(null);
  const [confirmFusion, setConfirmFusion] = useState(false);
  const [fusionando, setFusionando] = useState(false);
  const [descartando, setDescartando] = useState(null);

  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [creando, setCreando] = useState(false);

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const [clientesRes, dupRes] = await Promise.all([listClientes(), listClientesDuplicados()]);
      setClientes(clientesRes.data || []);
      setDuplicados(dupRes.data || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los clientes');
    } finally {
      setLoading(false);
    }
  };

  // La lista solo se carga cuando se está viendo (no en la ficha); al volver de
  // /clientes/:id se recarga para reflejar ediciones hechas en la ficha.
  useEffect(() => {
    if (fichaId) return;
    cargar();
  }, [fichaId]);

  const gruposConDatos = useMemo(() => {
    const clientesPorId = new Map(clientes.map((c) => [String(c.id), c]));
    return duplicados
      .map((g) => ({
        rutNormalizado: g.rut_normalizado,
        clientes: g.ids.map((id) => clientesPorId.get(String(id))).filter(Boolean),
      }))
      .filter((g) => g.clientes.length > 1);
  }, [duplicados, clientes]);

  const filtrados = useMemo(() => {
    if (!query.trim()) return clientes;
    const q = query.toLowerCase().trim();
    return clientes.filter((c) =>
      [c.rut, c.empresa, c.nombre, c.email, c.telefono, c.comuna].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [clientes, query]);

  const abrirFicha = (cliente) => {
    navigate(`/clientes/${cliente.id}`);
  };

  const handleCrear = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const data = {
      rut: form.get('rut'),
      nombre: form.get('nombre'),
      tipo: form.get('tipo') || null,
      empresa: form.get('empresa'),
      email: form.get('email'),
      telefono: form.get('telefono'),
      direccion: form.get('direccion'),
      comuna: form.get('comuna'),
    };
    setCreando(true);
    try {
      const res = await crearCliente(data);
      setNuevoOpen(false);
      addToast('Cliente creado.', { type: 'success' });
      navigate(`/clientes/${res.data.id}`);
    } catch (err) {
      addToast(`No se pudo crear el cliente: ${err.message}`, { type: 'error' });
    } finally {
      setCreando(false);
    }
  };

  const abrirFusion = (grupo) => {
    setGrupoFusion(grupo);
    setGanador(grupo.clientes.slice().sort((a, b) => b.total_ordenes - a.total_ordenes)[0].id);
  };

  const descartarGrupo = async (grupo) => {
    setDescartando(grupo.rutNormalizado);
    try {
      await descartarDuplicadoCliente(grupo.rutNormalizado);
      addToast('Grupo marcado como revisado: no volverá a aparecer como duplicado.', { type: 'success' });
      cargar();
    } catch (err) {
      addToast(`No se pudo descartar: ${err.message}`, { type: 'error' });
    } finally {
      setDescartando(null);
    }
  };

  const confirmarFusion = async () => {
    setFusionando(true);
    try {
      const perdedores = grupoFusion.clientes.filter((c) => c.id !== ganador);
      let ordenesRevinculadas = 0;
      for (const perdedor of perdedores) {
        const res = await fusionarClientes(ganador, perdedor.id, null);
        ordenesRevinculadas += res.data?.ordenesRevinculadas || 0;
      }
      setConfirmFusion(false);
      setGrupoFusion(null);
      addToast(`Clientes fusionados. ${ordenesRevinculadas} orden${ordenesRevinculadas === 1 ? '' : 'es'} quedaron vinculadas al registro resultante.`, {
        type: 'success',
      });
      cargar();
    } catch (err) {
      addToast(`No se pudo fusionar: ${err.message}`, { type: 'error' });
    } finally {
      setFusionando(false);
    }
  };

  if (fichaId) return <ClienteFicha id={fichaId} onVolver={() => navigate('/clientes')} />;

  const columns = [
    {
      key: 'empresa',
      label: 'Cliente',
      sortable: true,
      sortValue: (c) => c.empresa || c.nombre,
      render: (c) => (
        <div className="flex items-center gap-2 min-w-0">
          <div className="shrink-0 rounded-lg bg-gray-100 p-1.5 text-gray-500">
            {c.tipo === 'Empresa' ? <Building2 size={14} /> : <User size={14} />}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-gray-800 truncate max-w-[220px]">{c.empresa || c.nombre}</p>
            {c.empresa && <p className="text-xs text-gray-400 truncate max-w-[220px]">{c.nombre}</p>}
          </div>
          {gruposConDatos.some((g) => g.clientes.some((x) => x.id === c.id)) && (
            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold bg-red-100 text-red-700 rounded-full px-2 py-0.5">
              <AlertTriangle size={10} /> Duplicado
            </span>
          )}
        </div>
      ),
    },
    { key: 'rut', label: 'RUT', sortable: true, render: (c) => <span className="font-mono">{formatRut(c.rut)}</span> },
    { key: 'comuna', label: 'Comuna', sortable: true },
    { key: 'total_ordenes', label: 'Órdenes', sortable: true, align: 'right' },
    {
      key: 'total_historico',
      label: 'Total histórico',
      sortable: true,
      align: 'right',
      render: (c) => <span className="font-medium">{formatCLP(c.total_historico)}</span>,
    },
  ];

  if (error && !loading) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="No se pudieron cargar los clientes"
        description={error}
        actionLabel="Reintentar"
        onAction={cargar}
      />
    );
  }

  return (
    <div className="space-y-4">
      {gruposConDatos.length > 0 && (
        <div className="flex flex-col gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3.5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">
              <span className="font-semibold">{gruposConDatos.length} grupo{gruposConDatos.length === 1 ? '' : 's'}</span>{' '}
              de clientes con el mismo RUT detectado{gruposConDatos.length === 1 ? '' : 's'}. Fusiona solo si es el
              <span className="font-semibold"> mismo local o contacto</span> duplicado por error — si son
              <span className="font-semibold"> locales distintos de una misma empresa</span> (ej. distintas sucursales),
              marca el grupo como "No son duplicados".
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {gruposConDatos.map((g, i) => (
              <div key={i} className="flex items-center gap-1.5 w-full sm:w-auto min-w-0">
                <button onClick={() => abrirFusion(g)} className="btn-accent py-1.5 px-3 text-xs min-w-0 flex-1 sm:flex-none">
                  <GitMerge size={13} className="shrink-0" />
                  <span className="truncate">Fusionar {g.clientes[0].empresa || g.clientes[0].nombre}</span>
                </button>
                <button
                  onClick={() => descartarGrupo(g)}
                  disabled={descartando === g.rutNormalizado}
                  className="btn-secondary py-1.5 px-3 text-xs shrink-0"
                >
                  <ShieldCheck size={13} /> {descartando === g.rutNormalizado ? 'Marcando...' : 'No son duplicados'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <SearchInput placeholder="Buscar RUT, nombre, empresa, email..." value={query} onChange={setQuery} className="w-full sm:w-80" />
        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
          <p className="text-sm text-gray-400">{filtrados.length} clientes</p>
          <button onClick={() => setNuevoOpen(true)} className="btn-primary shrink-0">
            <Plus size={16} /> Nuevo cliente
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={filtrados}
        loading={loading}
        onRowClick={abrirFicha}
        emptyTitle="Sin clientes"
        emptyDescription="Prueba ajustando la búsqueda."
      />

      {/* Nuevo cliente */}
      <Modal
        open={nuevoOpen}
        onClose={() => setNuevoOpen(false)}
        title="Nuevo cliente"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setNuevoOpen(false)}>
              Cancelar
            </button>
            <button className="btn-primary" type="submit" form="form-nuevo-cliente" disabled={creando}>
              {creando ? 'Creando...' : 'Crear cliente'}
            </button>
          </>
        }
      >
        <form id="form-nuevo-cliente" onSubmit={handleCrear} className="space-y-4">
          <div>
            <label className="label-field">Nombre (persona de contacto)</label>
            <input name="nombre" required className="input-field" placeholder="Ej: Carla Curificil" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-field">RUT</label>
              <input
                name="rut"
                className="input-field"
                placeholder="12.345.678-9"
                onChange={(e) => {
                  e.target.value = formatRutInput(e.target.value);
                }}
              />
            </div>
            <div>
              <label className="label-field">Tipo</label>
              <select name="tipo" className="input-field" defaultValue="">
                <option value="">Sin especificar</option>
                <option value="Particular">Particular</option>
                <option value="Empresa">Empresa</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label-field">Empresa</label>
            <input name="empresa" className="input-field" placeholder="Ej: Burger King" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-field">Email</label>
              <input name="email" type="email" className="input-field" placeholder="contacto@empresa.cl" />
            </div>
            <div>
              <label className="label-field">Teléfono</label>
              <input name="telefono" className="input-field" placeholder="+56 9 1234 5678" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-field">Dirección</label>
              <input name="direccion" className="input-field" placeholder="Av. Los Leones 1234" />
            </div>
            <div>
              <label className="label-field">Comuna</label>
              <input name="comuna" className="input-field" placeholder="Providencia" />
            </div>
          </div>
          <p className="text-xs text-gray-400">Solo el nombre es obligatorio. El resto se puede completar después.</p>
        </form>
      </Modal>

      {/* Fusionador de duplicados */}
      <Modal
        open={!!grupoFusion}
        onClose={() => setGrupoFusion(null)}
        title="Fusionar clientes duplicados"
        size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setGrupoFusion(null)}>
              Cancelar
            </button>
            <button className="btn-accent" onClick={() => setConfirmFusion(true)}>
              <GitMerge size={15} /> Fusionar
            </button>
          </>
        }
      >
        {grupoFusion && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-100 rounded-lg px-3.5 py-2.5 text-sm text-amber-800">
              Las{' '}
              <span className="font-semibold">
                {grupoFusion.clientes.reduce((acc, c) => acc + (c.id !== ganador ? Number(c.total_ordenes) : 0), 0)} órdenes
              </span>{' '}
              de los registros descartados quedarán vinculadas al registro resultante. Esta acción queda registrada en la
              auditoría (soft merge, reversible manualmente). Úsala solo si es el mismo local o contacto duplicado por
              error — si son locales distintos de una misma empresa, cierra este modal y usa "No son duplicados".
            </div>

            <div className="overflow-x-auto">
              <div className="grid gap-3 sm:min-w-max sm:[grid-template-columns:var(--fusion-cols)]" style={{ '--fusion-cols': `repeat(${grupoFusion.clientes.length}, minmax(220px,1fr))` }}>
                {grupoFusion.clientes.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setGanador(c.id)}
                    className={`text-left rounded-xl border-2 p-4 transition-colors ${
                      ganador === c.id ? 'border-condor-600 bg-condor-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {ganador === c.id && (
                      <span className="inline-block text-[10px] font-bold text-condor-700 bg-condor-100 rounded-full px-2 py-0.5 mb-2">
                        RESULTANTE
                      </span>
                    )}
                    <p className="font-medium text-gray-900 truncate">{c.empresa || c.nombre}</p>
                    <div className="mt-2 space-y-1 text-xs text-gray-500">
                      {CAMPOS_FICHA.map(([key, label]) => (
                        <p key={key} className="truncate">
                          <span className="text-gray-400">{label}:</span> {key === 'rut' ? formatRut(c[key]) : c[key] || '—'}
                        </p>
                      ))}
                      <p className="pt-1 font-medium text-gray-700">
                        {c.total_ordenes} órdenes · {formatCLP(c.total_historico)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmFusion}
        onClose={() => setConfirmFusion(false)}
        onConfirm={confirmarFusion}
        danger
        loading={fusionando}
        title="Confirmar fusión"
        message="Esta acción no se puede deshacer desde la UI (queda en audit_log para reversión manual). ¿Continuar?"
        confirmLabel="Sí, fusionar"
      />
    </div>
  );
}
