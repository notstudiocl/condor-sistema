import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import LoginPage from './pages/LoginPage';
import OrdenWizardPage from './pages/OrdenWizardPage';
import ConfirmacionPage from './pages/ConfirmacionPage';
import Header from './components/Header';

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('condor_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [ordenEnviada, setOrdenEnviada] = useState(null);

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
    setOrdenEnviada(null);
  };

  const handleOrdenEnviada = (orden) => {
    setOrdenEnviada(orden);
  };

  const handleNuevaOrden = () => {
    setOrdenEnviada(null);
  };

  if (!user) {
    return (
      <HashRouter>
        <LoginPage onLogin={handleLogin} />
      </HashRouter>
    );
  }

  return (
    <HashRouter>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Header user={user} onLogout={handleLogout} />
        <main className="flex-1">
          <Routes>
            <Route
              path="/"
              element={
                ordenEnviada ? (
                  <ConfirmacionPage
                    orden={ordenEnviada}
                    onNuevaOrden={handleNuevaOrden}
                  />
                ) : (
                  <OrdenWizardPage
                    user={user}
                    onOrdenEnviada={handleOrdenEnviada}
                  />
                )
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
