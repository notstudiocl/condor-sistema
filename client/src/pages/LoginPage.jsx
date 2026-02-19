import { useState } from 'react';
import { User, KeyRound, Loader2 } from 'lucide-react';
import { login } from '../utils/api';
import AppFooter from '../components/AppFooter';

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
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      <div className="mb-6">
        <img
          src={logoUrl}
          alt="Condor 360"
          className="mx-auto"
          style={{ maxWidth: 280 }}
        />
      </div>

      <p className="text-gray-400 text-xs text-center mb-8">
        Soluciones Sanitarias &middot; Transportes de Residuos &middot; Hidrojet
      </p>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl p-6 space-y-5 shadow-sm"
      >
        <div>
          <h2 className="text-gray-900 font-heading font-semibold text-lg text-center">
            Iniciar Sesión
          </h2>
          <p className="text-gray-500 text-sm text-center mt-1">
            Ingrese sus credenciales de técnico
          </p>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <User
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="Correo o usuario"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-condor-900 focus:border-condor-900 text-sm"
              autoComplete="username"
            />
          </div>

          <div className="relative">
            <KeyRound
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="PIN (4 dígitos)"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-condor-900 focus:border-condor-900 text-sm tracking-[0.3em]"
              autoComplete="current-password"
            />
          </div>
        </div>

        {error && (
          <p className="text-accent-600 text-sm text-center bg-accent-50 rounded-lg py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-accent-600 hover:bg-accent-700 disabled:opacity-50 text-white font-semibold rounded-xl py-3.5 text-sm transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Ingresando...
            </>
          ) : (
            'Ingresar'
          )}
        </button>
      </form>

      <AppFooter />
    </div>
  );
}
