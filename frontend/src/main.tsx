// frontend/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getCurrentUser } from './api';
import LoginPage from './pages/LoginPage';
import { QueryProvider } from './providers/QueryProvider';
import { ToastProvider } from './components/Toast';
import './index.css';
import './styles/themes.css';
import './styles/utilities.css';
import { APP_CONFIG } from './types';

const LoadingFallback: React.FC = () => (
  <div className="loading-overlay">Загрузка...</div>
);

const LazyApp = React.lazy(() => import('./app'));
const LazyDailyReportPage = React.lazy(() =>
  import('./pages/DailyReportPage').then((m) => ({ default: m.DailyReportPage }))
);
const LazyOrderPoolPage = React.lazy(() =>
  import('./pages/OrderPoolPage').then((m) => ({ default: m.OrderPoolPage }))
);
const LazyAdminPanelPage = React.lazy(() =>
  import('./pages/AdminPanelPage').then((m) => ({ default: m.AdminPanelPage }))
);

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

  if (loading) return <LoadingFallback />;
  if (!user) return <div className="error-message">Ошибка загрузки пользователя</div>;

  return (
    <React.Suspense fallback={<LoadingFallback />}>
      <LazyOrderPoolPage currentUserId={user.id} currentUserName={user.name} />
    </React.Suspense>
  );
}

// Отключаем изменение значения скроллом мыши для всех input[type="number"]
if (typeof window !== 'undefined') {
  document.addEventListener('wheel', (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'number' && document.activeElement === target) {
      e.preventDefault();
    }
  }, { passive: false });
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
          <Route
            path="/"
            element={
              <RequireAuth>
                <React.Suspense fallback={<LoadingFallback />}>
                  <LazyApp />
                </React.Suspense>
              </RequireAuth>
            }
          />
          <Route path="/order-pool" element={<RequireAuth><OrderPoolPageWrapper /></RequireAuth>} />
          <Route
            path="/reports"
            element={
              <RequireAuth>
                <React.Suspense fallback={<LoadingFallback />}>
                  <LazyDailyReportPage />
                </React.Suspense>
              </RequireAuth>
            }
          />
          <Route
            path="/adminpanel/*"
            element={
              <RequireAuth>
                <React.Suspense fallback={<LoadingFallback />}>
                  <LazyAdminPanelPage />
                </React.Suspense>
              </RequireAuth>
            }
          />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  </QueryProvider>
);
