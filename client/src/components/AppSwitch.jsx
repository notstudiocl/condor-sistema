import { Wrench, Building2 } from 'lucide-react';

// Switch Terreno | Oficina del login. Ambas apps viven bajo el mismo dominio (terreno en la
// raíz, oficina en {raíz}admin/), así que cambiar de app es un enlace normal — nadie tiene que
// memorizar dos links. Las apps no comparten código: hay una copia gemela en admin/.
const RAIZ = import.meta.env.BASE_URL.replace(/admin\/$/, '');
const APPS = [
  { key: 'terreno', label: 'Terreno', icon: Wrench, href: RAIZ },
  // En GitHub Pages (origen distinto) el panel no existe bajo la raíz: se apunta al dominio real.
  { key: 'oficina', label: 'Oficina', icon: Building2, href: import.meta.env.VITE_ADMIN_APP_URL || RAIZ + 'admin/' },
];
const ACTIVA = 'terreno';

export default function AppSwitch() {
  return (
    <nav aria-label="Cambiar de aplicación" className="inline-flex p-1 mb-8 rounded-full bg-gray-100/80 ring-1 ring-gray-200/70 backdrop-blur-sm">
      {APPS.map(({ key, label, icon: Icon, href }) =>
        key === ACTIVA ? (
          <span
            key={key}
            aria-current="page"
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 shadow-md shadow-blue-200"
          >
            <Icon size={15} /> {label}
          </span>
        ) : (
          <a
            key={key}
            href={href}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-medium text-gray-500 hover:text-blue-700 hover:bg-white/70 transition-colors"
          >
            <Icon size={15} /> {label}
          </a>
        )
      )}
    </nav>
  );
}
