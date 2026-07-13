import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  UserCog,
  Wrench,
  Bell,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { hasRole } from '../utils/auth';

const logoUrl = import.meta.env.BASE_URL + 'condor-logo.png';

/**
 * `badge` es un número opcional mostrado como pill al lado del ítem
 * (ej. órdenes con "Facturacion pendiente", clientes con RUT duplicado).
 */
function buildNav(counts) {
  return [
    {
      section: null,
      items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }],
    },
    {
      section: 'Operación',
      items: [
        { to: '/ordenes', label: 'Órdenes', icon: ClipboardList, badge: counts.porFacturar, badgeTone: 'orange' },
        { to: '/clientes', label: 'Clientes', icon: Users, badge: counts.duplicados, badgeTone: 'red' },
        { to: '/personal', label: 'Personal', icon: UserCog },
        { to: '/servicios', label: 'Servicios', icon: Wrench },
      ],
    },
    {
      section: 'Sistema',
      items: [
        { to: '/notificaciones', label: 'Notificaciones', icon: Bell },
        { to: '/configuracion', label: 'Configuración', icon: Settings, roles: ['admin'] },
        { to: '/usuarios', label: 'Usuarios', icon: ShieldCheck, roles: ['admin'] },
      ],
    },
  ];
}

function NavContent({ user, nav, onNavigate }) {
  return (
    <>
      <div className="flex items-center gap-2 px-5 h-16 border-b border-white/10 shrink-0">
        <img src={logoUrl} alt="Condor 360" className="h-7 w-auto brightness-0 invert" />
        <div className="min-w-0">
          <p className="font-heading font-semibold text-sm leading-tight truncate">Condor 360</p>
          <p className="text-[11px] text-white/50 leading-tight truncate">Panel de Oficina</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {nav.map((group, gi) => {
          const items = group.items.filter((item) => hasRole(user, item.roles));
          if (items.length === 0) return null;
          return (
            <div key={gi}>
              {group.section && (
                <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-white/35">
                  {group.section}
                </p>
              )}
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
                      }`
                    }
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <item.icon size={17} className="shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {!!item.badge && (
                      <span
                        className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          item.badgeTone === 'red' ? 'bg-red-500 text-white' : 'bg-orange-400 text-black'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-white/10 shrink-0">
        <p className="px-3 text-[11px] text-white/35">Condor 360 &middot; Admin</p>
      </div>
    </>
  );
}

export default function Sidebar({ user, counts = {}, mobileOpen = false, onCloseMobile }) {
  const nav = buildNav({ porFacturar: counts.porFacturar ?? 0, duplicados: counts.duplicados ?? 0 });

  return (
    <>
      {/* Desktop: rail fija (panel es escritorio-first) */}
      <aside className="hidden md:flex md:flex-col w-60 shrink-0 bg-condor-900 text-white h-screen sticky top-0">
        <NavContent user={user} nav={nav} />
      </aside>

      {/* Mobile: drawer superpuesto */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-gray-900/50" onClick={onCloseMobile} />
          <aside className="relative flex flex-col w-64 bg-condor-900 text-white h-full shadow-xl">
            <NavContent user={user} nav={nav} onNavigate={onCloseMobile} />
          </aside>
        </div>
      )}
    </>
  );
}
