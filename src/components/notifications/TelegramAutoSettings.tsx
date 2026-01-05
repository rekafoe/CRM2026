import React, { useState, useEffect } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { api } from '../../api';
import { ENDPOINTS } from '../../api/endpoints';
import './TelegramAutoSettings.css';

interface TelegramSettings {
  auto_add_users: boolean;
  default_role: string;
  welcome_message_enabled: boolean;
  group_chat_role: string;
  webhook_url: string;
}

interface TelegramAutoSettingsProps {
  onClose: () => void;
}

export const TelegramAutoSettings: React.FC<TelegramAutoSettingsProps> = ({ onClose }) => {
  const [settings, setSettings] = useState<TelegramSettings>({
    auto_add_users: true,
    default_role: 'client',
    welcome_message_enabled: true,
    group_chat_role: 'manager',
    webhook_url: ''
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const { addNotification } = useUIStore();

  // Загрузка настроек
  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await api.get(ENDPOINTS.NOTIFICATIONS.TELEGRAM_SETTINGS);
      setSettings(response.data || settings);
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // Сохранение настроек
  const saveSettings = async () => {
    setSaving(true);
    try {
      await api.put(ENDPOINTS.NOTIFICATIONS.TELEGRAM_SETTINGS, settings);
      addNotification('Настройки сохранены успешно', 'success');
    } catch (error: any) {
      addNotification(`Ошибка сохранения: ${error.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Загружаем настройки при монтировании
  useEffect(() => {
    loadSettings();
  }, []);

  const handleSettingChange = (key: keyof TelegramSettings, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  return (
    <div className="telegram-auto-settings">
      <div className="settings-header">
        <h2>⚙️ Настройки автоматического добавления</h2>
        <div className="header-actions">
          <button onClick={loadSettings} className="btn btn-secondary" disabled={loading}>
            {loading ? '⏳' : '🔄'} Обновить
          </button>
          <button onClick={saveSettings} className="btn btn-primary" disabled={saving}>
            {saving ? '⏳' : '💾'} Сохранить
          </button>
        </div>
      </div>

      <div className="settings-content">
        <div className="settings-section">
          <h3>🤖 Автоматическое добавление пользователей</h3>
          
          <div className="setting-item">
            <label className="setting-label">
              <input
                type="checkbox"
                checked={settings.auto_add_users}
                onChange={(e) => handleSettingChange('auto_add_users', e.target.checked)}
              />
              <span className="setting-text">
                <strong>Автоматически добавлять пользователей</strong>
                <small>Когда пользователь пишет боту впервые, он автоматически добавляется в систему</small>
              </span>
            </label>
          </div>

          <div className="setting-item">
            <label className="setting-label">
              <span className="setting-text">
                <strong>Роль по умолчанию для новых пользователей:</strong>
                <small>Роль, которая присваивается пользователям при автоматическом добавлении</small>
              </span>
            </label>
            <select
              value={settings.default_role}
              onChange={(e) => handleSettingChange('default_role', e.target.value)}
              className="form-control"
              disabled={!settings.auto_add_users}
            >
              <option value="client">👤 Клиент</option>
              <option value="manager">👨‍💼 Менеджер</option>
              <option value="admin">👑 Администратор</option>
            </select>
          </div>

          <div className="setting-item">
            <label className="setting-label">
              <span className="setting-text">
                <strong>Роль для групповых чатов:</strong>
                <small>Роль для пользователей из групповых чатов (группы, супергруппы)</small>
              </span>
            </label>
            <select
              value={settings.group_chat_role}
              onChange={(e) => handleSettingChange('group_chat_role', e.target.value)}
              className="form-control"
              disabled={!settings.auto_add_users}
            >
              <option value="client">👤 Клиент</option>
              <option value="manager">👨‍💼 Менеджер</option>
              <option value="admin">👑 Администратор</option>
            </select>
          </div>
        </div>

        <div className="settings-section">
          <h3>💬 Приветственные сообщения</h3>
          
          <div className="setting-item">
            <label className="setting-label">
              <input
                type="checkbox"
                checked={settings.welcome_message_enabled}
                onChange={(e) => handleSettingChange('welcome_message_enabled', e.target.checked)}
              />
              <span className="setting-text">
                <strong>Отправлять приветственное сообщение</strong>
                <small>Новые пользователи получат приветственное сообщение с информацией о системе</small>
              </span>
            </label>
          </div>
        </div>

        <div className="settings-section">
          <h3>🔗 Webhook настройки</h3>
          
          <div className="setting-item">
            <label className="setting-label">
              <span className="setting-text">
                <strong>Webhook URL:</strong>
                <small>URL для получения обновлений от Telegram (настраивается автоматически)</small>
              </span>
            </label>
            <input
              type="text"
              value={settings.webhook_url}
              onChange={(e) => handleSettingChange('webhook_url', e.target.value)}
              className="form-control"
              placeholder="https://yourdomain.com/api/notifications/telegram/webhook"
              readOnly
            />
          </div>
        </div>

        <div className="settings-section">
          <h3>📋 Информация о ролях</h3>
          
          <div className="roles-info">
            <div className="role-info">
              <span className="role-badge role-client">👤 Клиент</span>
              <p>Получает уведомления о своих заказах. Автоматически добавляется при написании боту.</p>
            </div>
            
            <div className="role-info">
              <span className="role-badge role-manager">👨‍💼 Менеджер</span>
              <p>Получает уведомления о заказах, низких остатках и системные уведомления. Назначается вручную или из групповых чатов.</p>
            </div>
            
            <div className="role-info">
              <span className="role-badge role-admin">👑 Администратор</span>
              <p>Получает все типы уведомлений. Назначается только вручную через админ панель.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
