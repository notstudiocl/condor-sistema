import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import OrdenesListPage from './pages/OrdenesListPage';
import OrdenDetallePage from './pages/OrdenDetallePage';
import ClientesPage from './pages/ClientesPage';
import PersonalPage from './pages/PersonalPage';
import ServiciosPage from './pages/ServiciosPage';
import NotificacionesPage from './pages/NotificacionesPage';
import ConfiguracionPage from './pages/ConfiguracionPage';
import UsuariosAdminPage from './pages/UsuariosAdminPage';
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
      <Route
        path="/personal"
        element={
          <ProtectedRoute user={user} onLogout={onLogout} title="Personal">
            <PersonalPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/servicios"
        element={
          <ProtectedRoute user={user} onLogout={onLogout} title="Servicios">
            <ServiciosPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/notificaciones"
        element={
          <ProtectedRoute user={user} onLogout={onLogout} title="Notificaciones">
            <NotificacionesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/configuracion"
        element={
          <ProtectedRoute user={user} onLogout={onLogout} title="Configuración" roles={['admin']}>
            <ConfiguracionPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/usuarios"
        element={
          <ProtectedRoute user={user} onLogout={onLogout} title="Usuarios" roles={['admin']}>
            <UsuariosAdminPage />
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
    <ToastProvider>
      <HashRouter>
        <AppRoutes user={user} onLogin={handleLogin} onLogout={handleLogout} />
      </HashRouter>
    </ToastProvider>
  );
}
