import { useState } from 'react';
import { Mail, Lock, Loader2 } from 'lucide-react';
import { loginAdmin } from '../utils/api';

const logoUrl = import.meta.env.BASE_URL + 'condor-logo.png';
const APP_VERSION = '1.0.0';

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Ingresa tu correo');
      return;
    }
    if (!password) {
      setError('Ingresa tu contraseña');
      return;
    }

    setLoading(true);
    try {
      const res = await loginAdmin(email.trim().toLowerCase(), password);
      onLogin(res.data.user, res.data.token);
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Fondo decorativo animado — mismas burbujas azules que la app de terreno */}
      <div
        className="absolute top-[-10%] right-[-5%] w-72 h-72 bg-blue-100 rounded-full blur-3xl opacity-60 animate-pulse"
        style={{ animationDuration: '4s' }}
      />
      <div
        className="absolute bottom-[-15%] left-[-10%] w-96 h-96 bg-blue-50 rounded-full blur-3xl opacity-50 animate-pulse"
        style={{ animationDuration: '6s' }}
      />
      <div
        className="absolute top-[40%] left-[60%] w-48 h-48 bg-blue-200 rounded-full blur-3xl opacity-30 animate-pulse"
        style={{ animationDuration: '5s' }}
      />

      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent" />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center">
        <img src={logoUrl} alt="Condor 360" className="h-20 object-contain mb-3" />
        <p className="text-blue-600 text-sm font-medium tracking-widest uppercase mb-10">Panel de Oficina</p>

        <form onSubmit={handleSubmit} className="w-full space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Correo
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Mail size={18} className="text-blue-300 group-focus-within:text-blue-500 transition-colors" />
              </div>
              <input
                type="email"
                placeholder="oficina@condoralcantarillados.cl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-blue-500 focus:bg-white focus:ring-0 outline-none transition-all duration-300 text-gray-800 placeholder-gray-300"
                autoComplete="username"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Contraseña
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock size={18} className="text-blue-300 group-focus-within:text-blue-500 transition-colors" />
              </div>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-blue-500 focus:bg-white focus:ring-0 outline-none transition-all duration-300 text-gray-800 placeholder-gray-300"
                autoComplete="current-password"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-red-500 text-sm">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-200 hover:shadow-xl hover:shadow-blue-300 hover:from-blue-700 hover:to-blue-800 active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={18} className="animate-spin" />
                Ingresando...
              </span>
            ) : (
              'Ingresar'
            )}
          </button>
        </form>

        <div className="mt-12 text-center text-xs text-gray-300 space-y-1">
          <p>Condor 360 &copy; {new Date().getFullYear()} &middot; Panel v{APP_VERSION}</p>
          <p>
            Sistema integral desarrollado por{' '}
            <a
              href="https://notstudio.cl"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 underline hover:text-blue-500 transition-colors"
            >
              NotStudio.cl
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
