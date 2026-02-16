import { useState } from 'react';
import { Mail, KeyRound, Loader2 } from 'lucide-react';
import CondorLogo from '../components/CondorLogo';
import { login } from '../utils/api';

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Ingrese su email');
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
    <div className="min-h-screen bg-gradient-to-br from-condor-950 via-condor-900 to-condor-800 flex flex-col items-center justify-center p-6">
      <div className="mb-10">
        <CondorLogo size="lg" />
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white/10 backdrop-blur-sm rounded-2xl p-6 space-y-5"
      >
        <div>
          <h2 className="text-white font-heading font-semibold text-lg text-center">
            Iniciar Sesión
          </h2>
          <p className="text-white/60 text-sm text-center mt-1">
            Ingrese sus credenciales de técnico
          </p>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Mail
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-condor-400 text-sm"
              autoComplete="email"
            />
          </div>

          <div className="relative">
            <KeyRound
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
            />
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="PIN (4 dígitos)"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-condor-400 text-sm tracking-[0.3em]"
              autoComplete="current-password"
            />
          </div>
        </div>

        {error && (
          <p className="text-accent-400 text-sm text-center bg-accent-600/10 rounded-lg py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-condor-900 hover:bg-condor-800 disabled:opacity-50 text-white font-semibold rounded-xl py-3.5 text-sm transition-colors flex items-center justify-center gap-2"
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

      <div className="mt-8 text-center">
        <p className="text-white/30 text-xs">
          Condor Alcantarillados &copy; {new Date().getFullYear()}
        </p>
        <p className="text-white/20 text-[10px] mt-1">
          Soluciones Sanitarias &middot; Transportes de Residuos &middot; Hidrojet
        </p>
      </div>
    </div>
  );
}
