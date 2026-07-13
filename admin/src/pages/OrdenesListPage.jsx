import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ExcelJS from 'exceljs';
import { Download, Plus, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import DataTable from '../components/DataTable';
import FilterChips from '../components/FilterChips';
import SearchInput from '../components/SearchInput';
import EstadoBadge from '../components/EstadoBadge';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/Toast';
import { formatCLP, formatFecha } from '../utils/format';
import { ESTADOS } from '../utils/constants';
import { listOrdenes, listEmpleados, cambiarEstadoOrden, cambiarEstadoOrdenesMasivo } from '../utils/api';

const PAGE_SIZE = 50;

// `format` deja cada celda con el tipo correcto para Excel (no todo como texto):
// fecha en formato chileno legible, total como número real (sumable/formateable
// por la oficina al cuadrar contra la factura del contador, ver plan §Órdenes).
const EXPORT_COLUMNS = [
  { key: 'numero_orden_display', label: 'OT', width: 12 },
  { key: 'fecha', label: 'Fecha', width: 14, format: formatFecha },
  { key: 'estado', label: 'Estado', width: 18 },
  { key: 'cliente_empresa', label: 'Cliente', width: 28 },
  { key: 'supervisor', label: 'Supervisor', width: 24 },
  { key: 'comuna', label: 'Comuna', width: 18 },
  { key: 'total', label: 'Total', width: 14, format: (v) => Number(v) || 0, numFmt: '#,##0' },
];

async function exportExcel(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Órdenes');

  sheet.columns = EXPORT_COLUMNS.map((c) => ({ header: c.label, key: c.key, width: c.width, style: c.numFmt ? { numFmt: c.numFmt } : undefined }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: 'middle' };

  rows.forEach((r) => {
    sheet.addRow(
      Object.fromEntries(EXPORT_COLUMNS.map((c) => [c.key, c.format ? c.format(r[c.key]) : r[c.key] ?? '']))
    );
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ordenes_condor_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// Badge de estado que se convierte en <select> al hacer click — cambio inline
// optimista con Deshacer (toast), sin salir de la tabla.
function EstadoCell({ orden, onChange }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <select
        autoFocus
        defaultValue={orden.estado}
        onBlur={() => setEditing(false)}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          setEditing(false);
          if (e.target.value !== orden.estado) onChange(orden, e.target.value);
        }}
        className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-condor-400"
      >
        {ESTADOS.map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
      </select>
    );
  }
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      title="Cambiar estado"
      className="cursor-pointer"
    >
      <EstadoBadge estado={orden.estado} />
    </button>
  );
}

export default function OrdenesListPage() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const estadoParam = searchParams.get('estado');
  const [estadosActivos, setEstadosActivos] = useState(estadoParam ? estadoParam.split(',') : []);
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ordenes, setOrdenes] = useState([]);
  const [total, setTotal] = useState(0);
  const [estadoCounts, setEstadoCounts] = useState({});

  const handleEstadosChange = (next) => {
    setEstadosActivos(next);
    setPage(1);
    const params = {};
    if (next.length > 0) params.estado = next.join(',');
    if (query) params.q = query;
    setSearchParams(params);
  };

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listOrdenes({
        page,
        limit: PAGE_SIZE,
        estado: estadosActivos.length > 0 ? estadosActivos.join(',') : undefined,
        q: query || undefined,
      });
      setOrdenes(res.data.ordenes || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las órdenes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, estadosActivos, query]);

  // La selección múltiple (y su suma en CLP) se calcula solo contra `ordenes`, la página
  // actualmente cargada — ver `seleccionadas`/`sumaSeleccion` más abajo. Si no se limpia
  // acá, cambiar de página/filtro deja ids seleccionados que ya no están en `ordenes`:
  // el contador del banner ("N seleccionadas") queda desactualizado mientras la suma cae
  // silenciosamente a lo que sí sigue visible (o $0), mostrando un total incorrecto justo
  // en el flujo de "Marcar como Facturada" que se usa para cuadrar contra la factura.
  useEffect(() => {
    setSelected([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, estadosActivos, query]);

  // Counts por estado para los chips — 5 queries livianas (limit=1, solo se usa el total).
  useEffect(() => {
    Promise.all(ESTADOS.map((e) => listOrdenes({ estado: e, limit: 1 }).then((r) => [e, r.data.total || 0])))
      .then((pairs) => setEstadoCounts(Object.fromEntries(pairs)))
      .catch(() => {});
  }, [ordenes.length]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const seleccionadas = ordenes.filter((o) => selected.includes(o.id));
  const sumaSeleccion = seleccionadas.reduce((acc, o) => acc + (Number(o.total) || 0), 0);

  const estadoOptions = ESTADOS.map((e) => ({ value: e, label: e, count: estadoCounts[e] }));

  const handleCambiarEstado = async (orden, nuevoEstado) => {
    const anterior = orden.estado;
    setOrdenes((prev) => prev.map((o) => (o.id === orden.id ? { ...o, estado: nuevoEstado } : o)));
    try {
      await cambiarEstadoOrden(orden.id, nuevoEstado);
      addToast(`OT-${orden.numero_orden_display} ahora está "${nuevoEstado}".`, {
        type: 'success',
        actionLabel: 'Deshacer',
        onAction: async () => {
          setOrdenes((prev) => prev.map((o) => (o.id === orden.id ? { ...o, estado: anterior } : o)));
          try {
            await cambiarEstadoOrden(orden.id, anterior);
          } catch (err) {
            addToast(`No se pudo deshacer: ${err.message}`, { type: 'error' });
          }
        },
      });
    } catch (err) {
      setOrdenes((prev) => prev.map((o) => (o.id === orden.id ? { ...o, estado: anterior } : o)));
      addToast(`No se pudo cambiar el estado: ${err.message}`, { type: 'error' });
    }
  };

  const handleBulkFacturar = async () => {
    setBulkLoading(true);
    try {
      const res = await cambiarEstadoOrdenesMasivo(selected, 'Facturada');
      setConfirmBulk(false);
      addToast(
        `${res.data.actualizadas} orden${res.data.actualizadas === 1 ? '' : 'es'} marcada${res.data.actualizadas === 1 ? '' : 's'} como Facturada.`,
        { type: 'success' }
      );
      setSelected([]);
      cargar();
    } catch (err) {
      addToast(`No se pudo aplicar el cambio en lote: ${err.message}`, { type: 'error' });
    } finally {
      setBulkLoading(false);
    }
  };

  const columns = [
    {
      key: 'numero_orden_display',
      label: 'OT',
      sortable: true,
      render: (o) => <span className="font-mono font-semibold text-gray-800">OT-{o.numero_orden_display}</span>,
    },
    { key: 'fecha', label: 'Fecha', sortable: true, render: (o) => formatFecha(o.fecha) },
    {
      key: 'cliente_empresa',
      label: 'Cliente',
      sortable: true,
      sortValue: (o) => o.cliente_empresa || o.supervisor,
      render: (o) => (
        <div className="min-w-0">
          <p className="font-medium text-gray-800 truncate max-w-[220px]">{o.cliente_empresa || o.supervisor || 'Sin cliente'}</p>
          <p className="text-xs text-gray-400 truncate max-w-[220px]">{o.comuna}</p>
        </div>
      ),
    },
    { key: 'supervisor', label: 'Supervisor', sortable: true },
    {
      key: 'estado',
      label: 'Estado',
      sortable: true,
      render: (o) => <EstadoCell orden={o} onChange={handleCambiarEstado} />,
    },
    {
      key: 'total',
      label: 'Total',
      sortable: true,
      align: 'right',
      render: (o) => <span className="font-medium">{formatCLP(o.total)}</span>,
    },
  ];

  if (error && !loading) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="No se pudieron cargar las órdenes"
        description={error}
        actionLabel="Reintentar"
        onAction={cargar}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
        <FilterChips options={estadoOptions} values={estadosActivos} onChange={handleEstadosChange} />
        <div className="flex items-center gap-2 shrink-0">
          <SearchInput
            placeholder="Buscar OT, RUT, cliente, dirección..."
            value={query}
            onChange={setQuery}
            onSearch={(v) => {
              setPage(1);
              setQuery(v);
            }}
            className="w-72"
          />
          <button
            onClick={() =>
              exportExcel(ordenes).catch((err) => addToast(`No se pudo exportar: ${err.message}`, { type: 'error' }))
            }
            className="btn-secondary shrink-0"
            title="Exporta la página actual"
          >
            <Download size={15} />
            <span className="hidden sm:inline">Exportar a Excel</span>
          </button>
          <button onClick={() => navigate('/ordenes/nueva')} className="btn-primary shrink-0">
            <Plus size={16} /> Nueva orden
          </button>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="flex items-center justify-between gap-3 bg-condor-50 border border-condor-200 rounded-xl px-4 py-3">
          <p className="text-sm text-condor-900">
            <span className="font-semibold">{selected.length}</span> orden{selected.length === 1 ? '' : 'es'}{' '}
            seleccionada{selected.length === 1 ? '' : 's'} · suma{' '}
            <span className="font-semibold">{formatCLP(sumaSeleccion)}</span>
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelected([])} className="btn-secondary py-1.5 px-3 text-xs">
              Limpiar
            </button>
            <button onClick={() => setConfirmBulk(true)} className="btn-primary py-1.5 px-3 text-xs">
              Marcar como Facturada
            </button>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={ordenes}
        loading={loading}
        onRowClick={(o) => navigate(`/ordenes/${o.id}`)}
        selectable
        selectedIds={selected}
        onSelectionChange={setSelected}
        emptyTitle="No hay órdenes"
        emptyDescription={query || estadosActivos.length > 0 ? 'Prueba ajustando los filtros o la búsqueda.' : 'Todavía no hay órdenes registradas.'}
      />

      {!loading && ordenes.length > 0 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <p>
            {total} orden{total === 1 ? '' : 'es'} · página {page} de {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="btn-secondary py-1.5 px-2.5 disabled:opacity-40"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="btn-secondary py-1.5 px-2.5 disabled:opacity-40"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmBulk}
        onClose={() => setConfirmBulk(false)}
        onConfirm={handleBulkFacturar}
        loading={bulkLoading}
        title="Marcar órdenes como Facturada"
        message={`Vas a marcar ${selected.length} orden${selected.length === 1 ? '' : 'es'} como Facturada, por un total de ${formatCLP(sumaSeleccion)}.`}
        confirmLabel="Marcar como Facturada"
      />
    </div>
  );
}
