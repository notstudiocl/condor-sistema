import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import OrdenWizardPage from './pages/OrdenWizardPage';
import DetalleOrdenPage from './pages/DetalleOrdenPage';
import ConfirmacionPage from './pages/ConfirmacionPage';
import Header from './components/Header';
import OfflineIndicator from './components/OfflineIndicator';

function AppRoutes({ user, onLogout }) {
  const navigate = useNavigate();
  const [ordenEnviada, setOrdenEnviada] = useState(null);

  const handleOrdenEnviada = (orden) => {
    setOrdenEnviada(orden);
    navigate('/confirmacion');
  };

  const handleNuevaOrden = () => {
    setOrdenEnviada(null);
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
          <Route path="/" element={<DashboardPage />} />
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
