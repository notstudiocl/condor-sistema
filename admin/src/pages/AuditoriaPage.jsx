import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, AlertCircle, History } from 'lucide-react';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { formatFechaHora } from '../utils/format';
import { getAuditoriaGlobal, listUsuarios } from '../utils/api';

const ENTIDADES = [
  { value: '', label: 'Todas las entidades' },
  { value: 'ordenes', label: 'Órdenes' },
  { value: 'clientes', label: 'Clientes' },
  { value: 'empleados', label: 'Empleados' },
  { value: 'servicios', label: 'Servicios' },
  { value: 'admin_users', label: 'Usuarios del panel' },
  { value: 'notification_channels', label: 'Canales de notificación' },
  { value: 'notification_templates', label: 'Plantillas' },
  { value: 'app_settings', label: 'Configuración' },
];

const LIMIT = 50;

export default function AuditoriaPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [usuarios, setUsuarios] = useState([]);
  const [filtros, setFiltros] = useState({ entidad: '', adminUserId: '', fechaDesde: '', fechaHasta: '' });
  const [detalle, setDetalle] = useState(null);

  useEffect(() => {
    listUsuarios()
      .then((res) => setUsuarios(res.data || []))
      .catch(() => {});
  }, []);

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getAuditoriaGlobal({ page, limit: LIMIT, ...filtros });
      setRows(res.data.rows || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      setError(err.message || 'No se pudo cargar la auditoría');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filtros]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const handleFiltro = (key, value) => {
    setPage(1);
    setFiltros((prev) => ({ ...prev, [key]: value }));
  };

  const columns = [
    {
      key: 'created_at',
      label: 'Fecha',
      render: (r) => <span className="whitespace-nowrap">{formatFechaHora(r.created_at)}</span>,
    },
    {
      key: 'admin_nombre',
      label: 'Admin',
      render: (r) =>
        r.admin_nombre || r.admin_email ? (
          <div>
            <p className="text-gray-800">{r.admin_nombre || '—'}</p>
            <p className="text-xs text-gray-400">{r.admin_email}</p>
          </div>
        ) : (
          <span className="text-gray-400">Sistema</span>
        ),
    },
    {
      key: 'accion',
      label: 'Acción',
      render: (r) => <span className="font-mono text-xs bg-gray-100 rounded px-2 py-1">{r.accion}</span>,
    },
    {
      key: 'entidad',
      label: 'Entidad',
      render: (r) => (
        <span>
          {r.entidad}
          {r.entidad_id ? <span className="text-gray-400"> #{r.entidad_id}</span> : null}
        </span>
      ),
    },
    {
      key: 'detalle',
      label: 'Detalle',
      render: (r) =>
        r.detalle ? (
          <button
            onClick={() => setDetalle(r)}
            className="inline-flex items-center gap-1 text-xs font-medium text-condor-700 hover:text-condor-900"
          >
            <Eye size={13} /> Ver
          </button>
        ) : (
          <span className="text-gray-300">—</span>
        ),
    },
  ];

  if (error && !loading) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="No se pudo cargar la auditoría"
        description={error}
        actionLabel="Reintentar"
        onAction={cargar}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label-field">Entidad</label>
          <select
            value={filtros.entidad}
            onChange={(e) => handleFiltro('entidad', e.target.value)}
            className="input-field w-52"
          >
            {ENTIDADES.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label-field">Usuario</label>
          <select
            value={filtros.adminUserId}
            onChange={(e) => handleFiltro('adminUserId', e.target.value)}
            className="input-field w-52"
          >
            <option value="">Todos los usuarios</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre || u.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label-field">Desde</label>
          <input
            type="date"
            value={filtros.fechaDesde}
            onChange={(e) => handleFiltro('fechaDesde', e.target.value)}
            className="input-field w-40"
          />
        </div>
        <div>
          <label className="label-field">Hasta</label>
          <input
            type="date"
            value={filtros.fechaHasta}
            onChange={(e) => handleFiltro('fechaHasta', e.target.value)}
            className="input-field w-40"
          />
        </div>
        <p className="text-sm text-gray-400 ml-auto">{total} registro{total === 1 ? '' : 's'}</p>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        emptyTitle="Sin actividad registrada"
        emptyDescription="No hay eventos de auditoría para los filtros seleccionados."
      />

      {!loading && rows.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">
            Página {page} de {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              className="btn-secondary py-2 px-3"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={15} /> Anterior
            </button>
            <button
              className="btn-secondary py-2 px-3"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Siguiente <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      <Modal open={!!detalle} onClose={() => setDetalle(null)} title="Detalle del cambio" size="md">
        {detalle && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <History size={15} />
              <span>
                {detalle.accion} · {detalle.entidad}
                {detalle.entidad_id ? ` #${detalle.entidad_id}` : ''} · {formatFechaHora(detalle.created_at)}
              </span>
            </div>
            <pre className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap break-words">
              {JSON.stringify(detalle.detalle, null, 2)}
            </pre>
          </div>
        )}
      </Modal>
    </div>
  );
}
