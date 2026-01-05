import React, { useState } from 'react';
import { 
  useTelegramConfig, 
  useConfigureTelegram, 
  useTestTelegram,
  useUsers,
  useSendToAllUsers,
  useSendToRole,
  TelegramConfig 
} from '../../api/hooks/useNotifications';
import { useUIStore } from '../../stores/uiStore';
import { TelegramUsersManager } from './TelegramUsersManager';
import { TelegramAutoSettings } from './TelegramAutoSettings';
import './TelegramBotManager.css';

interface TelegramBotManagerProps {
  onClose: () => void;
}

export const TelegramBotManager: React.FC<TelegramBotManagerProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'config' | 'test' | 'users' | 'telegram-users' | 'auto-settings'>('config');
  const [config, setConfig] = useState<TelegramConfig>({ enabled: false, botToken: '' });
  const [testMessage, setTestMessage] = useState('Тестовое сообщение из CRM системы');
  const [userMessage, setUserMessage] = useState('');
  const [selectedRole, setSelectedRole] = useState<'admin' | 'manager' | 'user'>('admin');
  
  const { addNotification } = useUIStore();
  
  // API хуки
  const { data: telegramConfig, isLoading: configLoading } = useTelegramConfig();
  const { data: users, isLoading: usersLoading } = useUsers();
  const configureTelegram = useConfigureTelegram();
  const testTelegram = useTestTelegram();
  const sendToAllUsers = useSendToAllUsers();
  const sendToRole = useSendToRole();

  // Обновляем локальное состояние при загрузке конфигурации
  React.useEffect(() => {
    if (telegramConfig) {
      console.log('📱 Telegram config loaded:', telegramConfig);
      setConfig(telegramConfig);
    }
  }, [telegramConfig]);

  // Отладочная информация
  React.useEffect(() => {
    console.log('🔧 Current config state:', config);
    console.log('📊 Telegram config from API:', telegramConfig);
    console.log('⏳ Config loading:', configLoading);
  }, [config, telegramConfig, configLoading]);

  const handleSaveConfig = async () => {
    try {
      await configureTelegram.mutateAsync(config);
      addNotification('Конфигурация Telegram сохранена', 'success');
    } catch (error: any) {
      addNotification(`Ошибка сохранения: ${error.message}`, 'error');
    }
  };

  const handleTestMessage = async () => {
    try {
      await testTelegram.mutateAsync(testMessage);
      addNotification('Тестовое сообщение отправлено', 'success');
    } catch (error: any) {
      addNotification(`Ошибка отправки: ${error.message}`, 'error');
    }
  };

  const handleSendToAll = async () => {
    if (!userMessage.trim()) {
      addNotification('Введите сообщение', 'warning');
      return;
    }

    try {
      await sendToAllUsers.mutateAsync(userMessage);
      addNotification('Сообщение отправлено всем пользователям', 'success');
      setUserMessage('');
    } catch (error: any) {
      addNotification(`Ошибка отправки: ${error.message}`, 'error');
    }
  };

  const handleSendToRole = async () => {
    if (!userMessage.trim()) {
      addNotification('Введите сообщение', 'warning');
      return;
    }

    try {
      await sendToRole.mutateAsync({ role: selectedRole, message: userMessage });
      addNotification(`Сообщение отправлено роли ${selectedRole}`, 'success');
      setUserMessage('');
    } catch (error: any) {
      addNotification(`Ошибка отправки: ${error.message}`, 'error');
    }
  };

  const renderConfig = () => (
    <div className="telegram-config">
      <h3>⚙️ Настройка Telegram бота</h3>
      
      <div className="config-section">
        <div className="config-item">
          <label>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => setConfig(prev => ({ ...prev, enabled: e.target.checked }))}
            />
            Включить Telegram уведомления
          </label>
        </div>
        
        <div className="config-item">
          <label>
            Токен бота:
            <input
              type="password"
              value={config.botToken || ''}
              onChange={(e) => setConfig(prev => ({ ...prev, botToken: e.target.value }))}
              placeholder="Введите токен бота"
              disabled={!config.enabled}
            />
          </label>
          <small className="config-help">
            💡 Токен можно получить у @BotFather в Telegram. Chat ID не требуется - система автоматически найдет пользователей.
          </small>
        </div>
        
      </div>

      <div className="config-actions">
        <button
          className="btn btn-primary"
          onClick={handleSaveConfig}
          disabled={configureTelegram.isPending}
        >
          {configureTelegram.isPending ? 'Сохранение...' : '💾 Сохранить'}
        </button>
      </div>

      {configLoading && (
        <div className="loading">Загрузка конфигурации...</div>
      )}
    </div>
  );

  const renderTest = () => (
    <div className="telegram-test">
      <h3>🧪 Тестирование Telegram</h3>
      
      <div className="test-section">
        <div className="test-item">
          <label>
            Тестовое сообщение:
            <textarea
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              placeholder="Введите тестовое сообщение"
              rows={3}
            />
          </label>
        </div>
        
        <div className="test-actions">
          <button
            className="btn btn-primary"
            onClick={handleTestMessage}
            disabled={testTelegram.isPending || !config.enabled}
          >
            {testTelegram.isPending ? 'Отправка...' : '📤 Отправить тест'}
          </button>
        </div>
      </div>

      {!config.enabled && (
        <div className="warning">
          ⚠️ Telegram уведомления отключены. Включите их в настройках.
          <br />
          <small>Debug: config.enabled = {config.enabled ? 'true' : 'false'}</small>
        </div>
      )}
    </div>
  );

  const renderUsers = () => (
    <div className="telegram-users">
      <h3>👥 Управление пользователями</h3>
      
      <div className="users-section">
        <div className="users-stats">
          <div className="stat-item">
            <span className="stat-label">Всего пользователей:</span>
            <span className="stat-value">{users?.length || 0}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">С Telegram:</span>
            <span className="stat-value">
              {users?.filter(u => u.telegramChatId).length || 0}
            </span>
          </div>
        </div>

        <div className="message-section">
          <div className="message-item">
            <label>
              Сообщение для отправки:
              <textarea
                value={userMessage}
                onChange={(e) => setUserMessage(e.target.value)}
                placeholder="Введите сообщение для пользователей"
                rows={3}
              />
            </label>
          </div>

          <div className="message-actions">
            <div className="role-selector">
              <label>
                Отправить роли:
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as any)}
                >
                  <option value="admin">Администраторы</option>
                  <option value="manager">Менеджеры</option>
                  <option value="user">Пользователи</option>
                </select>
              </label>
            </div>

            <div className="send-buttons">
              <button
                className="btn btn-secondary"
                onClick={handleSendToRole}
                disabled={sendToRole.isPending || !userMessage.trim()}
              >
                {sendToRole.isPending ? 'Отправка...' : `📤 Отправить ${selectedRole}`}
              </button>
              
              <button
                className="btn btn-primary"
                onClick={handleSendToAll}
                disabled={sendToAllUsers.isPending || !userMessage.trim()}
              >
                {sendToAllUsers.isPending ? 'Отправка...' : '📤 Отправить всем'}
              </button>
            </div>
          </div>
        </div>

        <div className="users-list">
          <h4>Список пользователей:</h4>
          {usersLoading ? (
            <div className="loading">Загрузка пользователей...</div>
          ) : (
            <div className="users-grid">
              {users?.map(user => (
                <div key={user.id} className="user-card">
                  <div className="user-info">
                    <div className="user-name">{user.name}</div>
                    <div className="user-role">{user.role}</div>
                    <div className="user-email">{user.email}</div>
                  </div>
                  <div className="user-telegram">
                    {user.telegramChatId ? (
                      <span className="telegram-connected">✅ Telegram подключен</span>
                    ) : (
                      <span className="telegram-disconnected">❌ Telegram не подключен</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="telegram-bot-manager">
      <div className="telegram-tabs">
        <button
          className={activeTab === 'config' ? 'active' : ''}
          onClick={() => setActiveTab('config')}
        >
          ⚙️ Настройки
        </button>
        <button
          className={activeTab === 'test' ? 'active' : ''}
          onClick={() => setActiveTab('test')}
        >
          🧪 Тест
        </button>
        <button
          className={activeTab === 'users' ? 'active' : ''}
          onClick={() => setActiveTab('users')}
        >
          👥 Пользователи
        </button>
        <button
          className={activeTab === 'telegram-users' ? 'active' : ''}
          onClick={() => setActiveTab('telegram-users')}
        >
          📱 Telegram пользователи
        </button>
        <button
          className={activeTab === 'auto-settings' ? 'active' : ''}
          onClick={() => setActiveTab('auto-settings')}
        >
          ⚙️ Автонастройки
        </button>
      </div>

      <div className="telegram-content">
        {activeTab === 'config' && renderConfig()}
        {activeTab === 'test' && renderTest()}
        {activeTab === 'users' && renderUsers()}
        {activeTab === 'telegram-users' && <TelegramUsersManager onClose={() => setActiveTab('config')} />}
        {activeTab === 'auto-settings' && <TelegramAutoSettings onClose={() => setActiveTab('config')} />}
      </div>
    </div>
  );
};
