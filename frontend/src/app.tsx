import "./index.css";
import "./app.css";
import { OptimizedApp } from './components/optimized/OptimizedApp';
import { ErrorBoundary } from './components/optimized/ErrorBoundary';


import './styles/skeleton.css';
import './styles/optimized.css';
import './styles/admin-panel.css';
import './styles/warehouse-dashboard.css';
import './components/orders/OrdersManagement.css';
import './components/orders/OrderEditModal.css';
import './components/orders/OrderHistory.css';
import './components/notifications/NotificationsManager.css';

// Главный компонент с провайдерами
export default function App() {
  return (
    <ErrorBoundary>
      <OptimizedApp />
    </ErrorBoundary>
  );
}