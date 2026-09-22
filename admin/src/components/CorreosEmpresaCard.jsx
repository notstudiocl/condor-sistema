import { useEffect, useState } from 'react';
import { Reply, Inbox } from 'lucide-react';
import { SkeletonText } from './Skeleton';
import { useToast } from './Toast';
import { getCorreosEmpresa, guardarCorreosEmpresa } from '../utils/api';

// Correos de la empresa (rol admin): el "Responder a" de TODO correo que sale del sistema
// (órdenes, invitaciones, contraseñas, pruebas) y el correo interno que recibe copia de cada
// orden. El remitente técnico sigue siendo el dominio verificado de NotStudio.
export default function CorreosEmpresaCard() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ email_reply_to: '', email_interno: '' });
  const [defaults, setDefaults] = useState({});
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    getCorreosEmpresa()
      .then((r) => { setForm({ email_reply_to: r.data.email_reply_to || '', email_interno: r.data.email_interno || '' }); setDefaults(r.data.defaults || {}); })
      .catch((err) => addToast(err.message, { type: 'error' }))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = async () => {
    setGuardando(true);
    try {
      await guardarCorreosEmpresa(form);
      addToast('Correos guardados. Aplican a los próximos envíos.', { type: 'success' });
    } catch (err) {
      addToast(err.message, { type: 'error' });
    } finally {
      setGuardando(false);
    }
  };

  if (loading) return <div className="card p-5"><SkeletonText lines={3} /></div>;

  return (
    <div className="card p-4 sm:p-5 space-y-4">
      <h3 className="font-heading font-semibold text-gray-900 flex items-center gap-2"><Reply size={16} className="text-gray-400" /> Correos de la empresa</h3>
      <p className="text-xs text-gray-500">
        Los correos salen desde <span className="font-mono">notificaciones@noreply.notstudio.cl</span>, pero cuando un cliente responde, la
        respuesta llega al correo de abajo. Aplica a todos los correos del sistema: órdenes, invitaciones al panel y contraseñas.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label-field">Responder a (correo de la empresa)</label>
          <input className="input-field" type="email" value={form.email_reply_to} onChange={(e) => setForm((f) => ({ ...f, email_reply_to: e.target.value }))} placeholder={defaults.email_reply_to || ''} />
        </div>
        <div>
          <label className="label-field flex items-center gap-1"><Inbox size={12} /> Copia interna de cada orden</label>
          <input className="input-field" type="email" value={form.email_interno} onChange={(e) => setForm((f) => ({ ...f, email_interno: e.target.value }))} placeholder={defaults.email_interno || ''} />
        </div>
      </div>
      <p className="text-xs text-gray-400">Vacío = se usa el correo por defecto de Condor ({defaults.email_reply_to}).</p>
      <div className="pt-2 border-t border-gray-100">
        <button className="btn-primary py-2 px-3 text-xs" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
      </div>
    </div>
  );
}
