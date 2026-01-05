// frontend/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from './app';
import { DailyReportPage } from './pages/DailyReportPage';
import { OrderPoolPage } from './pages/OrderPoolPage';
import { getCurrentUser } from './api';
import { AdminPanelPage } from './pages/AdminPanelPage';
import LoginPage from './pages/LoginPage';
import { QueryProvider } from './providers/QueryProvider';
import { ToastProvider } from './components/Toast';
import './index.css';
import './styles/themes.css';
import './styles/utilities.css';
import { APP_CONFIG } from './types';

function RequireAuth({ children }: { children: JSX.Element }) {
  const token = typeof window !== 'undefined' ? localStorage.getItem(APP_CONFIG.storage.token) : null;
  const sessDate = typeof window !== 'undefined' ? localStorage.getItem(APP_CONFIG.storage.sessionDate) : null;
  const today = new Date().toISOString().slice(0,10);
  if (!token) return <Navigate to="/login" replace />;
  if (sessDate && sessDate !== today) {
    // Session expired by date turnover, force re-auth
    localStorage.removeItem(APP_CONFIG.storage.token);
    localStorage.removeItem(APP_CONFIG.storage.role);
    return <Navigate to="/login" replace />;
  }
  return children;
}

function OrderPoolPageWrapper() {
  const [user, setUser] = React.useState<{ id: number; name: string; role: string } | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    getCurrentUser()
      .then(r => setUser(r.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-overlay">Загрузка...</div>;
  if (!user) return <div className="error-message">Ошибка загрузки пользователя</div>;

  return <OrderPoolPage currentUserId={user.id} currentUserName={user.name} />;
}

// Проверяем, не создан ли уже root
let root = (window as any).__reactRoot;
if (!root) {
  root = ReactDOM.createRoot(document.getElementById('root')!);
  (window as any).__reactRoot = root;
}

root.render(
  <QueryProvider>
    <ToastProvider>
      <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RequireAuth><App /></RequireAuth>} />
          <Route path="/order-pool" element={<RequireAuth><OrderPoolPageWrapper /></RequireAuth>} />
          <Route path="/reports" element={<RequireAuth><DailyReportPage /></RequireAuth>} />
          <Route path="/adminpanel/*" element={<RequireAuth><AdminPanelPage /></RequireAuth>} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  </QueryProvider>
);
