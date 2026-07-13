import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { getDashboardKpis, listClientesDuplicados } from '../utils/api';

export default function Layout({ user, onLogout, title, children }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [counts, setCounts] = useState({ porFacturar: 0, duplicados: 0 });

  // Pills del sidebar (órdenes por facturar, clientes duplicados) — reales, se
  // refrescan en cada cambio de pantalla para no quedar pegados tras una acción.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getDashboardKpis(), listClientesDuplicados()])
      .then(([kpis, dup]) => {
        if (cancelled) return;
        setCounts({
          porFacturar: kpis?.data?.porFacturar?.cantidad ?? 0,
          duplicados: dup?.data?.length ?? 0,
        });
      })
      .catch(() => {
        // Silencioso: los pills son un extra informativo, nunca deben romper el layout.
      });
    return () => {
      cancelled = true;
    };
  }, [title]);

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar user={user} counts={counts} mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar title={title} user={user} onLogout={onLogout} onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="flex-1 px-4 md:px-6 py-6 max-w-[1600px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
