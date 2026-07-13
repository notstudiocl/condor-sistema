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

// Solo los campos livianos que ConfirmacionPage realmente muestra — a propósito
// excluye fotosAntes/fotosDespues/firmaBase64 (pueden pesar varios MB en base64,
// no caben cómodos en sessionStorage junto con el resto del estado del wizard).
const CONFIRMACION_KEY = 'condor_confirmacion_state';

function guardarConfirmacion(orden) {
  try {
    const { fotosAntes, fotosDespues, firmaBase64, ...liviano } = orden;
    sessionStorage.setItem(CONFIRMACION_KEY, JSON.stringify(liviano));
  } catch { /* ignore quota errors — a lo sumo no sobrevive un F5 */ }
}

function cargarConfirmacion() {
  try {
    const raw = sessionStorage.getItem(CONFIRMACION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function limpiarConfirmacion() {
  sessionStorage.removeItem(CONFIRMACION_KEY);
}

// Poll de suscripción — antes solo se chequeaba una vez al montar la sesión, así que
// si NotStudio suspendía el servicio con la app ya abierta, el técnico podía llenar
// un wizard entero y recién enterarse (de forma confusa) al presionar Enviar (bug
// real corregido).
const SUBSCRIPTION_POLL_MS = 5 * 60 * 1000;

function AppRoutes({ user, onLogout }) {
  const navigate = useNavigate();
  const [ordenEnviada, setOrdenEnviada] = useState(() => cargarConfirmacion());
  const [pendingCount, setPendingCount] = useState(0);
  const [subscriptionActive, setSubscriptionActive] = useState(true);
  const [subscriptionMessage, setSubscriptionMessage] = useState(null);

  // Check subscription status — al montar y cada SUBSCRIPTION_POLL_MS mientras la
  // sesión sigue abierta.
  useEffect(() => {
    const check = () => {
      checkSubscription()
        .then(res => {
          if (res.success) {
            setSubscriptionActive(res.data.active);
            setSubscriptionMessage(res.data.message);
          }
        })
        .catch(() => setSubscriptionActive(true));
    };
    check();
    const interval = setInterval(check, SUBSCRIPTION_POLL_MS);
    return () => clearInterval(interval);
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
    guardarConfirmacion(orden);
    refreshPendingCount();
    navigate('/confirmacion');
  };

  const handleNuevaOrden = () => {
    setOrdenEnviada(null);
    limpiarConfirmacion();
    clearWizardSession();
    navigate('/orden/nueva');
  };

  const handleIrAlInicio = () => {
    setOrdenEnviada(null);
    limpiarConfirmacion();
    clearWizardSession();
    navigate('/');
  };

  const handleReintentar = () => {
    setOrdenEnviada(null);
    limpiarConfirmacion();
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
    // Un wizard sin enviar quedaba en sessionStorage después de cerrar sesión — en un
    // dispositivo compartido entre técnicos, el siguiente que iniciara sesión y
    // tocara "+Nueva Orden" desde el Header (a diferencia del botón del Dashboard,
    // que sí limpiaba) heredaba en silencio cliente/fotos del técnico anterior (bug
    // real corregido: fuga de datos entre técnicos).
    clearWizardSession();
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
