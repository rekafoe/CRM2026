import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LowStockAlerts } from '../warehouse/LowStockAlerts';
import { TelegramBotManager } from './TelegramBotManager';
import { AutoOrdersManager } from './AutoOrdersManager';
import { OrderClientNotifyTab } from './OrderClientNotifyTab';
import { CampaignManagerPage } from './campaigns/CampaignManagerPage';
import { useUIStore } from '../../stores/uiStore';
import { BynSymbol } from '../ui/BynSymbol';
import './NotificationsManager.css';

type NotifyTab = 'alerts' | 'telegram' | 'orders' | 'settings' | 'client' | 'campaigns';

interface NotificationsManagerProps {
  onClose: () => void;
}

function tabFromSearchParam(t: string | null): NotifyTab {
  if (t === 'client' || t === 'mail' || t === 'email' || t === 'sms') {
    return 'client';
  }
  if (t === 'campaigns' || t === 'broadcast' || t === 'marketing') {
    return 'campaigns';
  }
  if (t === 'telegram') {
    return 'telegram';
  }
  if (t === 'orders' || t === 'auto') {
    return 'orders';
  }
  if (t === 'settings' || t === 'config') {
    return 'settings';
  }
  if (t === 'alerts' || t === 'stock') {
    return 'alerts';
  }
  return 'alerts';
}

function paramForTab(tab: NotifyTab): string | undefined {
  if (tab === 'alerts') {
    return undefined;
  }
  if (tab === 'client') {
    return 'client';
  }
  if (tab === 'campaigns') {
    return 'campaigns';
  }
  if (tab === 'telegram') {
    return 'telegram';
  }
  if (tab === 'orders') {
    return 'orders';
  }
  if (tab === 'settings') {
    return 'settings';
  }
  return undefined;
}

export const NotificationsManager: React.FC<NotificationsManagerProps> = ({ onClose }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<NotifyTab>(() => tabFromSearchParam(searchParams.get('tab')));
  const { showToast } = useUIStore();

  useEffect(() => {
    setActiveTab(tabFromSearchParam(searchParams.get('tab')));
  }, [searchParams]);

  const goTab = useCallback(
    (tab: NotifyTab) => {
      setActiveTab(tab);
      const p = paramForTab(tab);
      if (p) {
        setSearchParams({ tab: p });
      } else {
        setSearchParams({});
      }
    },
    [setSearchParams]
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'alerts':
        return <LowStockAlerts />;
      case 'telegram':
        return <TelegramBotManager onClose={() => goTab('alerts')} />;
      case 'orders':
        return <AutoOrdersManager onClose={() => goTab('alerts')} />;
      case 'settings':
        return <NotificationsSettings />;
      case 'client':
        return <OrderClientNotifyTab />;
      case 'campaigns':
        return <CampaignManagerPage />;
      default:
        return <LowStockAlerts />;
    }
  };

  return (
    <div className="notifications-manager">
      <div className="notifications-header">
        <h2>Управление уведомлениями</h2>
        <button type="button" onClick={onClose} className="close-btn" aria-label="Закрыть">
          ✕
        </button>
      </div>

      <div className="notifications-tabs">
        <button
          type="button"
          className={activeTab === 'alerts' ? 'active' : ''}
          onClick={() => goTab('alerts')}
        >
          Остатки
        </button>
        <button
          type="button"
          className={activeTab === 'client' ? 'active' : ''}
          onClick={() => goTab('client')}
        >
          Почта / SMS
        </button>
        <button
          type="button"
          className={activeTab === 'campaigns' ? 'active' : ''}
          onClick={() => goTab('campaigns')}
        >
          Кампании
        </button>
        <button
          type="button"
          className={activeTab === 'telegram' ? 'active' : ''}
          onClick={() => goTab('telegram')}
        >
          Telegram
        </button>
        <button
          type="button"
          className={activeTab === 'orders' ? 'active' : ''}
          onClick={() => goTab('orders')}
        >
          Автозаказы
        </button>
        <button
          type="button"
          className={activeTab === 'settings' ? 'active' : ''}
          onClick={() => goTab('settings')}
        >
          Настройки
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
  const { showToast } = useUIStore();
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
    showToast('Настройки сохранены', 'success');
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
              Минимальная сумма заказа (<BynSymbol />):
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
              Максимальная сумма заказа (<BynSymbol />):
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
