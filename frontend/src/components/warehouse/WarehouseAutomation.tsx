import React, { useState, useEffect } from 'react';
import { useUIStore } from '../../stores/uiStore';

interface AutomationRule {
  id: number;
  name: string;
  material_id: number;
  material_name: string;
  trigger_quantity: number;
  order_quantity: number;
  supplier_id: number;
  supplier_name: string;
  is_active: boolean;
  last_triggered: string | null;
  trigger_count: number;
}

interface AutomationSettings {
  autoOrderEnabled: boolean;
  notificationEnabled: boolean;
  emailNotifications: boolean;
  smsNotifications: boolean;
  telegramNotifications: boolean;
  minOrderValue: number;
  maxOrderValue: number;
  approvalRequired: boolean;
}

interface WarehouseAutomationProps {
  onClose: () => void;
}

export const WarehouseAutomation: React.FC<WarehouseAutomationProps> = ({ onClose }) => {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [settings, setSettings] = useState<AutomationSettings>({
    autoOrderEnabled: true,
    notificationEnabled: true,
    emailNotifications: true,
    smsNotifications: false,
    telegramNotifications: true,
    minOrderValue: 100,
    maxOrderValue: 5000,
    approvalRequired: false
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'rules' | 'settings' | 'history'>('rules');
  const { addNotification } = useUIStore();

  useEffect(() => {
    loadAutomationData();
  }, []);

  const loadAutomationData = async () => {
    try {
      setLoading(true);
      // Здесь будет API вызов для получения данных автоматизации
      // const response = await fetch('/api/warehouse/automation');
      // const data = await response.json();
      
      // Моковые данные для демонстрации
      const mockRules: AutomationRule[] = [
        {
          id: 1,
          name: 'Автозаказ NEVIA 150г/м²',
          material_id: 28,
          material_name: 'NEVIA 150г/м² SRA3',
          trigger_quantity: 100,
          order_quantity: 1000,
          supplier_id: 1,
          supplier_name: 'ООО "Полиграфия-Минск"',
          is_active: true,
          last_triggered: '2025-01-20T10:30:00Z',
          trigger_count: 3
        },
        {
          id: 2,
          name: 'Автозаказ Color Copy 200г/м²',
          material_id: 30,
          material_name: 'Color Copy 200г/м² SRA3',
          trigger_quantity: 50,
          order_quantity: 500,
          supplier_id: 2,
          supplier_name: 'Color Copy Ltd',
          is_active: false,
          last_triggered: null,
          trigger_count: 0
        }
      ];
      
      setRules(mockRules);
    } catch (error) {
      console.error('Ошибка загрузки данных автоматизации:', error);
      addNotification('Ошибка загрузки данных автоматизации', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRule = async (ruleId: number) => {
    try {
      // API вызов для переключения правила
      // await fetch(`/api/warehouse/automation/rules/${ruleId}/toggle`, { method: 'POST' });
      
      setRules(prev => prev.map(rule => 
        rule.id === ruleId ? { ...rule, is_active: !rule.is_active } : rule
      ));
      
      addNotification('Правило автоматизации обновлено', 'success');
    } catch (error) {
      console.error('Ошибка обновления правила:', error);
      addNotification('Ошибка обновления правила', 'error');
    }
  };

  const handleDeleteRule = async (ruleId: number) => {
    try {
      // API вызов для удаления правила
      // await fetch(`/api/warehouse/automation/rules/${ruleId}`, { method: 'DELETE' });
      
      setRules(prev => prev.filter(rule => rule.id !== ruleId));
      addNotification('Правило автоматизации удалено', 'success');
    } catch (error) {
      console.error('Ошибка удаления правила:', error);
      addNotification('Ошибка удаления правила', 'error');
    }
  };

  const handleUpdateSettings = async (newSettings: Partial<AutomationSettings>) => {
    try {
      // API вызов для обновления настроек
      // await fetch('/api/warehouse/automation/settings', { 
      //   method: 'PUT', 
      //   body: JSON.stringify(newSettings) 
      // });
      
      setSettings(prev => ({ ...prev, ...newSettings }));
      addNotification('Настройки автоматизации обновлены', 'success');
    } catch (error) {
      console.error('Ошибка обновления настроек:', error);
      addNotification('Ошибка обновления настроек', 'error');
    }
  };

  const renderRules = () => (
    <div className="automation-rules">
      <div className="rules-header">
        <h3>🤖 Правила автоматизации</h3>
        <button className="add-rule-btn">➕ Добавить правило</button>
      </div>
      
      <div className="rules-list">
        {rules.map(rule => (
          <div key={rule.id} className={`rule-item ${rule.is_active ? 'active' : 'inactive'}`}>
            <div className="rule-header">
              <div className="rule-name">{rule.name}</div>
              <div className="rule-status">
                <span className={`status-badge ${rule.is_active ? 'active' : 'inactive'}`}>
                  {rule.is_active ? 'Активно' : 'Неактивно'}
                </span>
              </div>
            </div>
            
            <div className="rule-details">
              <div className="detail-row">
                <span>Материал:</span>
                <span>{rule.material_name}</span>
              </div>
              <div className="detail-row">
                <span>Триггер:</span>
                <span>≤ {rule.trigger_quantity} шт</span>
              </div>
              <div className="detail-row">
                <span>Заказ:</span>
                <span>{rule.order_quantity} шт</span>
              </div>
              <div className="detail-row">
                <span>Поставщик:</span>
                <span>{rule.supplier_name}</span>
              </div>
              <div className="detail-row">
                <span>Срабатываний:</span>
                <span>{rule.trigger_count} раз</span>
              </div>
              {rule.last_triggered && (
                <div className="detail-row">
                  <span>Последний раз:</span>
                  <span>{new Date(rule.last_triggered).toLocaleString()}</span>
                </div>
              )}
            </div>
            
            <div className="rule-actions">
              <button 
                className={`toggle-btn ${rule.is_active ? 'deactivate' : 'activate'}`}
                onClick={() => handleToggleRule(rule.id)}
              >
                {rule.is_active ? '⏸️ Отключить' : '▶️ Включить'}
              </button>
              <button 
                className="edit-btn"
                onClick={() => {/* Редактировать правило */}}
              >
                ✏️ Редактировать
              </button>
              <button 
                className="delete-btn"
                onClick={() => handleDeleteRule(rule.id)}
              >
                🗑️ Удалить
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="automation-settings">
      <h3>⚙️ Настройки автоматизации</h3>
      
      <div className="settings-section">
        <h4>Общие настройки</h4>
        <div className="setting-item">
          <label>
            <input 
              type="checkbox" 
              checked={settings.autoOrderEnabled}
              onChange={(e) => handleUpdateSettings({ autoOrderEnabled: e.target.checked })}
            />
            Включить автозаказы
          </label>
        </div>
        <div className="setting-item">
          <label>
            <input 
              type="checkbox" 
              checked={settings.approvalRequired}
              onChange={(e) => handleUpdateSettings({ approvalRequired: e.target.checked })}
            />
            Требовать подтверждение заказов
          </label>
        </div>
      </div>

      <div className="settings-section">
        <h4>Уведомления</h4>
        <div className="setting-item">
          <label>
            <input 
              type="checkbox" 
              checked={settings.notificationEnabled}
              onChange={(e) => handleUpdateSettings({ notificationEnabled: e.target.checked })}
            />
            Включить уведомления
          </label>
        </div>
        <div className="setting-item">
          <label>
            <input 
              type="checkbox" 
              checked={settings.emailNotifications}
              onChange={(e) => handleUpdateSettings({ emailNotifications: e.target.checked })}
            />
            Email уведомления
          </label>
        </div>
        <div className="setting-item">
          <label>
            <input 
              type="checkbox" 
              checked={settings.telegramNotifications}
              onChange={(e) => handleUpdateSettings({ telegramNotifications: e.target.checked })}
            />
            Telegram уведомления
          </label>
        </div>
      </div>

      <div className="settings-section">
        <h4>Лимиты заказов</h4>
        <div className="setting-item">
          <label>
            Минимальная сумма заказа:
            <input 
              type="number" 
              value={settings.minOrderValue}
              onChange={(e) => handleUpdateSettings({ minOrderValue: Number(e.target.value) })}
            />
            BYN
          </label>
        </div>
        <div className="setting-item">
          <label>
            Максимальная сумма заказа:
            <input 
              type="number" 
              value={settings.maxOrderValue}
              onChange={(e) => handleUpdateSettings({ maxOrderValue: Number(e.target.value) })}
            />
            BYN
          </label>
        </div>
      </div>
    </div>
  );

  const renderHistory = () => (
    <div className="automation-history">
      <h3>📜 История автоматизации</h3>
      <div className="history-list">
        <div className="history-item">
          <div className="history-time">2025-01-20 10:30</div>
          <div className="history-action">Автозаказ NEVIA 150г/м² (1000 шт)</div>
          <div className="history-status success">✅ Выполнено</div>
        </div>
        <div className="history-item">
          <div className="history-time">2025-01-18 14:15</div>
          <div className="history-action">Автозаказ Color Copy 200г/м² (500 шт)</div>
          <div className="history-status pending">⏳ Ожидает подтверждения</div>
        </div>
        <div className="history-item">
          <div className="history-time">2025-01-15 09:45</div>
          <div className="history-action">Автозаказ NEVIA 150г/м² (1000 шт)</div>
          <div className="history-status success">✅ Выполнено</div>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="warehouse-automation">
        <div className="automation-header">
          <h2>🤖 Автоматизация склада</h2>
          <button onClick={onClose} className="close-btn">✕</button>
        </div>
        <div className="loading">Загрузка данных автоматизации...</div>
      </div>
    );
  }

  return (
    <div className="warehouse-automation">
      <div className="automation-header">
        <h2>🤖 Автоматизация склада</h2>
        <button onClick={onClose} className="close-btn">✕</button>
      </div>

      <div className="automation-tabs">
        <button 
          className={activeTab === 'rules' ? 'active' : ''}
          onClick={() => setActiveTab('rules')}
        >
          🤖 Правила
        </button>
        <button 
          className={activeTab === 'settings' ? 'active' : ''}
          onClick={() => setActiveTab('settings')}
        >
          ⚙️ Настройки
        </button>
        <button 
          className={activeTab === 'history' ? 'active' : ''}
          onClick={() => setActiveTab('history')}
        >
          📜 История
        </button>
      </div>

      <div className="automation-content">
        {activeTab === 'rules' && renderRules()}
        {activeTab === 'settings' && renderSettings()}
        {activeTab === 'history' && renderHistory()}
      </div>

      <div className="automation-footer">
        <button 
          className="test-btn"
          onClick={() => {/* Тестировать автоматизацию */}}
        >
          🧪 Тестировать
        </button>
        <button 
          className="export-btn"
          onClick={() => {/* Экспорт правил */}}
        >
          📊 Экспорт
        </button>
      </div>
    </div>
  );
};
