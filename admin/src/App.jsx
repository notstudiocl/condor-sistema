import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import OrdenesListPage from './pages/OrdenesListPage';
import OrdenDetallePage from './pages/OrdenDetallePage';
import ClientesPage from './pages/ClientesPage';
import ServiciosPage from './pages/ServiciosPage';
import CorreosPage from './pages/CorreosPage';
import ErrorBoundary from './components/ErrorBoundary';
import IntegracionesPage from './pages/IntegracionesPage';
import ConfiguracionPage from './pages/ConfiguracionPage';
import UsuariosPage from './pages/UsuariosPage';
import InvitacionPage from './pages/InvitacionPage';
import AuditoriaPage from './pages/AuditoriaPage';
import ProtectedRoute from './components/ProtectedRoute';
import { ToastProvider } from './components/Toast';
import { getSession, saveSession, clearSession } from './utils/auth';
import { setUnauthorizedHandler } from './utils/api';

function AppRoutes({ user, onLogin, onLogout }) {
  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <LoginPage onLogin={onLogin} />}
      />
      {/* Pública: quien acepta una invitación todavía no tiene sesión */}
      <Route path="/invitacion/:token" element={<InvitacionPage onLogin={onLogin} />} />
      <Route
        path="/"
        element={
          <ProtectedRoute user={user} onLogout={onLogout} title="Dashboard">
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ordenes"
        element={
          <ProtectedRoute user={user} onLogout={onLogout} title="Órdenes">
            <OrdenesListPage />
          </ProtectedRoute>
        }
      />
      {/* Antes de /ordenes/:id: si no, react-router matcheara "nueva" como el :id dinámico. */}
      <Route
        path="/ordenes/nueva"
        element={
          <ProtectedRoute user={user} onLogout={onLogout} title="Nueva orden">
            <OrdenDetallePage esNuevaOrden />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ordenes/:id"
        element={
          <ProtectedRoute user={user} onLogout={onLogout} title="Detalle de orden">
            <OrdenDetallePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/clientes"
        element={
          <ProtectedRoute user={user} onLogout={onLogout} title="Clientes">
            <ClientesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/clientes/:id"
        element={
          <ProtectedRoute user={user} onLogout={onLogout} title="Clientes">
            <ClientesPage />
          </ProtectedRoute>
        }
      />
      {/* La gestión de técnicos se unificó con la de oficina en /usuarios */}
      <Route path="/personal" element={<Navigate to="/usuarios" replace />} />
      <Route
        path="/servicios"
        element={
          <ProtectedRoute user={user} onLogout={onLogout} title="Servicios">
            <ServiciosPage />
          </ProtectedRoute>
        }
      />
      <Route path="/notificaciones" element={<Navigate to="/correos" replace />} />
      <Route
        path="/correos"
        element={
          <ProtectedRoute user={user} onLogout={onLogout} title="Correos" roles={['admin']}>
            <CorreosPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/integraciones"
        element={
          <ProtectedRoute user={user} onLogout={onLogout} title="Integraciones" roles={['notstudio']}>
            <IntegracionesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/configuracion"
        element={
          <ProtectedRoute user={user} onLogout={onLogout} title="Configuración general" roles={['notstudio']}>
            <ConfiguracionPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/usuarios"
        element={
          <ProtectedRoute user={user} onLogout={onLogout} title="Usuarios" roles={['admin']}>
            <UsuariosPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/usuarios/:id"
        element={
          <ProtectedRoute user={user} onLogout={onLogout} title="Usuarios" roles={['admin']}>
            <UsuariosPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/auditoria"
        element={
          <ProtectedRoute user={user} onLogout={onLogout} title="Auditoría" roles={['admin']}>
            <AuditoriaPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
    </Routes>
  );
}

export default function App() {
  const [user, setUser] = useState(() => getSession()?.user || null);

  const handleLogout = () => {
    clearSession();
    setUser(null);
  };

  // Interceptor global de 401: cualquier fetch de utils/api.js que reciba 401
  // limpia la sesión de React (no solo localStorage) y HashRouter manda a /login.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
  }, []);

  const handleLogin = (userData, token) => {
    saveSession(token, userData);
    setUser(userData);
  };

  return (
    <ErrorBoundary>
      <ToastProvider>
        <HashRouter>
          <AppRoutes user={user} onLogin={handleLogin} onLogout={handleLogout} />
        </HashRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}
