import React, { useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import ProductManagementPage from './admin/ProductManagementPage';
import ProductTemplatePage from '../features/productTemplate/ProductTemplatePage';
import ProductTechProcessPage from './admin/ProductTechProcessPage';
import ProductEditPage from './admin/ProductEditPage';
import { AdminReportsPage } from './AdminReportsPage';
import { ReportsPage } from './admin/ReportsPage';
import { WarehousePage } from './admin/WarehousePage';
import { PricingPage } from './admin/PricingPage';
import PrintersPage from './admin/PrintersPage';
import { SettingsPage } from './admin/SettingsPage';
import { UserManagement } from '../features/userManagement';
import { AdminProductManager } from '../components/calculator/AdminProductManager';
import CalculatorProductManager from '../components/admin/CalculatorProductManager';
import { NotificationsManager } from '../components/notifications/NotificationsManager';
import AdminDashboard from '../components/admin/AdminDashboard';
import { DailyActivityOverview } from '../components/admin/DailyActivityOverview';
import SystemFeaturesPanel from '../components/admin/SystemFeaturesPanel';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useMaterials } from '../api/hooks/useMaterials';
import { useOrders } from '../api/hooks/useOrders';
import '../styles/admin-panel.css';
import '../components/notifications/NotificationsManager.css';
import './NotificationsPage.css';

// Компонент страницы уведомлений (исправлен - убраны инлайн стили)
const NotificationsPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  return (
    <div className="notifications-page">
      <div className="page-header">
        <button onClick={onBack} className="back-btn">← Назад</button>
        <h1>🔔 Управление уведомлениями</h1>
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
  const totalRevenue = orders?.reduce((sum, order) => sum + (order.total || 0), 0) || 0;

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
          <h1>🛡️ Админ панель</h1>
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
            <h1>🛡️ Админ панель</h1>
            <p>Добро пожаловать в систему управления CRM</p>
          </div>
        </div>
      </div>
      
      {/* Простая навигация */}
      <div className="admin-navigation">
        <h3>Быстрая навигация:</h3>
        <div className="nav-buttons">
          <button onClick={() => navigate('/adminpanel/materials')} className="nav-btn">
            📦 Материалы
          </button>
          <button onClick={() => navigate('/adminpanel/reports')} className="nav-btn">
            📊 Отчеты
          </button>
          <button onClick={() => navigate('/adminpanel/products')} className="nav-btn">
            🧩 Продукты калькулятора
          </button>
          <button onClick={() => navigate('/adminpanel/pricing')} className="nav-btn">
            💰 Ценообразование
          </button>
          <button onClick={() => navigate('/adminpanel/printers')} className="nav-btn">
            🖨️ Принтеры
          </button>
          <button onClick={() => navigate('/adminpanel/pricing-admin')} className="nav-btn">
            🔧 Настройка операций
          </button>
          <button onClick={() => navigate('/adminpanel/users')} className="nav-btn">
            👥 Пользователи
          </button>
          <button onClick={() => navigate('/adminpanel/settings')} className="nav-btn">
            ⚙️ Настройки
          </button>
          <button onClick={() => navigate('/adminpanel/notifications')} className="nav-btn">
            🔔 Уведомления
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
              <span className="link-icon">📦</span>
              <span className="link-title">Материалы</span>
              <span className="link-desc">Полное управление материалами и складом</span>
            </button>
            
            <button 
              className="admin-link-card"
              onClick={() => navigate('/adminpanel/reports')}
            >
              <span className="link-icon">📊</span>
              <span className="link-title">Отчеты</span>
              <span className="link-desc">Аналитика и отчеты</span>
            </button>
            
            {/* Ссылка устарела, ведем на продукты */}
            <button 
              className="admin-link-card"
              onClick={() => navigate('/adminpanel/products')}
            >
              <span className="link-icon">🧮</span>
              <span className="link-title">Калькулятор</span>
              <span className="link-desc">Настройки калькулятора</span>
            </button>
            
            <button 
              className="admin-link-card"
              onClick={() => navigate('/adminpanel/price-management')}
            >
              <span className="link-icon">📈</span>
              <span className="link-title">Управление ценами</span>
              <span className="link-desc">История цен, уведомления, пересчет</span>
            </button>
            
            <button 
              className="admin-link-card"
              onClick={() => navigate('/adminpanel/notifications')}
            >
              <span className="link-icon">🔔</span>
              <span className="link-title">Уведомления</span>
              <span className="link-desc">Управление всеми уведомлениями системы</span>
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
        <Route path="/cost-calculation" element={<PricingPage onBack={() => window.history.back()} />} />
        
        {/* Ценообразование */}
        <Route path="/pricing" element={<PricingPage onBack={() => window.history.back()} />} />
        <Route path="/pricing-admin" element={<AdminDashboard />} />
        <Route path="/discounts" element={<PricingPage onBack={() => window.history.back()} />} />
        <Route path="/printers" element={<PrintersPage />} />
        
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
    </div>
  );
};
