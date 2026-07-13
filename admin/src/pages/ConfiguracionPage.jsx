import { useEffect, useRef, useState } from 'react';
import { Mail, MessageCircle, Loader2, Image as ImageIcon, Upload } from 'lucide-react';
import { SkeletonText } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import {
  listCanalesNotificacion,
  getCanalNotificacion,
  actualizarCanalNotificacion,
  probarCanalNotificacion,
  getLogoEmail,
  subirLogoEmail,
} from '../utils/api';

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function LogoEmailCard() {
  const { addToast } = useToast();
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [logoUrl, setLogoUrl] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [archivo, setArchivo] = useState(null);
  const [subiendo, setSubiendo] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      const res = await getLogoEmail();
      setLogoUrl(res.data.url);
    } catch (err) {
      addToast(`No se pudo cargar el logo actual: ${err.message}`, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const elegirArchivo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      addToast('Selecciona un archivo de imagen (PNG, JPG o WebP).', { type: 'error' });
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      addToast('La imagen supera el máximo de 2MB.', { type: 'error' });
      return;
    }
    setArchivo(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const subir = async () => {
    if (!archivo) return;
    setSubiendo(true);
    try {
      const imageBase64 = await fileToBase64(archivo);
      const res = await subirLogoEmail(imageBase64);
      setLogoUrl(res.data.url);
      setArchivo(null);
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      addToast('Logo actualizado. Se usará en los próximos correos enviados.', { type: 'success' });
    } catch (err) {
      addToast(`No se pudo subir el logo: ${err.message}`, { type: 'error' });
    } finally {
      setSubiendo(false);
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
    <div className="card p-5 space-y-4">
      <h3 className="font-heading font-semibold text-gray-900 flex items-center gap-2">
        <ImageIcon size={16} className="text-gray-400" /> Logo para correos
      </h3>
      <p className="text-sm text-gray-500">
        Se usa en el encabezado de los emails al cliente y el email interno de notificación de OT. Si no se sube
        ninguno, se usa el logo por defecto del sistema.
      </p>

      <div className="flex items-center gap-4">
        <div className="w-40 h-20 rounded-lg border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
          {previewUrl || logoUrl ? (
            <img src={previewUrl || logoUrl} alt="Logo actual" className="max-w-full max-h-full object-contain" />
          ) : (
            <span className="text-[11px] text-gray-400 text-center px-2">Sin logo personalizado</span>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={elegirArchivo}
            className="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-condor-50 file:text-condor-700 hover:file:bg-condor-100"
          />
          <button className="btn-primary py-2 px-3 text-xs" onClick={subir} disabled={!archivo || subiendo}>
            {subiendo ? 'Subiendo...' : <><Upload size={13} /> Subir</>}
          </button>
        </div>
      </div>
    </div>
  );
}

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

export default function ConfiguracionPage() {
  return (
    <div className="space-y-4">
      <LogoEmailCard />
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
