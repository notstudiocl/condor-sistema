import { useEffect, useState } from 'react';
import { Power, AlertTriangle, ListChecks, RotateCcw } from 'lucide-react';
import { SkeletonText } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { getConfiguracionGeneral, guardarConfiguracionGeneral, listJobs, reintentarJob } from '../utils/api';
import { formatRelativo } from '../utils/format';

// Configuración General — SOLO notstudio (soporte de NotStudio). Kill switch operativo de la
// suscripción y redirección de correos en modo desarrollo. Los valores viven en app_settings;
// las variables de entorno de EasyPanel quedan solo como respaldo cuando no hay valor guardado.
// Cola de trabajos: PDFs/notificaciones que fallaron en línea y el worker completa con reintentos.
function JobsCard() {
  const { addToast } = useToast();
  const [data, setData] = useState(null);
  const cargar = () => listJobs().then((r) => setData(r.data)).catch(() => setData({ jobs: [], alertasConfiguradas: false }));
  useEffect(() => { cargar(); const t = setInterval(cargar, 15000); return () => clearInterval(t); }, []);
  const reintentar = async (id) => {
    try { await reintentarJob(id); addToast('Job reencolado', { type: 'success' }); cargar(); } catch (err) { addToast(err.message, { type: 'error' }); }
  };
  const tono = { ok: 'bg-emerald-50 text-emerald-700', error: 'bg-red-50 text-red-700', pendiente: 'bg-amber-50 text-amber-700', procesando: 'bg-blue-50 text-blue-700' };
  if (!data) return null;
  return (
    <div className="card p-5 space-y-3">
      <h3 className="font-heading font-semibold text-gray-900 flex items-center gap-2"><ListChecks size={16} className="text-gray-400" /> Cola de trabajos</h3>
      <p className="text-xs text-gray-500">
        Si el PDF o las notificaciones fallan al enviar una orden, quedan acá y se reintentan solos (1, 5 y 25 min). Si un trabajo agota
        sus reintentos, NotStudio recibe una alerta por Telegram{data.alertasConfiguradas ? '' : ' (alertas sin configurar: faltan ALERTAS_TELEGRAM_* en el servidor)'}.
      </p>
      {data.jobs.length === 0 ? (
        <p className="text-sm text-gray-400">Sin trabajos registrados.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-400"><th className="py-1 pr-3">#</th><th className="pr-3">Tipo</th><th className="pr-3">Orden</th><th className="pr-3">Estado</th><th className="pr-3">Intentos</th><th className="pr-3">Cuándo</th><th className="pr-3">Último error</th><th></th></tr></thead>
            <tbody>
              {data.jobs.map((j) => (
                <tr key={j.id} className="border-t border-gray-100">
                  <td className="py-1.5 pr-3 text-gray-400">{j.id}</td>
                  <td className="pr-3">{j.tipo}</td>
                  <td className="pr-3">{j.payload?.ordenId ? <a href={`#/ordenes/${j.payload.ordenId}`} className="text-condor-700 hover:underline">{j.payload.ordenId}</a> : '—'}</td>
                  <td className="pr-3"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${tono[j.estado] || ''}`}>{j.estado}</span></td>
                  <td className="pr-3 tabular-nums">{j.intentos}/{j.max_intentos}</td>
                  <td className="pr-3 text-gray-500 whitespace-nowrap">{formatRelativo(j.updated_at)}</td>
                  <td className="pr-3 text-xs text-red-600 max-w-[260px] truncate" title={j.last_error || ''}>{j.last_error || ''}</td>
                  <td>{j.estado === 'error' && <button className="btn-secondary py-1 px-2 text-xs" onClick={() => reintentar(j.id)}><RotateCcw size={12} /> Reintentar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ConfiguracionPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ subscription_active: true, subscription_message: '', email_dev_redirect: '' });
  const [meta, setMeta] = useState({});
  const [guardando, setGuardando] = useState(false);

  const cargar = () => {
    setLoading(true);
    getConfiguracionGeneral()
      .then((res) => {
        const d = res.data || {};
        setForm({
          subscription_active: d.subscription_active?.value !== false,
          subscription_message: d.subscription_message?.value || '',
          email_dev_redirect: d.email_dev_redirect?.value || '',
        });
        setMeta(d);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };
  useEffect(cargar, []);

  const guardar = async () => {
    setGuardando(true);
    try {
      await guardarConfiguracionGeneral(form);
      addToast('Configuración guardada', { type: 'success' });
      cargar();
    } catch (err) {
      addToast(err.message, { type: 'error' });
    } finally {
      setGuardando(false);
    }
  };

  if (loading) return <div className="card p-5"><SkeletonText lines={5} /></div>;
  if (error) return <div className="card p-6 text-center text-sm text-red-600">{error}</div>;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className={`card p-5 space-y-4 ${form.subscription_active ? '' : 'border-red-200 bg-red-50/40'}`}>
        <h3 className="font-heading font-semibold text-gray-900 flex items-center gap-2">
          <Power size={16} className={form.subscription_active ? 'text-emerald-600' : 'text-red-600'} /> Kill switch de suscripción
        </h3>
        <p className="text-xs text-gray-500">
          Desactivado, la app de terreno deja de aceptar órdenes nuevas, ediciones y reenvíos, y muestra el mensaje de
          abajo a los técnicos. El panel sigue operativo. No es facturación: es un freno operativo.
        </p>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="rounded border-gray-300 w-4 h-4" checked={form.subscription_active} onChange={(e) => setForm((f) => ({ ...f, subscription_active: e.target.checked }))} />
          <span className="text-sm text-gray-800">Suscripción activa</span>
        </label>
        {!form.subscription_active && (
          <p className="text-xs text-red-700 flex items-center gap-1.5"><AlertTriangle size={13} /> Los técnicos no podrán enviar órdenes mientras esté desactivada.</p>
        )}
        <div>
          <label className="label-field">Mensaje mostrado cuando está inactiva</label>
          <input className="input-field" value={form.subscription_message} onChange={(e) => setForm((f) => ({ ...f, subscription_message: e.target.value }))} placeholder="Ej: Servicio suspendido temporalmente. Contacte a NotStudio." />
        </div>
        {meta.subscription_active?.desdeEnv && <p className="text-xs text-gray-400">Valor actual heredado de la variable de entorno del servidor; al guardar queda fijado acá.</p>}
      </div>

      <div className="card p-5 space-y-3">
        <h3 className="font-heading font-semibold text-gray-900">Modo desarrollo: redirección de correos</h3>
        <p className="text-xs text-gray-500">
          Con un correo acá, <b>todos</b> los correos del sistema (cliente e interno) se envían a esa casilla con el
          destinatario real anotado en el asunto. Telegram no se redirige. <b>Dejar vacío en producción.</b>
        </p>
        <input className="input-field" type="email" value={form.email_dev_redirect} onChange={(e) => setForm((f) => ({ ...f, email_dev_redirect: e.target.value }))} placeholder="vacío = enviar a los destinatarios reales" />
        {form.email_dev_redirect && <p className="text-xs text-amber-700 flex items-center gap-1.5"><AlertTriangle size={13} /> Redirección activa: ningún cliente recibe correos.</p>}
      </div>

      <div>
        <button className="btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
      </div>

      <JobsCard />
    </div>
  );
}
