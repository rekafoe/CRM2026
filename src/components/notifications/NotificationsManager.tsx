import React, { useState } from 'react';
import { LowStockAlerts } from '../warehouse/LowStockAlerts';
import { TelegramBotManager } from './TelegramBotManager';
import { AutoOrdersManager } from './AutoOrdersManager';
import { useUIStore } from '../../stores/uiStore';
import './NotificationsManager.css';

interface NotificationsManagerProps {
  onClose: () => void;
}

export const NotificationsManager: React.FC<NotificationsManagerProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'alerts' | 'telegram' | 'orders' | 'settings'>('alerts');
  const { addNotification } = useUIStore();

  const renderContent = () => {
    switch (activeTab) {
      case 'alerts':
        return <LowStockAlerts />;
      case 'telegram':
        return <TelegramBotManager onClose={() => setActiveTab('alerts')} />;
      case 'orders':
        return <AutoOrdersManager onClose={() => setActiveTab('alerts')} />;
      case 'settings':
        return <NotificationsSettings />;
      default:
        return <LowStockAlerts />;
    }
  };

  return (
    <div className="notifications-manager">
      <div className="notifications-header">
        <h2>🔔 Управление уведомлениями</h2>
        <button onClick={onClose} className="close-btn">✕</button>
      </div>

      <div className="notifications-tabs">
        <button
          className={activeTab === 'alerts' ? 'active' : ''}
          onClick={() => setActiveTab('alerts')}
        >
          📦 Остатки
        </button>
        <button
          className={activeTab === 'telegram' ? 'active' : ''}
          onClick={() => setActiveTab('telegram')}
        >
          🤖 Telegram
        </button>
        <button
          className={activeTab === 'orders' ? 'active' : ''}
          onClick={() => setActiveTab('orders')}
        >
          🛒 Автозаказы
        </button>
        <button
          className={activeTab === 'settings' ? 'active' : ''}
          onClick={() => setActiveTab('settings')}
        >
          ⚙️ Настройки
        </button>
      </div>

      <div className="notifications-content">
        {renderContent()}
      </div>
    </div>
  );
};

// Компонент настроек уведомлений
const NotificationsSettings: React.FC = () => {
  const { addNotification } = useUIStore();
  const [settings, setSettings] = useState({
    stockMonitoring: {
      enabled: true,
      checkInterval: 3600,
      warningThreshold: 0.2,
      criticalThreshold: 0.1
    },
    autoOrders: {
      enabled: true,
      minOrderValue: 100,
      maxOrderValue: 5000,
      approvalRequired: false,
      autoSend: false
    },
    notifications: {
      email: true,
      telegram: true,
      sms: false
    }
  });

  const handleSaveSettings = () => {
    // Здесь будет логика сохранения настроек
    addNotification('Настройки сохранены', 'success');
  };

  return (
    <div className="notifications-settings">
      <h3>⚙️ Настройки уведомлений</h3>
      
      <div className="settings-sections">
        <div className="settings-section">
          <h4>📊 Мониторинг запасов</h4>
          <div className="setting-item">
            <label>
              <input
                type="checkbox"
                checked={settings.stockMonitoring.enabled}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  stockMonitoring: { ...prev.stockMonitoring, enabled: e.target.checked }
                }))}
              />
              Включить мониторинг запасов
            </label>
          </div>
          <div className="setting-item">
            <label>
              Интервал проверки (секунды):
              <input
                type="number"
                value={settings.stockMonitoring.checkInterval}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  stockMonitoring: { ...prev.stockMonitoring, checkInterval: Number(e.target.value) }
                }))}
                disabled={!settings.stockMonitoring.enabled}
              />
            </label>
          </div>
          <div className="setting-item">
            <label>
              Порог предупреждения (%):
              <input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={settings.stockMonitoring.warningThreshold}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  stockMonitoring: { ...prev.stockMonitoring, warningThreshold: Number(e.target.value) }
                }))}
                disabled={!settings.stockMonitoring.enabled}
              />
            </label>
          </div>
          <div className="setting-item">
            <label>
              Критический порог (%):
              <input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={settings.stockMonitoring.criticalThreshold}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  stockMonitoring: { ...prev.stockMonitoring, criticalThreshold: Number(e.target.value) }
                }))}
                disabled={!settings.stockMonitoring.enabled}
              />
            </label>
          </div>
        </div>

        <div className="settings-section">
          <h4>🛒 Автоматические заказы</h4>
          <div className="setting-item">
            <label>
              <input
                type="checkbox"
                checked={settings.autoOrders.enabled}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  autoOrders: { ...prev.autoOrders, enabled: e.target.checked }
                }))}
              />
              Включить автозаказы
            </label>
          </div>
          <div className="setting-item">
            <label>
              Минимальная сумма заказа (BYN):
              <input
                type="number"
                value={settings.autoOrders.minOrderValue}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  autoOrders: { ...prev.autoOrders, minOrderValue: Number(e.target.value) }
                }))}
                disabled={!settings.autoOrders.enabled}
              />
            </label>
          </div>
          <div className="setting-item">
            <label>
              Максимальная сумма заказа (BYN):
              <input
                type="number"
                value={settings.autoOrders.maxOrderValue}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  autoOrders: { ...prev.autoOrders, maxOrderValue: Number(e.target.value) }
                }))}
                disabled={!settings.autoOrders.enabled}
              />
            </label>
          </div>
          <div className="setting-item">
            <label>
              <input
                type="checkbox"
                checked={settings.autoOrders.approvalRequired}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  autoOrders: { ...prev.autoOrders, approvalRequired: e.target.checked }
                }))}
                disabled={!settings.autoOrders.enabled}
              />
              Требовать подтверждение заказов
            </label>
          </div>
        </div>

        <div className="settings-section">
          <h4>📱 Каналы уведомлений</h4>
          <div className="setting-item">
            <label>
              <input
                type="checkbox"
                checked={settings.notifications.email}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  notifications: { ...prev.notifications, email: e.target.checked }
                }))}
              />
              Email уведомления
            </label>
          </div>
          <div className="setting-item">
            <label>
              <input
                type="checkbox"
                checked={settings.notifications.telegram}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  notifications: { ...prev.notifications, telegram: e.target.checked }
                }))}
              />
              Telegram уведомления
            </label>
          </div>
          <div className="setting-item">
            <label>
              <input
                type="checkbox"
                checked={settings.notifications.sms}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  notifications: { ...prev.notifications, sms: e.target.checked }
                }))}
              />
              SMS уведомления
            </label>
          </div>
        </div>
      </div>

      <div className="settings-actions">
        <button
          className="btn btn-primary"
          onClick={handleSaveSettings}
        >
          💾 Сохранить настройки
        </button>
      </div>
    </div>
  );
};
