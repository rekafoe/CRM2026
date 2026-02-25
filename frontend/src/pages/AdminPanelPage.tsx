import React, { lazy, Suspense, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { NotificationsManager } from '../components/notifications/NotificationsManager';
import { AdminProductManager } from '../components/calculator/AdminProductManager';
import AdminDashboard from '../components/admin/AdminDashboard';
import { ServicesManagementPage } from './admin/ServicesManagementPage';
import { DailyActivityOverview } from '../components/admin/DailyActivityOverview';
import SystemFeaturesPanel from '../components/admin/SystemFeaturesPanel';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useMaterials } from '../api/hooks/useMaterials';
import { useOrders } from '../api/hooks/useOrders';
import { AppIcon } from '../components/ui/AppIcon';
import '../styles/admin-panel.css';
import '../components/notifications/NotificationsManager.css';
import './NotificationsPage.css';

const LoadingFallback: React.FC = () => (
  <div className="loading-overlay">Загрузка...</div>
);

const ProductManagementPage = lazy(() => import('./admin/ProductManagementPage'));
const ProductTemplatePage = lazy(() => import('../features/productTemplate/ProductTemplatePage'));
const ProductTechProcessPage = lazy(() => import('./admin/ProductTechProcessPage'));
const ProductEditPage = lazy(() => import('./admin/ProductEditPage'));
const AdminReportsPage = lazy(() =>
  import('./AdminReportsPage').then((m) => ({ default: m.AdminReportsPage }))
);
const ReportsPage = lazy(() =>
  import('./admin/ReportsPage').then((m) => ({ default: m.ReportsPage }))
);
const EarningsAdminPage = lazy(() =>
  import('./admin/EarningsAdminPage').then((m) => ({ default: m.EarningsAdminPage }))
);
const WarehousePage = lazy(() =>
  import('./admin/WarehousePage').then((m) => ({ default: m.WarehousePage }))
);
const PricingPage = lazy(() =>
  import('./admin/PricingPage').then((m) => ({ default: m.PricingPage }))
);
const PrintersPage = lazy(() => import('./admin/PrintersPage'));
const PrintPriceEditPage = lazy(() => import('./admin/PrintPriceEditPage'));
const CountersServicePage = lazy(() => import('./admin/CountersServicePage'));
const CustomersAdminPage = lazy(() =>
  import('./admin/CustomersAdminPage').then((m) => ({ default: m.default }))
);
const DocumentTemplatesPage = lazy(() => import('./admin/DocumentTemplatesPage'));
const SettingsPage = lazy(() =>
  import('./admin/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
const UserManagement = lazy(() =>
  import('../features/userManagement').then((m) => ({ default: m.UserManagement }))
);
const MultiPageProductEditor = lazy(() => import('./admin/MultiPageProductEditor'));

// Компонент страницы уведомлений (исправлен - убраны инлайн стили)
const NotificationsPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  return (
    <div className="notifications-page">
      <div className="page-header">
        <button onClick={onBack} className="back-btn">← Назад</button>
        <h1><AppIcon name="bell" size="sm" /> Управление уведомлениями</h1>
      </div>
      <div className="page-content">
        <NotificationsManager onClose={onBack} />
      </div>
    </div>
  );
};

// Главная страница админ панели с навигацией
const AdminPanelHome: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const { data: materials } = useMaterials();
  const { data: orders } = useOrders();
  const [showNotificationsManager, setShowNotificationsManager] = useState(false);

  const lowStockCount = materials?.filter((m: any) => m.quantity < 10).length || 0;
  const totalOrders = orders?.length || 0;
  const totalRevenue = orders?.reduce((sum, order: any) => sum + (order.totalAmount ?? order.total_amount ?? 0), 0) || 0;

  const handleNavigate = (page: string) => {
    navigate(`/adminpanel/${page}`);
  };

  const handleOpenModal = (modal: string) => {
    // Здесь можно открыть модальные окна
    console.log('Opening modal:', modal);
    if (modal === 'notifications') {
      setShowNotificationsManager(true);
    }
  };

  // Показываем загрузку если пользователь еще не загружен
  if (currentUser === null) {
    return (
      <div className="admin-panel-home">
        <div className="admin-panel-header">
          <h1><AppIcon name="shield" size="sm" /> Админ панель</h1>
          <p>Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-panel-home">
      <div className="admin-panel-header">
        <div className="header-content">
          <button 
            onClick={() => navigate('/')} 
            className="back-btn"
            title="Вернуться на главную"
          >
            ← Назад
          </button>
          <div className="header-text">
            <h1><AppIcon name="shield" size="sm" /> Админ панель</h1>
            <p>Добро пожаловать в систему управления CRM</p>
          </div>
        </div>
      </div>
      
      {/* Простая навигация */}
      <div className="admin-navigation">
        <h3>Быстрая навигация:</h3>
        <div className="nav-buttons">
          <button onClick={() => navigate('/adminpanel/materials')} className="nav-btn">
            <AppIcon name="package" size="xs" /> Материалы
          </button>
          <button onClick={() => navigate('/adminpanel/reports')} className="nav-btn">
            <AppIcon name="chart" size="xs" /> Отчеты
          </button>
          <button onClick={() => navigate('/adminpanel/products')} className="nav-btn">
            <AppIcon name="puzzle" size="xs" /> Продукты калькулятора
          </button>
          <button onClick={() => navigate('/adminpanel/pricing')} className="nav-btn">
            <AppIcon name="money" size="xs" /> Ценообразование
          </button>
          <button onClick={() => navigate('/adminpanel/earnings')} className="nav-btn">
            <AppIcon name="briefcase" size="xs" /> Проценты
          </button>
          <button onClick={() => navigate('/adminpanel/printers')} className="nav-btn">
            <AppIcon name="printer" size="xs" /> Принтеры
          </button>
          <button onClick={() => navigate('/adminpanel/counters')} className="nav-btn">
            <AppIcon name="receipt" size="xs" /> Счётчики
          </button>
          <button onClick={() => navigate('/adminpanel/services-management')} className="nav-btn">
            <AppIcon name="wrench" size="xs" /> Настройка операций
          </button>
          <button onClick={() => navigate('/adminpanel/clients')} className="nav-btn">
            <AppIcon name="users" size="xs" /> Клиенты
          </button>
          <button onClick={() => navigate('/adminpanel/document-templates')} className="nav-btn">
            <AppIcon name="clipboard" size="xs" /> Шаблоны документов
          </button>
          <button onClick={() => navigate('/adminpanel/users')} className="nav-btn">
            <AppIcon name="users" size="xs" /> Пользователи
          </button>
          <button onClick={() => navigate('/adminpanel/settings')} className="nav-btn">
            <AppIcon name="settings" size="xs" /> Настройки
          </button>
          <button onClick={() => navigate('/adminpanel/notifications')} className="nav-btn">
            <AppIcon name="bell" size="xs" /> Уведомления
          </button>
        </div>
      </div>
      
      <div className="admin-panel-content">
        {/* Обзор активности пользователей */}
        <div className="mb-6">
          <DailyActivityOverview />
        </div>
        
        <div className="admin-welcome">
          <h2>Выберите раздел для управления</h2>
          <p>Используйте кнопки навигации выше или выберите нужный раздел:</p>
          
          <div className="admin-quick-links">
            <button 
              className="admin-link-card"
              onClick={() => navigate('/adminpanel/materials')}
            >
              <span className="link-icon"><AppIcon name="package" size="md" circle /></span>
              <span className="link-title">Материалы</span>
              <span className="link-desc">Полное управление материалами и складом</span>
            </button>
            
            <button 
              className="admin-link-card"
              onClick={() => navigate('/adminpanel/reports')}
            >
              <span className="link-icon"><AppIcon name="chart" size="md" circle /></span>
              <span className="link-title">Отчеты</span>
              <span className="link-desc">Аналитика и отчеты</span>
            </button>
            
            <button 
              className="admin-link-card"
              onClick={() => navigate('/adminpanel/products')}
            >
              <span className="link-icon"><AppIcon name="puzzle" size="md" circle /></span>
              <span className="link-title">Калькулятор</span>
              <span className="link-desc">Настройки калькулятора</span>
            </button>
            
            <button 
              className="admin-link-card"
              onClick={() => navigate('/adminpanel/price-management')}
            >
              <span className="link-icon"><AppIcon name="chart-up" size="md" circle /></span>
              <span className="link-title">Управление ценами</span>
              <span className="link-desc">История цен, уведомления, пересчет</span>
            </button>

            <button 
              className="admin-link-card"
              onClick={() => navigate('/adminpanel/earnings')}
            >
              <span className="link-icon"><AppIcon name="briefcase" size="md" circle /></span>
              <span className="link-title">Проценты</span>
              <span className="link-desc">Начисления сотрудников и часы</span>
            </button>
            
            <button 
              className="admin-link-card"
              onClick={() => navigate('/adminpanel/notifications')}
            >
              <span className="link-icon"><AppIcon name="bell" size="md" circle /></span>
              <span className="link-title">Уведомления</span>
              <span className="link-desc">Управление всеми уведомлениями системы</span>
            </button>
            <button
              className="admin-link-card"
              onClick={() => navigate('/adminpanel/counters')}
            >
              <span className="link-icon"><AppIcon name="receipt" size="md" circle /></span>
              <span className="link-title">Счётчики</span>
              <span className="link-desc">Касса и принтеры по дням</span>
            </button>
            <button 
              className="admin-link-card"
              onClick={() => navigate('/adminpanel/clients')}
            >
              <span className="link-icon"><AppIcon name="users" size="md" circle /></span>
              <span className="link-title">Клиенты</span>
              <span className="link-desc">База клиентов и история заказов</span>
            </button>
          </div>
        </div>

        {/* Панель модулей системы */}
        <div className="system-features-section">
          <SystemFeaturesPanel />
        </div>
      </div>
      
      {/* Модальное окно уведомлений */}
      {showNotificationsManager && (
        <NotificationsManager onClose={() => setShowNotificationsManager(false)} />
      )}
    </div>
  );
};

export const AdminPanelPage: React.FC = () => {
  return (
    <div className="admin-panel-page">
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<AdminPanelHome />} />
          
          {/* Оригинальные админ страницы */}
          <Route path="/reports" element={<AdminReportsPage onBack={() => window.history.back()} />} />
          <Route path="/daily-reports" element={<AdminReportsPage onBack={() => window.history.back()} />} />
          <Route path="/analytics" element={<ReportsPage onBack={() => window.history.back()} />} />
          
          {/* Материалы */}
          <Route path="/materials" element={<WarehousePage onBack={() => window.history.back()} />} />
          <Route path="/inventory" element={<WarehousePage onBack={() => window.history.back()} />} />
          <Route path="/suppliers" element={<WarehousePage onBack={() => window.history.back()} />} />
          <Route path="/categories" element={<WarehousePage onBack={() => window.history.back()} />} />
          
          {/* Склад */}
          <Route path="/warehouse" element={<WarehousePage onBack={() => window.history.back()} />} />
          <Route path="/warehouse-reports" element={<ReportsPage onBack={() => window.history.back()} />} />
          <Route path="/low-stock-alerts" element={<WarehousePage onBack={() => window.history.back()} />} />
          
          {/* Ценообразование */}
          <Route path="/pricing" element={<PricingPage onBack={() => window.history.back()} />} />
          <Route path="/cost-calculation" element={<Navigate to="/adminpanel/pricing" replace />} />
          <Route path="/services-management" element={<ServicesManagementPage />} />
          <Route path="/discounts" element={<PricingPage onBack={() => window.history.back()} />} />
          <Route path="/earnings" element={<EarningsAdminPage />} />
          <Route path="/printers" element={<PrintersPage />} />
          <Route path="/print-prices/new" element={<PrintPriceEditPage />} />
          <Route path="/print-prices/:id" element={<PrintPriceEditPage />} />
          <Route path="/counters" element={<CountersServicePage />} />
          <Route path="/clients" element={<CustomersAdminPage />} />
          <Route path="/document-templates" element={<DocumentTemplatesPage />} />
          
          {/* Настройки */}
          <Route path="/settings" element={<SettingsPage onBack={() => window.history.back()} />} />
          <Route path="/users" element={<UserManagement onBack={() => window.history.back()} />} />
          {/* Устаревший маршрут настроек калькулятора → редирект на продукты */}
          <Route path="/calculator-settings" element={<Navigate to="/adminpanel/products" replace />} />
          {/* Переключаем продукты на новую страницу управления продуктами */}
          <Route path="/products" element={<ProductManagementPage />} />
          <Route path="/products/:id/edit" element={<ProductEditPage />} />
          {/* Новые внутренние редакторы */}
          <Route path="/products/:id/template" element={<ProductTemplatePage />} />
          <Route path="/products/:id/tech-process" element={<ProductTechProcessPage />} />
          <Route path="/products/multipage" element={<MultiPageProductEditor />} />
          <Route path="/products-old" element={<AdminProductManager />} />
          <Route path="/backup" element={<SettingsPage onBack={() => window.history.back()} />} />
          
          {/* Пользователи и заказы */}
          <Route path="/users" element={<UserManagement onBack={() => window.history.back()} />} />
          <Route path="/roles" element={<UserManagement onBack={() => window.history.back()} />} />
          <Route path="/all-orders" element={<ReportsPage onBack={() => window.history.back()} />} />
          <Route path="/order-templates" element={<SettingsPage onBack={() => window.history.back()} />} />
          
          {/* Уведомления */}
          <Route path="/notifications" element={<NotificationsPage onBack={() => window.history.back()} />} />
          
          <Route path="*" element={<Navigate to="/adminpanel" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
};
