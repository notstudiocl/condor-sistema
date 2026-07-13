import { useEffect, useRef, useState } from 'react';
import { Search, LogOut, ChevronDown, Menu } from 'lucide-react';
import { iniciales } from '../utils/format';
import NotificationBell from './NotificationBell';

const ROL_LABEL = { admin: 'Administrador', oficina: 'Oficina' };

/**
 * Buscador global (Ctrl+K). En F2c es solo el shell de UI —
 * la búsqueda real cruzando OT/RUT/nombre/teléfono llega en F5.
 */
export default function Topbar({ title, user, onLogout, onOpenMobileNav }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const menuRef = useRef(null);

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

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-gray-200 flex items-center gap-4 px-4 md:px-6">
      <button
        onClick={onOpenMobileNav}
        className="md:hidden p-2 -ml-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
        aria-label="Abrir menú"
      >
        <Menu size={20} />
      </button>
      <h1 className="font-heading font-semibold text-gray-900 text-lg shrink-0 truncate">{title}</h1>

      <div className="flex-1 max-w-md ml-2 hidden sm:block">
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

      <div className="ml-auto flex items-center gap-1.5">
        <NotificationBell />
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2.5 pl-1.5 pr-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <span className="h-8 w-8 rounded-full bg-condor-900 text-white text-xs font-bold flex items-center justify-center shrink-0">
              {iniciales(user?.nombre || user?.email)}
            </span>
            <span className="hidden md:block text-left leading-tight">
              <span className="block text-sm font-medium text-gray-800 truncate max-w-[140px]">
                {user?.nombre || user?.email}
              </span>
              <span className="block text-xs text-gray-400">{ROL_LABEL[user?.rol] || user?.rol}</span>
            </span>
            <ChevronDown size={15} className="text-gray-400 hidden md:block" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 z-40">
              <div className="px-3 py-2 border-b border-gray-100 md:hidden">
                <p className="text-sm font-medium text-gray-800 truncate">{user?.nombre || user?.email}</p>
                <p className="text-xs text-gray-400">{ROL_LABEL[user?.rol] || user?.rol}</p>
              </div>
              <button
                onClick={onLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut size={15} />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
