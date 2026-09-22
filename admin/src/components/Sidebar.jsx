import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  UserCog,
  Wrench,
  Settings,
  History,
  SlidersHorizontal,
  Plug,
  Mail,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { hasRole } from '../utils/auth';
import { APP_VERSION } from '../version';

const logoUrl = import.meta.env.BASE_URL + 'condor-logo.png';
// La app de terreno vive en la raíz del mismo dominio (el panel cuelga de {raíz}admin/).
const TERRENO_URL = import.meta.env.BASE_URL.replace(/admin\/$/, '');

/**
 * `badge` es un número opcional mostrado como pill al lado del ítem
 * (ej. órdenes con "Facturacion pendiente", clientes con RUT duplicado).
 */
// Ítems principales (planos, como en H&A) + grupo desplegable "Configuración". Cada ítem declara
// `roles` opcional (mismo criterio que requireRole del backend: notstudio ⊇ admin). Si un rol no
// ve ningún hijo del grupo, el grupo entero se oculta (oficina).
function buildNav(counts) {
  return [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/ordenes', label: 'Órdenes', icon: ClipboardList, badge: counts.porFacturar, badgeTone: 'orange' },
    { to: '/clientes', label: 'Clientes', icon: Users, badge: counts.duplicados, badgeTone: 'red' },
    { to: '/servicios', label: 'Servicios', icon: Wrench },
  ];
}

const CONFIG_GROUP = {
  label: 'Configuración',
  icon: Settings,
  items: [
    { to: '/configuracion', label: 'General', icon: SlidersHorizontal, roles: ['notstudio'] },
    { to: '/usuarios', label: 'Usuarios', icon: UserCog, roles: ['admin'] },
    { to: '/integraciones', label: 'Integraciones', icon: Plug, roles: ['notstudio'] },
    { to: '/correos', label: 'Correos', icon: Mail, roles: ['admin'] },
    { to: '/auditoria', label: 'Auditoría', icon: History, roles: ['admin'] },
  ],
};

const STORAGE_KEY_CONFIG = 'condor-admin-nav-config';
const rutaEnGrupo = (pathname, items) => items.some(({ to }) => pathname === to || pathname.startsWith(`${to}/`));

const linkClass = ({ isActive }) =>
  `flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive ? 'bg-white text-condor-900 shadow-sm' : 'text-white/70 hover:bg-white/5 hover:text-white'
  }`;

function NavItem({ item, onNavigate, small = false }) {
  return (
    <NavLink to={item.to} end={item.end} onClick={onNavigate} className={linkClass}>
      <span className="flex items-center gap-2.5 min-w-0">
        <item.icon size={small ? 15 : 17} className="shrink-0" />
        <span className="truncate">{item.label}</span>
      </span>
      {!!item.badge && (
        <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${item.badgeTone === 'red' ? 'bg-red-500 text-white' : 'bg-orange-400 text-black'}`}>
          {item.badge}
        </span>
      )}
    </NavLink>
  );
}

function NavContent({ user, nav, onNavigate }) {
  const { pathname } = useLocation();
  const configItems = CONFIG_GROUP.items.filter((item) => hasRole(user, item.roles));
  const configActivo = rutaEnGrupo(pathname, configItems);
  const [configAbierto, setConfigAbierto] = useState(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (v === 'abierto') return true;
      if (v === 'cerrado') return false;
    } catch { /* localStorage no disponible */ }
    return false;
  });
  // Al navegar hacia una ruta hija, el grupo se despliega solo.
  useEffect(() => { if (configActivo) setConfigAbierto(true); }, [configActivo]);
  const toggleConfig = () => setConfigAbierto((prev) => {
    try { localStorage.setItem(STORAGE_KEY_CONFIG, prev ? 'cerrado' : 'abierto'); } catch { /* no crítico */ }
    return !prev;
  });

  return (
    <>
      <div className="flex items-center gap-2 px-5 h-16 border-b border-white/10 shrink-0">
        <img src={logoUrl} alt="Condor 360" className="h-7 w-auto brightness-0 invert" />
        <div className="min-w-0">
          <p className="font-heading font-semibold text-sm leading-tight truncate">Condor 360</p>
          <p className="text-[11px] text-white/50 leading-tight truncate">Panel de Oficina</p>
        </div>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-0.5">
        {nav.filter((item) => hasRole(user, item.roles)).map((item) => (
          <NavItem key={item.to} item={item} onNavigate={onNavigate} />
        ))}

        {configItems.length > 0 && (
          <div className="pt-2">
            <button
              type="button"
              onClick={toggleConfig}
              aria-expanded={configAbierto}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                configActivo && !configAbierto ? 'bg-white text-condor-900 shadow-sm' : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <CONFIG_GROUP.icon size={17} />
              <span className="flex-1 text-left">{CONFIG_GROUP.label}</span>
              {configAbierto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>
            {configAbierto && (
              <div className="mt-0.5 ml-4 pl-2 border-l border-white/10 space-y-0.5">
                {configItems.map((item) => (
                  <NavItem key={item.to} item={item} onNavigate={onNavigate} small />
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      <div className="px-3 pt-3 pb-4 shrink-0">
        <a
          href={TERRENO_URL}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-white/80 hover:bg-white/5 hover:text-white transition-colors"
        >
          <Wrench size={17} className="shrink-0 text-accent-500" />
          Ir a la app de terreno
        </a>
        {/* En celular horizontal (alto ≤ 480px) los créditos se ocultan para dejar espacio al menú */}
        <div className="mt-2 pt-3 px-3 border-t border-white/10 text-[11px] leading-relaxed text-white/35 [@media(max-height:480px)]:hidden">
          <p>Condor Alcantarillados</p>
          <p>
            Sistema integral desarrollado por{' '}
            <a href="https://notstudio.cl" target="_blank" rel="noopener noreferrer" className="underline hover:text-white/60">
              NotStudio.cl
            </a>{' '}
            &middot; v{APP_VERSION}
          </p>
        </div>
      </div>
    </>
  );
}

export default function Sidebar({ user, counts = {}, mobileOpen = false, onCloseMobile }) {
  const nav = buildNav({ porFacturar: counts.porFacturar ?? 0, duplicados: counts.duplicados ?? 0 });

  return (
    <>
      {/* Desktop (lg+): rail fija. Bajo 1024px (celular vertical/horizontal, tablet vertical)
          se usa el drawer para que el contenido tenga todo el ancho. */}
      <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 bg-condor-900 text-white h-screen sticky top-0">
        <NavContent user={user} nav={nav} />
      </aside>

      {/* Mobile: drawer superpuesto (el <nav> interno tiene scroll propio para pantallas bajas) */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-gray-900/50" onClick={onCloseMobile} />
          <aside className="relative flex flex-col w-64 max-w-[85vw] bg-condor-900 text-white h-full shadow-xl">
            <NavContent user={user} nav={nav} onNavigate={onCloseMobile} />
          </aside>
        </div>
      )}
    </>
  );
}
