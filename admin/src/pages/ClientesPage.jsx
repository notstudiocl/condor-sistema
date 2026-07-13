import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GitMerge, AlertTriangle, Building2, User, AlertCircle } from 'lucide-react';
import DataTable from '../components/DataTable';
import SearchInput from '../components/SearchInput';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/Toast';
import { formatCLP, formatRut } from '../utils/format';
import { listClientes, listClientesDuplicados, actualizarCliente, fusionarClientes, getOrdenesCliente } from '../utils/api';

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
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [clientes, setClientes] = useState([]);
  const [duplicados, setDuplicados] = useState([]);

  const [query, setQuery] = useState('');
  const [ficha, setFicha] = useState(null);
  const [fichaOrdenes, setFichaOrdenes] = useState([]);
  const [fichaEdit, setFichaEdit] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const [grupoFusion, setGrupoFusion] = useState(null);
  const [ganador, setGanador] = useState(null);
  const [confirmFusion, setConfirmFusion] = useState(false);
  const [fusionando, setFusionando] = useState(false);

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

  // Deep-link desde el detalle de una orden (?ficha=123) abre la ficha directamente.
  useEffect(() => {
    const fichaId = searchParams.get('ficha');
    if (fichaId && clientes.length > 0) {
      const c = clientes.find((x) => String(x.id) === fichaId);
      if (c) abrirFicha(c);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientes]);

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

  const abrirFicha = async (cliente) => {
    setFicha(cliente);
    setFichaEdit({ ...cliente });
    setFichaOrdenes([]);
    try {
      const res = await getOrdenesCliente(cliente.id);
      setFichaOrdenes(res.data || []);
    } catch {
      // silencioso — la ficha igual es útil sin el historial
    }
  };

  const guardarFicha = async () => {
    setGuardando(true);
    try {
      await actualizarCliente(ficha.id, {
        rut: fichaEdit.rut,
        nombre: fichaEdit.nombre,
        empresa: fichaEdit.empresa,
        email: fichaEdit.email,
        telefono: fichaEdit.telefono,
        direccion: fichaEdit.direccion,
        comuna: fichaEdit.comuna,
      });
      addToast('Cambios guardados.', { type: 'success' });
      setFicha(null);
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
              de clientes con el mismo RUT detectado{gruposConDatos.length === 1 ? '' : 's'}. Fusionarlos evita historiales
              partidos.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap shrink-0">
            {gruposConDatos.map((g, i) => (
              <button key={i} onClick={() => abrirFusion(g)} className="btn-accent py-1.5 px-3 text-xs shrink-0">
                <GitMerge size={13} /> Fusionar {g.clientes[0].empresa || g.clientes[0].nombre}
              </button>
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
      <Modal open={!!ficha} onClose={() => setFicha(null)} title={ficha ? ficha.empresa || ficha.nombre : ''} size="lg">
        {ficha && fichaEdit && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[11px] text-gray-400 uppercase">Órdenes</p>
                <p className="font-heading font-bold text-lg text-gray-900">{ficha.total_ordenes}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[11px] text-gray-400 uppercase">Total histórico</p>
                <p className="font-heading font-bold text-lg text-gray-900">{formatCLP(ficha.total_historico)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[11px] text-gray-400 uppercase">Tipo</p>
                <p className="font-heading font-bold text-lg text-gray-900">{ficha.tipo || '—'}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[11px] text-gray-400 uppercase">Comuna</p>
                <p className="font-heading font-bold text-lg text-gray-900 truncate">{ficha.comuna || '—'}</p>
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
            </div>

            {fichaOrdenes.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-2">Últimas órdenes</h3>
                <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  {fichaOrdenes.slice(0, 10).map((o) => (
                    <div key={o.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-gray-700">OT-{o.numero_orden_display}</span>
                      <span className="font-medium text-gray-800">{formatCLP(o.total)}</span>
                    </div>
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
              auditoría (soft merge, reversible manualmente).
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
