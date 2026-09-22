import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Lock, Loader2, AlertTriangle, ShieldCheck } from 'lucide-react';
import AppSwitch from '../components/AppSwitch';
import { validarInvitacion, aceptarInvitacion } from '../utils/api';
import { APP_VERSION } from '../version';

const logoUrl = import.meta.env.BASE_URL + 'condor-logo.png';
const MIN = 8;

// Página PÚBLICA #/invitacion/:token — quien recibe la invitación al panel todavía no tiene
// sesión. Mismo look que LoginPage. Al aceptar, el backend devuelve la sesión iniciada.
export default function InvitacionPage({ onLogin }) {
  const { token } = useParams();
  const navigate = useNavigate();
  const [inv, setInv] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorToken, setErrorToken] = useState('');
  const [password, setPassword] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    validarInvitacion(token)
      .then((res) => setInv(res.data))
      .catch((err) => setErrorToken(err.message))
      .finally(() => setCargando(false));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < MIN) return setError(`La contraseña debe tener al menos ${MIN} caracteres`);
    if (password !== repetir) return setError('Las contraseñas no coinciden');
    setEnviando(true);
    try {
      const res = await aceptarInvitacion(token, password);
      onLogin(res.data.user, res.data.token);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-5%] w-72 h-72 bg-blue-100 rounded-full blur-3xl opacity-60" />
      <div className="absolute bottom-[-15%] left-[-10%] w-96 h-96 bg-blue-50 rounded-full blur-3xl opacity-50" />
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent" />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center">
        <AppSwitch />
        <img src={logoUrl} alt="Condor 360" className="h-20 object-contain mb-3" />
        <p className="text-blue-600 text-sm font-medium tracking-widest uppercase mb-8">Panel de Oficina</p>

        {cargando ? (
          <Loader2 className="animate-spin text-blue-500" />
        ) : errorToken ? (
          <div className="w-full bg-red-50 border border-red-100 rounded-2xl p-5 text-center">
            <AlertTriangle className="mx-auto text-red-500 mb-2" size={22} />
            <p className="text-sm text-red-700">{errorToken}</p>
            <a href="#/login" className="inline-block mt-4 text-sm text-blue-600 hover:underline">Ir al inicio de sesión</a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="w-full space-y-5">
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-gray-700">
              <p className="flex items-center gap-2 font-semibold text-gray-900"><ShieldCheck size={16} className="text-blue-600" /> Hola, {inv.nombre}</p>
              <p className="mt-1">Define tu contraseña para entrar al panel con <b>{inv.email}</b>.</p>
            </div>
            {[['Nueva contraseña', password, setPassword], ['Repetir contraseña', repetir, setRepetir]].map(([label, val, set]) => (
              <div key={label}>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{label}</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><Lock size={18} className="text-blue-300 group-focus-within:text-blue-500 transition-colors" /></div>
                  <input type="password" value={val} onChange={(e) => set(e.target.value)} minLength={MIN} required autoComplete="new-password"
                    className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-blue-500 focus:bg-white focus:ring-0 outline-none transition-all duration-300 text-gray-800 placeholder-gray-300" placeholder="••••••••" />
                </div>
              </div>
            ))}
            {error && <p className="text-sm text-red-600 text-center">{error}</p>}
            <button type="submit" disabled={enviando}
              className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-200 hover:from-blue-700 hover:to-blue-800 active:scale-[0.98] transition-all duration-300 disabled:opacity-50">
              {enviando ? 'Guardando...' : 'Guardar y entrar'}
            </button>
          </form>
        )}

        <div className="mt-10 text-center text-xs text-gray-400 space-y-1">
          <p>Condor 360 &copy; {new Date().getFullYear()} &middot; Panel v{APP_VERSION}</p>
          <p>Sistema integral desarrollado por <a href="https://notstudio.cl" target="_blank" rel="noopener noreferrer" className="underline">NotStudio.cl</a></p>
        </div>
      </div>
    </div>
  );
}
