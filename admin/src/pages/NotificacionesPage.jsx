import { useEffect, useMemo, useState } from 'react';
import {
  Mail,
  MessageCircle,
  FileText,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Eye,
  Send,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { SkeletonText, SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { formatFechaHora } from '../utils/format';
import {
  listPlantillas,
  guardarPlantilla,
  restaurarPlantilla,
  previsualizarPlantilla,
  enviarPruebaPlantilla,
  listNotificacionesLog,
  reenviarOrden,
} from '../utils/api';

const TEMPLATE_LABELS = {
  email_cliente: { label: 'Email al cliente', icon: Mail },
  email_interno: { label: 'Email interno', icon: Mail },
  telegram_ot: { label: 'Telegram OT', icon: MessageCircle },
};
const TEMPLATE_KEYS = ['email_cliente', 'email_interno', 'telegram_ot'];

function PlantillasTab() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [plantillas, setPlantillas] = useState({});
  const [variables, setVariables] = useState([]);
  const [activeKey, setActiveKey] = useState('email_cliente');

  const [asunto, setAsunto] = useState('');
  const [bloques, setBloques] = useState([]);
  const [activo, setActivo] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [pruebaOpen, setPruebaOpen] = useState(false);
  const [destinatario, setDestinatario] = useState('');
  const [enviandoPrueba, setEnviandoPrueba] = useState(false);

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listPlantillas();
      const byKey = Object.fromEntries((res.data || []).map((t) => [t.templateKey, t]));
      setPlantillas(byKey);
      setVariables(res.variablesDisponibles || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las plantillas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => {
    const t = plantillas[activeKey];
    if (t) {
      setAsunto(t.asunto || '');
      setBloques(t.bloques && t.bloques.length > 0 ? t.bloques.map((b) => (typeof b === 'string' ? b : b.content || '')) : ['']);
      setActivo(t.activo !== false);
    }
  }, [activeKey, plantillas]);

  const guardar = async () => {
    setGuardando(true);
    try {
      await guardarPlantilla(activeKey, { asunto: asunto || null, bloques: bloques.filter((b) => b.trim()), activo });
      addToast('Plantilla guardada.', { type: 'success' });
      cargar();
    } catch (err) {
      addToast(`No se pudo guardar: ${err.message}`, { type: 'error' });
    } finally {
      setGuardando(false);
    }
  };

  const restaurar = async () => {
    try {
      await restaurarPlantilla(activeKey);
      addToast('Plantilla restaurada al default del sistema.', { type: 'success' });
      cargar();
    } catch (err) {
      addToast(`No se pudo restaurar: ${err.message}`, { type: 'error' });
    }
  };

  const abrirPreview = async () => {
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      const res = await previsualizarPlantilla(activeKey, null);
      setPreview(res.data);
    } catch (err) {
      addToast(`No se pudo previsualizar: ${err.message}`, { type: 'error' });
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const enviarPrueba = async () => {
    setEnviandoPrueba(true);
    try {
      await enviarPruebaPlantilla(activeKey, null, destinatario || undefined);
      addToast('Prueba enviada.', { type: 'success' });
      setPruebaOpen(false);
    } catch (err) {
      addToast(`No se pudo enviar la prueba: ${err.message}`, { type: 'error' });
    } finally {
      setEnviandoPrueba(false);
    }
  };

  if (loading) return <div className="card p-6"><SkeletonText lines={6} /></div>;
  if (error) {
    return <EmptyState icon={AlertCircle} title="No se pudieron cargar las plantillas" description={error} actionLabel="Reintentar" onAction={cargar} />;
  }

  const esEmail = activeKey.startsWith('email_');
  const t = plantillas[activeKey];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TEMPLATE_KEYS.map((key) => {
          const meta = TEMPLATE_LABELS[key];
          const Icon = meta.icon;
          return (
            <button
              key={key}
              onClick={() => setActiveKey(key)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
                activeKey === key ? 'bg-condor-900 border-condor-900 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <Icon size={14} /> {meta.label}
              {plantillas[key]?.tieneOverride && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${activeKey === key ? 'bg-white/20' : 'bg-amber-100 text-amber-700'}`}>
                  Personalizada
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-semibold text-gray-900">{TEMPLATE_LABELS[activeKey].label}</h3>
            <label className="inline-flex items-center gap-2 text-xs text-gray-500">
              <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="rounded border-gray-300" />
              Activa
            </label>
          </div>

          {esEmail && (
            <div>
              <label className="label-field">Asunto</label>
              <input
                className="input-field"
                value={asunto}
                onChange={(e) => setAsunto(e.target.value)}
                placeholder="Deja vacío para usar el asunto por defecto"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label-field mb-0">Bloques del mensaje</label>
              <button
                type="button"
                onClick={() => setBloques((prev) => [...prev, ''])}
                className="text-xs font-semibold text-condor-700 hover:text-condor-900 inline-flex items-center gap-1"
              >
                <Plus size={13} /> Agregar bloque
              </button>
            </div>
            <div className="space-y-2">
              {bloques.map((b, i) => (
                <div key={i} className="flex items-start gap-2">
                  <textarea
                    value={b}
                    onChange={(e) => setBloques((prev) => prev.map((x, xi) => (xi === i ? e.target.value : x)))}
                    className="input-field flex-1 min-h-[70px] font-mono text-xs"
                    placeholder="Ej: Hola {{cliente_nombre}}, tu orden {{numero_orden}} fue completada."
                  />
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={i === 0}
                      onClick={() => setBloques((prev) => { const c = [...prev]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; return c; })}
                      className="p-1.5 rounded border border-gray-200 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      disabled={i === bloques.length - 1}
                      onClick={() => setBloques((prev) => { const c = [...prev]; [c[i + 1], c[i]] = [c[i], c[i + 1]]; return c; })}
                      className="p-1.5 rounded border border-gray-200 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                    >
                      <ArrowDown size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setBloques((prev) => prev.filter((_, xi) => xi !== i))}
                      className="p-1.5 rounded border border-gray-200 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-gray-400">
              Dejar todos los bloques vacíos usa el mensaje por defecto del sistema. Variables disponibles abajo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-100">
            <button className="btn-primary py-2 px-3 text-xs" onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar plantilla'}
            </button>
            <button className="btn-secondary py-2 px-3 text-xs" onClick={abrirPreview}>
              <Eye size={13} /> Previsualizar
            </button>
            <button className="btn-secondary py-2 px-3 text-xs" onClick={() => setPruebaOpen(true)}>
              <Send size={13} /> Enviar prueba
            </button>
            {t?.tieneOverride && (
              <button className="btn-secondary py-2 px-3 text-xs text-gray-500" onClick={restaurar}>
                <RotateCcw size={13} /> Restaurar default
              </button>
            )}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-heading font-semibold text-gray-900 mb-3">Variables disponibles</h3>
          <div className="flex flex-wrap gap-1.5">
            {variables.map((v) => (
              <code key={v} className="text-[11px] bg-gray-100 text-gray-700 rounded px-1.5 py-1 font-mono">
                {`{{${v}}}`}
              </code>
            ))}
          </div>
        </div>
      </div>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Previsualización" size="lg">
        {previewLoading ? (
          <SkeletonText lines={5} />
        ) : preview ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">Orden de referencia: OT-{preview.numeroOrden}</p>
            {preview.subject && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Asunto</p>
                <p className="text-sm text-gray-800">{preview.subject}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Contenido</p>
              {preview.html ? (
                <div className="border border-gray-100 rounded-lg p-3 text-sm" dangerouslySetInnerHTML={{ __html: preview.html }} />
              ) : (
                <pre className="border border-gray-100 rounded-lg p-3 text-sm whitespace-pre-wrap font-sans">{preview.text}</pre>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">No hay una orden disponible para previsualizar.</p>
        )}
      </Modal>

      <Modal
        open={pruebaOpen}
        onClose={() => setPruebaOpen(false)}
        title="Enviar mensaje de prueba"
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setPruebaOpen(false)}>Cancelar</button>
            <button className="btn-primary" onClick={enviarPrueba} disabled={enviandoPrueba}>
              {enviandoPrueba ? 'Enviando...' : 'Enviar'}
            </button>
          </>
        }
      >
        {esEmail ? (
          <>
            <label className="label-field">Destinatario</label>
            <input
              type="email"
              className="input-field"
              value={destinatario}
              onChange={(e) => setDestinatario(e.target.value)}
              placeholder="correo@ejemplo.cl (opcional, usa el de la orden de referencia)"
            />
          </>
        ) : (
          <p className="text-sm text-gray-600">Se enviará al grupo de Telegram configurado en Configuración.</p>
        )}
      </Modal>
    </div>
  );
}

function HistorialTab() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [soloFallidas, setSoloFallidas] = useState(false);
  const [canal, setCanal] = useState('');
  const [reenviandoId, setReenviandoId] = useState(null);

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listNotificacionesLog({ limit: 100, soloFallidas: soloFallidas || undefined, canal: canal || undefined });
      setRows(res.data.rows || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      setError(err.message || 'No se pudo cargar el historial');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soloFallidas, canal]);

  const handleReenviar = async (row) => {
    setReenviandoId(row.id);
    try {
      await reenviarOrden(row.orden_id);
      addToast(`OT-${row.numero_orden_display} reenviada.`, { type: 'success' });
      cargar();
    } catch (err) {
      addToast(`No se pudo reenviar: ${err.message}`, { type: 'error' });
    } finally {
      setReenviandoId(null);
    }
  };

  if (error && !loading) {
    return <EmptyState icon={AlertCircle} title="No se pudo cargar el historial" description={error} actionLabel="Reintentar" onAction={cargar} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={soloFallidas} onChange={(e) => setSoloFallidas(e.target.checked)} className="rounded border-gray-300" />
          Solo fallidas
        </label>
        <select value={canal} onChange={(e) => setCanal(e.target.value)} className="input-field w-40 py-1.5 text-sm">
          <option value="">Todos los canales</option>
          <option value="resend">Email</option>
          <option value="telegram">Telegram</option>
        </select>
        <p className="text-xs text-gray-400 ml-auto">{total} envíos</p>
      </div>

      {loading ? (
        <div className="card overflow-hidden"><SkeletonTable rows={6} columns={5} /></div>
      ) : rows.length === 0 ? (
        <EmptyState title="Sin envíos" description="Todavía no se ha registrado ninguna notificación." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-auto max-h-[65vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">OT</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Canal</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Destinatario</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 font-mono font-semibold text-gray-800">OT-{r.numero_orden_display}</td>
                    <td className="px-4 py-3 text-gray-600">{r.canal === 'resend' ? 'Email' : 'Telegram'}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[220px] truncate">{r.destinatario || '—'}</td>
                    <td className="px-4 py-3 text-gray-400">{formatFechaHora(r.sent_at)}</td>
                    <td className="px-4 py-3">
                      {r.ok ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                          <CheckCircle2 size={13} /> Entregado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500" title={r.error}>
                          <XCircle size={13} /> Falló
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!r.ok && (
                        <button
                          onClick={() => handleReenviar(r)}
                          disabled={reenviandoId === r.id}
                          className="text-xs font-semibold text-condor-700 hover:text-condor-900"
                        >
                          {reenviandoId === r.id ? 'Reenviando...' : 'Reenviar'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NotificacionesPage() {
  const [tab, setTab] = useState('plantillas');

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { key: 'plantillas', label: 'Plantillas', icon: FileText },
          { key: 'historial', label: 'Historial', icon: Mail },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-condor-600 text-condor-900' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'plantillas' ? <PlantillasTab /> : <HistorialTab />}
    </div>
  );
}
