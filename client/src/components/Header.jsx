import { LogOut, User } from 'lucide-react';

export default function Header({ user, onLogout }) {
  return (
    <header className="bg-condor-900 text-white px-4 py-3 flex items-center justify-between shadow-lg sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center font-heading font-bold text-sm tracking-wider">
          CA
        </div>
        <div className="hidden sm:block">
          <p className="font-heading font-semibold text-sm leading-tight">
            Condor Alcantarillados
          </p>
          <p className="text-[10px] text-white/60">Ordenes de Trabajo</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <User size={16} className="text-white/70" />
          <span className="text-white/90">{user.nombre}</span>
        </div>
        <button
          onClick={onLogout}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          title="Cerrar sesión"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
