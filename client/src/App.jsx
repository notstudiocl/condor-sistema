import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import OrdenWizardPage, { clearWizardSession } from './pages/OrdenWizardPage';
import DetalleOrdenPage from './pages/DetalleOrdenPage';
import ConfirmacionPage from './pages/ConfirmacionPage';
import Header from './components/Header';
import OfflineIndicator from './components/OfflineIndicator';
import { getPendingOrders, updateOrderStatus } from './utils/offlineStorage';

function AppRoutes({ user, onLogout }) {
  const navigate = useNavigate();
  const [ordenEnviada, setOrdenEnviada] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);

  // Check pending orders count
  const refreshPendingCount = useCallback(async () => {
    try {
      const orders = await getPendingOrders();
      setPendingCount(orders.length);
    } catch {
      setPendingCount(0);
    }
  }, []);

  // Retry pending offline orders when back online
  const retryPendingOrders = useCallback(async () => {
    const orders = await getPendingOrders();
    if (orders.length === 0) return;

    const baseUrl = (import.meta.env.VITE_API_URL || 'https://clientes-condor-api.f8ihph.easypanel.host/api').replace(/\/api\/?$/, '');

    for (const order of orders) {
      try {
        const res = await fetch(`${baseUrl}/api/ordenes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(order.data),
        });
        const result = await res.json();
        if (result.success || result.data?.duplicate) {
          await updateOrderStatus(order.id, 'sent');
        } else {
          await updateOrderStatus(order.id, 'error', (order.retries || 0) + 1);
        }
      } catch {
        await updateOrderStatus(order.id, 'error', (order.retries || 0) + 1);
      }
    }
    refreshPendingCount();
  }, [refreshPendingCount]);

  useEffect(() => {
    refreshPendingCount();
    const handleOnline = () => retryPendingOrders();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [retryPendingOrders, refreshPendingCount]);

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
      <Header user={user} onLogout={onLogout} />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<DashboardPage pendingCount={pendingCount} />} />
          <Route
            path="/orden/nueva"
            element={<OrdenWizardPage user={user} onOrdenEnviada={handleOrdenEnviada} />}
          />
          <Route
            path="/orden/:recordId/editar"
            element={<OrdenWizardPage user={user} onOrdenEnviada={handleOrdenEnviada} editMode />}
          />
          <Route path="/orden/:recordId" element={<DetalleOrdenPage />} />
          <Route
            path="/confirmacion"
            element={
              ordenEnviada ? (
                <ConfirmacionPage
                  orden={ordenEnviada}
                  onNuevaOrden={handleNuevaOrden}
                  onReintentar={handleReintentar}
                  onInicio={handleIrAlInicio}
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

  useEffect(() => {
    if (user) {
      localStorage.setItem('condor_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('condor_user');
      localStorage.removeItem('condor_token');
    }
  }, [user]);

  const handleLogin = (userData, token) => {
    setUser(userData);
    localStorage.setItem('condor_token', token);
  };

  const handleLogout = () => {
    setUser(null);
  };

  if (!user) {
    return (
      <HashRouter>
        <OfflineIndicator />
        <LoginPage onLogin={handleLogin} />
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
