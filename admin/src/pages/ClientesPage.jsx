import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GitMerge, ShieldCheck, AlertTriangle, Building2, User, AlertCircle } from 'lucide-react';
import DataTable from '../components/DataTable';
import SearchInput from '../components/SearchInput';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/Toast';
import { formatCLP, formatRut } from '../utils/format';
import {
  listClientes,
  listClientesDuplicados,
  getCliente,
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

export default function ClientesPage() {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { id: fichaId } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [clientes, setClientes] = useState([]);
  const [duplicados, setDuplicados] = useState([]);

  const [query, setQuery] = useState('');
  const [ficha, setFicha] = useState(null);
  const [fichaOrdenes, setFichaOrdenes] = useState([]);
  const [fichaEdit, setFichaEdit] = useState(null);
  const [mismoRut, setMismoRut] = useState([]);
  const [guardando, setGuardando] = useState(false);

  const [grupoFusion, setGrupoFusion] = useState(null);
  const [ganador, setGanador] = useState(null);
  const [confirmFusion, setConfirmFusion] = useState(false);
  const [fusionando, setFusionando] = useState(false);
  const [descartando, setDescartando] = useState(null);

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

  useEffect(() => {
    cargar();
  }, []);

  // La ficha 360 tiene su propia ruta (/clientes/:id) para que quede en el historial
  // del navegador: al volver de "Ver orden" o "Otros locales con este RUT" (que
  // navegan a nuevas rutas), history.back() reabre esta misma ficha automáticamente.
  useEffect(() => {
    if (!fichaId) {
      setFicha(null);
      setFichaEdit(null);
      setFichaOrdenes([]);
      setMismoRut([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await getCliente(fichaId);
        if (cancelled) return;
        setFicha(res.data);
        setFichaEdit({ ...res.data });
        setFichaOrdenes(res.data.ultimasOrdenes || []);
      } catch (err) {
        if (cancelled) return;
        addToast(`No se pudo cargar el cliente: ${err.message}`, { type: 'error' });
        navigate('/clientes', { replace: true });
        return;
      }
      try {
        const rutRes = await getClientesMismoRut(fichaId);
        if (!cancelled) setMismoRut(rutRes.data || []);
      } catch {
        if (!cancelled) setMismoRut([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const guardarFicha = async () => {
    setGuardando(true);
    try {
      await actualizarCliente(ficha.id, {
        rut: fichaEdit.rut,
        nombre: fichaEdit.nombre,
        tipo: fichaEdit.tipo,
        empresa: fichaEdit.empresa,
        email: fichaEdit.email,
        telefono: fichaEdit.telefono,
        direccion: fichaEdit.direccion,
        comuna: fichaEdit.comuna,
      });
      addToast('Cambios guardados.', { type: 'success' });
      navigate('/clientes');
      cargar();
    } catch (err) {
      addToast(`No se pudo guardar: ${err.message}`, { type: 'error' });
    } finally {
      setGuardando(false);
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
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-3.5">
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
          <div className="flex gap-2 flex-wrap shrink-0">
            {gruposConDatos.map((g, i) => (
              <div key={i} className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => abrirFusion(g)} className="btn-accent py-1.5 px-3 text-xs shrink-0">
                  <GitMerge size={13} /> Fusionar {g.clientes[0].empresa || g.clientes[0].nombre}
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

      <div className="flex items-center justify-between gap-3">
        <SearchInput placeholder="Buscar RUT, nombre, empresa, email..." value={query} onChange={setQuery} className="w-80" />
        <p className="text-sm text-gray-400 shrink-0">{filtrados.length} clientes</p>
      </div>

      <DataTable
        columns={columns}
        rows={filtrados}
        loading={loading}
        onRowClick={abrirFicha}
        emptyTitle="Sin clientes"
        emptyDescription="Prueba ajustando la búsqueda."
      />

      {/* Ficha 360 */}
      <Modal open={!!ficha} onClose={() => navigate('/clientes')} title={ficha ? ficha.empresa || ficha.nombre : ''} size="lg">
        {ficha && fichaEdit && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[11px] text-gray-400 uppercase">Órdenes</p>
                <p className="font-heading font-bold text-lg text-gray-900">{ficha.total_ordenes}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[11px] text-gray-400 uppercase">Total histórico</p>
                <p className="font-heading font-bold text-lg text-gray-900">{formatCLP(ficha.total_historico)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label-field">RUT</label>
                <input
                  className="input-field font-mono"
                  value={fichaEdit.rut || ''}
                  onChange={(e) => setFichaEdit((f) => ({ ...f, rut: e.target.value }))}
                />
              </div>
              <div>
                <label className="label-field">Nombre contacto</label>
                <input
                  className="input-field"
                  value={fichaEdit.nombre || ''}
                  onChange={(e) => setFichaEdit((f) => ({ ...f, nombre: e.target.value }))}
                />
              </div>
              <div>
                <label className="label-field">Empresa</label>
                <input
                  className="input-field"
                  value={fichaEdit.empresa || ''}
                  onChange={(e) => setFichaEdit((f) => ({ ...f, empresa: e.target.value }))}
                />
              </div>
              <div>
                <label className="label-field">Email</label>
                <input
                  className="input-field"
                  value={fichaEdit.email || ''}
                  onChange={(e) => setFichaEdit((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <label className="label-field">Teléfono</label>
                <input
                  className="input-field"
                  value={fichaEdit.telefono || ''}
                  onChange={(e) => setFichaEdit((f) => ({ ...f, telefono: e.target.value }))}
                />
              </div>
              <div>
                <label className="label-field">Dirección</label>
                <input
                  className="input-field"
                  value={fichaEdit.direccion || ''}
                  onChange={(e) => setFichaEdit((f) => ({ ...f, direccion: e.target.value }))}
                />
              </div>
              <div>
                <label className="label-field">Tipo</label>
                <select
                  className="input-field"
                  value={fichaEdit.tipo || ''}
                  onChange={(e) => setFichaEdit((f) => ({ ...f, tipo: e.target.value || null }))}
                >
                  <option value="">Sin especificar</option>
                  <option value="Particular">Particular</option>
                  <option value="Empresa">Empresa</option>
                </select>
              </div>
              <div>
                <label className="label-field">Comuna</label>
                <input
                  className="input-field"
                  value={fichaEdit.comuna || ''}
                  onChange={(e) => setFichaEdit((f) => ({ ...f, comuna: e.target.value }))}
                />
              </div>
            </div>

            {fichaOrdenes.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-2">Últimas órdenes</h3>
                <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  {fichaOrdenes.slice(0, 10).map((o) => (
                    <button
                      key={o.id}
                      onClick={() => navigate(`/ordenes/${o.id}`)}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-gray-700">OT-{o.numero_orden_display}</span>
                      <span className="font-medium text-gray-800">{formatCLP(o.total)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mismoRut.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-2">Otros locales con este RUT</h3>
                <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  {mismoRut.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/clientes/${c.id}`)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate">{c.empresa || c.nombre}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {c.comuna || 'Sin comuna'}
                          {c.direccion ? ` · ${c.direccion}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-gray-500">
                        {c.total_ordenes} orden{c.total_ordenes === 1 ? '' : 'es'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button className="btn-primary" onClick={guardarFicha} disabled={guardando}>
                {guardando ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        )}
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
              <div className="grid gap-3 min-w-max" style={{ gridTemplateColumns: `repeat(${grupoFusion.clientes.length}, minmax(220px,1fr))` }}>
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
