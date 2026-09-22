import { useEffect, useState } from 'react';
import { Mail, MessageCircle, Loader2, Webhook } from 'lucide-react';
import { SkeletonText } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import {
  getCanalNotificacion,
  actualizarCanalNotificacion,
  probarCanalNotificacion,
  getWebhookNotificaciones,
  guardarWebhookNotificaciones,
} from '../utils/api';

// Integraciones técnicas (credenciales de Resend/Telegram y webhook de n8n) — SOLO notstudio.
// El backend responde 404 a cualquier otro rol.

function CanalCard({ canal, icon: Icon, label, extraFields }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [activo, setActivo] = useState(false);
  const [config, setConfig] = useState({});
  const [secret, setSecret] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [testTo, setTestTo] = useState('');

  const cargar = async () => {
    setLoading(true);
    try {
      const res = await getCanalNotificacion(canal);
      setData(res.data);
      setActivo(res.data.activo);
      setConfig(res.data.config || {});
    } catch (err) {
      addToast(`No se pudo cargar ${label}: ${err.message}`, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guardar = async () => {
    setGuardando(true);
    try {
      await actualizarCanalNotificacion(canal, { activo, config, secret: secret.trim() || undefined });
      setSecret('');
      addToast(`${label} actualizado.`, { type: 'success' });
      cargar();
    } catch (err) {
      addToast(`No se pudo guardar: ${err.message}`, { type: 'error' });
    } finally {
      setGuardando(false);
    }
  };

  const probar = async () => {
    setProbando(true);
    try {
      await probarCanalNotificacion(canal, canal === 'resend' ? { to: testTo } : undefined);
      addToast(`Prueba de ${label} enviada correctamente.`, { type: 'success' });
    } catch (err) {
      addToast(`Falló la prueba de ${label}: ${err.message}`, { type: 'error' });
    } finally {
      setProbando(false);
    }
  };

  if (loading) {
    return (
      <div className="card p-5">
        <SkeletonText lines={4} />
      </div>
    );
  }

  return (
    <div className="card p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold text-gray-900 flex items-center gap-2">
          <Icon size={16} className="text-gray-400" /> {label}
        </h3>
        <label className="inline-flex items-center gap-2 text-xs text-gray-500">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="rounded border-gray-300" />
          Activo
        </label>
      </div>

      {extraFields.map((f) => (
        <div key={f.key}>
          <label className="label-field">{f.label}</label>
          <input
            className="input-field"
            value={config[f.key] || ''}
            onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
            placeholder={f.placeholder}
          />
        </div>
      ))}

      <div>
        <label className="label-field">{canal === 'resend' ? 'API Key' : 'Bot Token'}</label>
        <input
          type="password"
          className="input-field"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder={data?.secretMask ? `Actual: ${data.secretMask} — deja vacío para no cambiarla` : 'No configurada'}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
        <button className="btn-primary py-2 px-3 text-xs" onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
        {canal === 'resend' && (
          <input
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="correo para la prueba"
            className="input-field w-full sm:w-52 py-2 text-xs"
          />
        )}
        <button
          className="btn-secondary py-2 px-3 text-xs"
          onClick={probar}
          disabled={probando || (canal === 'resend' && !testTo)}
        >
          {probando ? <Loader2 size={13} className="animate-spin" /> : null} Probar conexión
        </button>
      </div>
    </div>
  );
}

// Modo híbrido: con una URL acá, el backend arma los correos/Telegram y n8n los entrega.
// Vacío = el backend envía directo con las credenciales de Resend/Telegram de abajo.

function WebhookN8nCard() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [envFallback, setEnvFallback] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    getWebhookNotificaciones()
      .then((res) => {
        setUrl(res.data?.url || '');
        setEnvFallback(Boolean(res.data?.envFallback));
      })
      .catch((err) => addToast(err.message || 'No se pudo cargar el webhook', { type: 'error' }))
      .finally(() => setLoading(false));
  }, []);

  async function guardar() {
    setGuardando(true);
    try {
      await guardarWebhookNotificaciones(url.trim());
      addToast(url.trim() ? 'Webhook guardado. Las notificaciones saldrán vía n8n.' : 'Webhook eliminado. El sistema enviará directo.', { type: 'success' });
    } catch (err) {
      addToast(err.message || 'No se pudo guardar el webhook', { type: 'error' });
    } finally {
      setGuardando(false);
    }
  }

  if (loading) {
    return (
      <div className="card p-5">
        <SkeletonText lines={3} />
      </div>
    );
  }

  return (
    <div className="card p-4 sm:p-5 space-y-4">
      <h3 className="font-heading font-semibold text-gray-900 flex items-center gap-2">
        <Webhook size={16} className="text-gray-400" /> Envío vía n8n (webhook)
      </h3>
      <p className="text-xs text-gray-500">
        Con una URL configurada, el sistema arma los correos y el mensaje de Telegram y n8n los entrega. Si se deja
        vacío, el sistema los envía directamente usando las credenciales de Resend y Telegram de más abajo.
      </p>
      <div>
        <label className="label-field">URL del webhook</label>
        <input
          className="input-field"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://infra-n8n.f8ihph.easypanel.host/webhook/condor-notificaciones"
        />
        {envFallback && !url.trim() && (
          <p className="text-xs text-amber-600 mt-1">
            Hay un webhook definido por variable de entorno en el servidor: seguirá activo aunque este campo quede vacío.
          </p>
        )}
      </div>
      <div className="pt-2 border-t border-gray-100">
        <button className="btn-primary py-2 px-3 text-xs" onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

export default function IntegracionesPage() {
  return (
    <div className="space-y-4">
      <WebhookN8nCard />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CanalCard
          canal="resend"
          icon={Mail}
          label="Resend (Email)"
          extraFields={[
            { key: 'fromEmail', label: 'Remitente (From)', placeholder: 'Condor Alcantarillados <notificaciones@noreply.notstudio.cl>' },
            { key: 'replyTo', label: 'Responder a (Reply-To)', placeholder: 'alcantarilladoscondor@gmail.com' },
          ]}
        />
        <CanalCard
          canal="telegram"
          icon={MessageCircle}
          label="Telegram"
          extraFields={[{ key: 'chatId', label: 'Chat ID del grupo', placeholder: '-1001234567890' }]}
        />
      </div>
    </div>
  );
}
