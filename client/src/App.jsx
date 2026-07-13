import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import OrdenWizardPage, { clearWizardSession } from './pages/OrdenWizardPage';
import DetalleOrdenPage from './pages/DetalleOrdenPage';
import ConfirmacionPage from './pages/ConfirmacionPage';
import Header from './components/Header';
import OfflineIndicator from './components/OfflineIndicator';
import { getPendingOrders } from './utils/offlineStorage';
import { syncEvents, resumeAfterReauth } from './utils/syncManager';
import { checkSubscription, authEvents } from './utils/api';

function AppRoutes({ user, onLogout }) {
  const navigate = useNavigate();
  const [ordenEnviada, setOrdenEnviada] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [subscriptionActive, setSubscriptionActive] = useState(true);
  const [subscriptionMessage, setSubscriptionMessage] = useState(null);

  // Check subscription status
  useEffect(() => {
    checkSubscription()
      .then(res => {
        if (res.success) {
          setSubscriptionActive(res.data.active);
          setSubscriptionMessage(res.data.message);
        }
      })
      .catch(() => setSubscriptionActive(true));
  }, []);

  // Check pending orders count
  const refreshPendingCount = useCallback(async () => {
    try {
      const orders = await getPendingOrders();
      setPendingCount(orders.length);
    } catch {
      setPendingCount(0);
    }
  }, []);

  // Único camino de sincronización: syncManager.js posee los listeners 'online'/'offline'
  // (registrados una vez desde OfflineIndicator). App.jsx solo escucha sus eventos de
  // estado para refrescar el badge de "N pendientes" del Dashboard — nunca hace su
  // propio fetch a /api/ordenes ni su propio listener 'online' (ese camino duplicado
  // quemaba reintentos sin pasar por auth/backoff y corría en paralelo al de syncManager).
  useEffect(() => {
    refreshPendingCount();
    const handleSyncStatus = () => refreshPendingCount();
    syncEvents.addEventListener('status', handleSyncStatus);
    return () => syncEvents.removeEventListener('status', handleSyncStatus);
  }, [refreshPendingCount]);

  const handleOrdenEnviada = (orden) => {
    setOrdenEnviada(orden);
    refreshPendingCount();
    navigate('/confirmacion');
  };

  const handleNuevaOrden = () => {
    setOrdenEnviada(null);
    clearWizardSession();
    navigate('/orden/nueva');
  };

  const handleIrAlInicio = () => {
    setOrdenEnviada(null);
    clearWizardSession();
    navigate('/');
  };

  const handleReintentar = () => {
    setOrdenEnviada(null);
    navigate('/orden/nueva');
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header user={user} onLogout={onLogout} subscriptionActive={subscriptionActive} />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<DashboardPage pendingCount={pendingCount} subscriptionActive={subscriptionActive} subscriptionMessage={subscriptionMessage} />} />
          <Route
            path="/orden/nueva"
            element={<OrdenWizardPage user={user} onOrdenEnviada={handleOrdenEnviada} subscriptionActive={subscriptionActive} />}
          />
          <Route
            path="/orden/:recordId/editar"
            element={<OrdenWizardPage user={user} onOrdenEnviada={handleOrdenEnviada} editMode subscriptionActive={subscriptionActive} />}
          />
          <Route path="/orden/:recordId" element={<DetalleOrdenPage subscriptionActive={subscriptionActive} subscriptionMessage={subscriptionMessage} />} />
          <Route
            path="/confirmacion"
            element={
              ordenEnviada ? (
                <ConfirmacionPage
                  orden={ordenEnviada}
                  onNuevaOrden={handleNuevaOrden}
                  onReintentar={handleReintentar}
                  onInicio={handleIrAlInicio}
                  subscriptionActive={subscriptionActive}
                />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('condor_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    if (user) {
      localStorage.setItem('condor_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('condor_user');
      localStorage.removeItem('condor_token');
    }
  }, [user]);

  // Interceptor global de 401/403 (api.js) — token vencido/inválido o empleado
  // desactivado. Limpia la sesión y fuerza la vuelta a LoginPage, PERO nunca toca
  // IndexedDB (cola offline) ni el sessionStorage del wizard en curso: al re-loguear,
  // el wizard restaura su paso/formulario/fotos desde sessionStorage tal como estaban.
  useEffect(() => {
    const handleAuthError = () => {
      setUser(null);
      setSessionExpired(true);
    };
    authEvents.addEventListener('auth-error', handleAuthError);
    return () => authEvents.removeEventListener('auth-error', handleAuthError);
  }, []);

  const handleLogin = (userData, token) => {
    setUser(userData);
    localStorage.setItem('condor_token', token);
    setSessionExpired(false);
    // Libera órdenes que habían quedado en 'auth-required' y las reintenta ya con el token nuevo.
    resumeAfterReauth();
  };

  const handleLogout = () => {
    setUser(null);
  };

  if (!user) {
    return (
      <HashRouter>
        <OfflineIndicator />
        <LoginPage onLogin={handleLogin} sessionExpiredMessage={sessionExpired ? 'Tu sesión expiró. Vuelve a iniciar sesión para continuar — tus órdenes pendientes están a salvo.' : null} />
      </HashRouter>
    );
  }

  return (
    <HashRouter>
      <OfflineIndicator />
      <AppRoutes user={user} onLogout={handleLogout} />
    </HashRouter>
  );
}
