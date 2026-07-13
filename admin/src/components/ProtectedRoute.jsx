import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { hasRole } from '../utils/auth';
import Layout from './Layout';

/**
 * Protege una ruta: sin sesión → /login (conservando a dónde iba).
 * Con sesión pero sin rol suficiente → se queda en el layout con un aviso
 * en vez de redirigir (evita loops y deja claro que el backend igual valida
 * con requireRole aunque alguien fuerce la URL).
 */
export default function ProtectedRoute({ user, onLogout, title, roles, children }) {
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (roles && !hasRole(user, roles)) {
    return (
      <Layout user={user} onLogout={onLogout} title={title}>
        <div className="card p-10 flex flex-col items-center text-center max-w-md mx-auto mt-10">
          <div className="rounded-full bg-red-100 text-red-600 p-3 mb-4">
            <ShieldAlert size={24} />
          </div>
          <p className="font-heading font-semibold text-gray-900">Acceso restringido</p>
          <p className="text-sm text-gray-500 mt-1.5">
            Tu rol (<span className="font-medium">{user.rol}</span>) no tiene permiso para ver esta sección.
            Pídele a un administrador que te lo habilite.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout user={user} onLogout={onLogout} title={title}>
      {children}
    </Layout>
  );
}
