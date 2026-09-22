import { useEffect, useRef, useState } from 'react';
import { Search, LogOut, Menu, UserRound } from 'lucide-react';
import NotificationBell from './NotificationBell';

const ROL_LABEL = { admin: 'Administrador', oficina: 'Oficina', notstudio: 'NotStudio' };

/**
 * Buscador global (Ctrl+K). En F2c es solo el shell de UI —
 * la búsqueda real cruzando OT/RUT/nombre/teléfono llega en F5.
 */
export default function Topbar({ title, user, onLogout, onOpenMobileNav }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    const handleKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-gray-200 flex items-center gap-2 sm:gap-4 px-3 sm:px-4 md:px-6">
      <button
        onClick={onOpenMobileNav}
        className="lg:hidden h-10 w-10 -ml-1 shrink-0 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
        aria-label="Abrir menú"
      >
        <Menu size={22} />
      </button>
      <h1 className="font-heading font-semibold text-gray-900 text-base sm:text-lg min-w-0 truncate">{title}</h1>

      <div className="flex-1 max-w-md ml-2 hidden md:block">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar OT, RUT, cliente..."
            className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-16 py-2 text-sm
              placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-condor-400 focus:bg-white transition-all"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-400 bg-white border border-gray-200 rounded px-1.5 py-0.5">
            ⌘K
          </kbd>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-0.5 sm:gap-1 shrink-0">
        <NotificationBell />
        <span className="hidden sm:block h-8 w-px bg-gray-200 mx-2" aria-hidden="true" />
        <div className="flex items-center gap-2.5 pl-1" title={user?.nombre || user?.email}>
          <span className="h-9 w-9 rounded-full bg-condor-50 text-condor-700 ring-1 ring-condor-100 flex items-center justify-center shrink-0">
            <UserRound size={17} />
          </span>
          <span className="hidden lg:block leading-tight">
            <span className="block text-sm font-semibold text-gray-900 truncate max-w-[160px]">
              {user?.nombre || user?.email}
            </span>
            <span className="block text-xs text-gray-400">{ROL_LABEL[user?.rol] || user?.rol}</span>
          </span>
        </div>
        <button
          onClick={onLogout}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          className="ml-0.5 sm:ml-1 h-10 w-10 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
