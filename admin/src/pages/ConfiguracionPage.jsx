import { useEffect, useState } from 'react';
import { ShieldAlert, Mail, MessageCircle, Power, Loader2 } from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';
import { SkeletonText } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import {
  getSubscriptionStatus,
  setSubscriptionStatus,
  listCanalesNotificacion,
  getCanalNotificacion,
  actualizarCanalNotificacion,
  probarCanalNotificacion,
} from '../utils/api';

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
    <div className="card p-5 space-y-4">
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
            className="input-field w-52 py-2 text-xs"
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

function KillSwitch() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [aplicando, setAplicando] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      const res = await getSubscriptionStatus();
      setStatus(res.data);
      setMensaje(res.data.message || '');
    } catch (err) {
      addToast(`No se pudo cargar el estado de suscripción: ${err.message}`, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const suspender = async () => {
    setAplicando(true);
    try {
      await setSubscriptionStatus(false, mensaje || 'Servicio suspendido temporalmente.');
      addToast('Suscripción suspendida. La app de terreno mostrará el mensaje a los técnicos.', { type: 'success' });
      setConfirmOpen(false);
      cargar();
    } catch (err) {
      addToast(`No se pudo suspender: ${err.message}`, { type: 'error' });
    } finally {
      setAplicando(false);
    }
  };

  const reactivar = async () => {
    setAplicando(true);
    try {
      await setSubscriptionStatus(true, null);
      addToast('Suscripción reactivada.', { type: 'success' });
      cargar();
    } catch (err) {
      addToast(`No se pudo reactivar: ${err.message}`, { type: 'error' });
    } finally {
      setAplicando(false);
    }
  };

  if (loading) {
    return (
      <div className="card p-5">
        <SkeletonText lines={3} />
      </div>
    );
  }

  return (
    <div className={`card p-5 space-y-4 ${!status.active ? 'border-red-300 ring-1 ring-red-200' : ''}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold text-gray-900 flex items-center gap-2">
          <Power size={16} className={status.active ? 'text-emerald-500' : 'text-red-500'} />
          Kill switch de suscripción
        </h3>
        <span
          className={`text-xs font-bold px-2.5 py-1 rounded-full ${
            status.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {status.active ? 'Servicio activo' : 'Servicio suspendido'}
        </span>
      </div>
      <p className="text-sm text-gray-500">
        Al suspender, la app de terreno bloquea la creación de nuevas órdenes y muestra el mensaje configurado a todos
        los técnicos. Úsalo solo si hay un problema de pago o contrato con Condor.
      </p>
      {!status.active && status.message && (
        <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-sm text-red-800">{status.message}</div>
      )}

      {status.active ? (
        <>
          <div>
            <label className="label-field">Mensaje que verán los técnicos al suspender</label>
            <input
              className="input-field"
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              placeholder="Servicio suspendido temporalmente. Contacta a la oficina."
            />
          </div>
          <button className="btn-accent py-2 px-3 text-xs" onClick={() => setConfirmOpen(true)}>
            <ShieldAlert size={14} /> Suspender servicio
          </button>
        </>
      ) : (
        <button className="btn-primary py-2 px-3 text-xs" onClick={reactivar} disabled={aplicando}>
          {aplicando ? 'Reactivando...' : 'Reactivar servicio'}
        </button>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={suspender}
        loading={aplicando}
        danger
        requireText="SUSPENDER"
        title="Suspender el servicio"
        message="Esto bloqueará la creación de nuevas órdenes en la app de terreno para todos los técnicos, de inmediato. Queda registrado en auditoría."
        confirmLabel="Suspender"
      />
    </div>
  );
}

export default function ConfiguracionPage() {
  return (
    <div className="space-y-4">
      <KillSwitch />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CanalCard
          canal="resend"
          icon={Mail}
          label="Resend (Email)"
          extraFields={[
            { key: 'fromEmail', label: 'Remitente (From)', placeholder: 'Notificaciones <no-reply@notstudio.cl>' },
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
