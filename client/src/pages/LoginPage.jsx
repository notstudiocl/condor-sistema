import { useState } from 'react';
import { login } from '../utils/api';
import { APP_VERSION } from '../version';

const logoUrl = import.meta.env.BASE_URL + 'condor-logo.png';

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Ingrese su usuario');
      return;
    }
    if (pin.length !== 4) {
      setError('El PIN debe tener 4 dígitos');
      return;
    }

    setLoading(true);
    try {
      const res = await login(email.trim().toLowerCase(), pin);
      onLogin(res.data.user, res.data.token);
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 relative overflow-hidden">

      {/* Fondo decorativo animado */}
      <div className="absolute top-[-10%] right-[-5%] w-72 h-72 bg-blue-100 rounded-full blur-3xl opacity-60 animate-pulse" style={{ animationDuration: '4s' }}></div>
      <div className="absolute bottom-[-15%] left-[-10%] w-96 h-96 bg-blue-50 rounded-full blur-3xl opacity-50 animate-pulse" style={{ animationDuration: '6s' }}></div>
      <div className="absolute top-[40%] left-[60%] w-48 h-48 bg-blue-200 rounded-full blur-3xl opacity-30 animate-pulse" style={{ animationDuration: '5s' }}></div>

      {/* Línea decorativa superior */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent"></div>

      {/* Contenido principal */}
      <div className="relative z-10 w-full max-w-sm flex flex-col items-center">

        <img
          src={logoUrl}
          alt="Condor 360"
          className="h-20 object-contain mb-3"
        />
        <p className="text-blue-600 text-sm font-medium tracking-widest uppercase mb-10">Sistema de Órdenes de Trabajo</p>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="w-full space-y-5">

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Usuario</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-300 group-focus-within:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Correo o nombre de usuario"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-blue-500 focus:bg-white focus:ring-0 outline-none transition-all duration-300 text-gray-800 placeholder-gray-300"
                autoComplete="username"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Contraseña</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-300 group-focus-within:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-blue-500 focus:bg-white focus:ring-0 outline-none transition-all duration-300 text-gray-800 placeholder-gray-300 tracking-[0.3em]"
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
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                Ingresando...
              </span>
            ) : 'Ingresar'}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-12 text-center text-xs text-gray-300 space-y-1">
          <p>Condor 360 &copy; {new Date().getFullYear()} &middot; v{APP_VERSION}</p>
          <p>
            Sistema integral desarrollado por{' '}
            <a href="https://notstudio.cl" target="_blank" rel="noopener noreferrer" className="text-gray-400 underline hover:text-blue-500 transition-colors">
              NotStudio.cl
            </a>
          </p>
        </div>

      </div>
    </div>
  );
}
