import { LogOut, Plus, ArrowLeft } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const logoUrl = import.meta.env.BASE_URL + 'condor-logo.png';

export default function Header({ user, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isDashboard = location.pathname === '/' || location.pathname === '';

  const displayName = user.nombre || user.email || '';

  return (
    <header className="bg-condor-900 text-white px-4 py-3 flex items-center justify-between shadow-lg sticky top-0 z-50">
      <div className="flex items-center gap-3 min-w-0">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <img
            src={logoUrl}
            alt="Condor 360"
            className="h-8 w-auto brightness-0 invert"
          />
          <p className="font-heading font-semibold text-sm leading-tight hidden sm:block truncate max-w-[140px]">
            Condor 360
          </p>
        </Link>
      </div>
      <div className="flex items-center gap-1.5 min-w-0">
        {isDashboard ? (
          <button
            onClick={() => navigate('/orden/nueva')}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-700 transition-colors text-sm text-white font-medium shrink-0"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Nueva Orden</span>
          </button>
        ) : (
          <Link
            to="/"
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors text-sm text-white/80 hover:text-white shrink-0"
          >
            <ArrowLeft size={16} />
            <span>Inicio</span>
          </Link>
        )}
        <span className="text-sm text-white/90 truncate max-w-[120px]" title={displayName}>
          {displayName}
        </span>
        <button
          onClick={onLogout}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors shrink-0"
          title="Cerrar sesión"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
