import React, { useState } from 'react';
import { useUIStore } from '../../stores/uiStore';
import './TelegramUsersManager.css';

interface TelegramUser {
  id: number;
  chat_id: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  is_active: boolean;
  role: string;
  notifications_enabled: boolean;
  notification_preferences: {
    low_stock: boolean;
    new_orders: boolean;
    system_alerts: boolean;
  };
  created_at: string;
  updated_at: string;
}

interface CreateTelegramUserRequest {
  chat_id: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  notifications_enabled?: boolean;
  notification_preferences?: {
    low_stock: boolean;
    new_orders: boolean;
    system_alerts: boolean;
  };
}

interface TelegramUsersManagerProps {
  onClose: () => void;
}

export const TelegramUsersManager: React.FC<TelegramUsersManagerProps> = ({ onClose }) => {
  const [users, setUsers] = useState<TelegramUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<TelegramUser | null>(null);
  const [newUser, setNewUser] = useState<CreateTelegramUserRequest>({
    chat_id: '',
    username: '',
    first_name: '',
    last_name: '',
    role: 'client',
    notifications_enabled: true,
    notification_preferences: {
      low_stock: false,        // Клиенты по умолчанию не получают уведомления о низких остатках
      new_orders: true,        // Клиенты получают уведомления о заказах
      system_alerts: false     // Клиенты не получают системные уведомления
    }
  });

  const { addNotification } = useUIStore();

  // Загрузка пользователей
  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('crmToken');
      const response = await fetch('/api/notifications/telegram-users', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Ошибка загрузки пользователей');
      }

      const data = await response.json();
      setUsers(data.data || []);
    } catch (err: any) {
      setError(err.message);
      addNotification(`Ошибка загрузки пользователей: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Создание пользователя
  const createUser = async () => {
    if (!newUser.chat_id.trim()) {
      addNotification('Введите Chat ID', 'warning');
      return;
    }

    try {
      const token = localStorage.getItem('crmToken');
      const response = await fetch('/api/notifications/telegram-users', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newUser)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Ошибка создания пользователя');
      }

      addNotification('Пользователь Telegram создан успешно', 'success');
      setShowAddModal(false);
      setNewUser({
        chat_id: '',
        username: '',
        first_name: '',
        last_name: '',
        role: 'client',
        notifications_enabled: true,
        notification_preferences: {
          low_stock: false,
          new_orders: true,
          system_alerts: false
        }
      });
      loadUsers();
    } catch (err: any) {
      addNotification(`Ошибка создания пользователя: ${err.message}`, 'error');
    }
  };

  // Обновление пользователя
  const updateUser = async (user: TelegramUser) => {
    try {
      const token = localStorage.getItem('crmToken');
      const response = await fetch(`/api/notifications/telegram-users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          is_active: user.is_active,
          role: user.role,
          notifications_enabled: user.notifications_enabled,
          notification_preferences: user.notification_preferences
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Ошибка обновления пользователя');
      }

      addNotification('Пользователь обновлен успешно', 'success');
      setEditingUser(null);
      loadUsers();
    } catch (err: any) {
      addNotification(`Ошибка обновления пользователя: ${err.message}`, 'error');
    }
  };

  // Удаление пользователя
  const deleteUser = async (id: number) => {
    if (!confirm('Вы уверены, что хотите удалить этого пользователя?')) {
      return;
    }

    try {
      const token = localStorage.getItem('crmToken');
      const response = await fetch(`/api/notifications/telegram-users/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Ошибка удаления пользователя');
      }

      addNotification('Пользователь удален успешно', 'success');
      loadUsers();
    } catch (err: any) {
      addNotification(`Ошибка удаления пользователя: ${err.message}`, 'error');
    }
  };

  // Загружаем пользователей при монтировании
  React.useEffect(() => {
    loadUsers();
  }, []);

  const renderUserRow = (user: TelegramUser) => (
    <tr key={user.id}>
      <td>{user.chat_id}</td>
      <td>
        {user.username && <div>@{user.username}</div>}
        {user.first_name && <div>{user.first_name} {user.last_name || ''}</div>}
      </td>
      <td>
        <span className={`role-badge role-${user.role}`}>
          {user.role === 'admin' ? '👑 Админ' : 
           user.role === 'manager' ? '👨‍💼 Менеджер' : 
           user.role === 'client' ? '👤 Клиент' : '👤 Пользователь'}
        </span>
      </td>
      <td>
        <div className="status-indicators">
          <span className={`status ${user.is_active ? 'active' : 'inactive'}`}>
            {user.is_active ? '✅ Активен' : '❌ Неактивен'}
          </span>
          <span className={`status ${user.notifications_enabled ? 'enabled' : 'disabled'}`}>
            {user.notifications_enabled ? '🔔 Уведомления' : '🔕 Без уведомлений'}
          </span>
        </div>
      </td>
      <td>
        <div className="preferences">
          {user.notification_preferences.low_stock && <span className="pref">📦 Остатки</span>}
          {user.notification_preferences.new_orders && <span className="pref">🛒 Заказы</span>}
          {user.notification_preferences.system_alerts && <span className="pref">⚠️ Система</span>}
        </div>
      </td>
      <td>
        <div className="actions">
          <button
            className="btn btn-sm btn-primary"
            onClick={() => setEditingUser(user)}
            title="Редактировать"
          >
            ✏️
          </button>
          <button
            className="btn btn-sm btn-danger"
            onClick={() => deleteUser(user.id)}
            title="Удалить"
          >
            🗑️
          </button>
        </div>
      </td>
    </tr>
  );

  const renderEditModal = () => {
    if (!editingUser) return null;

    return (
      <div className="modal-overlay">
        <div className="modal">
          <div className="modal-header">
            <h3>Редактировать пользователя Telegram</h3>
            <button onClick={() => setEditingUser(null)} className="close-btn">✕</button>
          </div>
          <div className="modal-body">
            <div className="form-group">
              <label>Chat ID:</label>
              <input
                type="text"
                value={editingUser.chat_id}
                disabled
                className="form-control"
              />
            </div>
            <div className="form-group">
              <label>Username:</label>
              <input
                type="text"
                value={editingUser.username || ''}
                onChange={(e) => setEditingUser({...editingUser, username: e.target.value})}
                className="form-control"
                placeholder="@username"
              />
            </div>
            <div className="form-group">
              <label>Имя:</label>
              <input
                type="text"
                value={editingUser.first_name || ''}
                onChange={(e) => setEditingUser({...editingUser, first_name: e.target.value})}
                className="form-control"
                placeholder="Имя"
              />
            </div>
            <div className="form-group">
              <label>Фамилия:</label>
              <input
                type="text"
                value={editingUser.last_name || ''}
                onChange={(e) => setEditingUser({...editingUser, last_name: e.target.value})}
                className="form-control"
                placeholder="Фамилия"
              />
            </div>
            <div className="form-group">
              <label>Роль:</label>
              <select
                value={editingUser.role}
                onChange={(e) => setEditingUser({...editingUser, role: e.target.value})}
                className="form-control"
              >
                <option value="client">👤 Клиент</option>
                <option value="manager">👨‍💼 Менеджер</option>
                <option value="admin">👑 Администратор</option>
              </select>
            </div>
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={editingUser.is_active}
                  onChange={(e) => setEditingUser({...editingUser, is_active: e.target.checked})}
                />
                Активен
              </label>
            </div>
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={editingUser.notifications_enabled}
                  onChange={(e) => setEditingUser({...editingUser, notifications_enabled: e.target.checked})}
                />
                Уведомления включены
              </label>
            </div>
            <div className="form-group">
              <label>Настройки уведомлений:</label>
              <div className="preferences-grid">
                <label>
                  <input
                    type="checkbox"
                    checked={editingUser.notification_preferences.low_stock}
                    onChange={(e) => setEditingUser({
                      ...editingUser,
                      notification_preferences: {
                        ...editingUser.notification_preferences,
                        low_stock: e.target.checked
                      }
                    })}
                  />
                  📦 Низкие остатки
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={editingUser.notification_preferences.new_orders}
                    onChange={(e) => setEditingUser({
                      ...editingUser,
                      notification_preferences: {
                        ...editingUser.notification_preferences,
                        new_orders: e.target.checked
                      }
                    })}
                  />
                  🛒 Новые заказы
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={editingUser.notification_preferences.system_alerts}
                    onChange={(e) => setEditingUser({
                      ...editingUser,
                      notification_preferences: {
                        ...editingUser.notification_preferences,
                        system_alerts: e.target.checked
                      }
                    })}
                  />
                  ⚠️ Системные уведомления
                </label>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button onClick={() => setEditingUser(null)} className="btn btn-secondary">
              Отмена
            </button>
            <button onClick={() => updateUser(editingUser)} className="btn btn-primary">
              Сохранить
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderAddModal = () => {
    if (!showAddModal) return null;

    return (
      <div className="modal-overlay">
        <div className="modal">
          <div className="modal-header">
            <h3>Добавить пользователя Telegram</h3>
            <button onClick={() => setShowAddModal(false)} className="close-btn">✕</button>
          </div>
          <div className="modal-body">
            <div className="form-group">
              <label>Chat ID *:</label>
              <input
                type="text"
                value={newUser.chat_id}
                onChange={(e) => setNewUser({...newUser, chat_id: e.target.value})}
                className="form-control"
                placeholder="123456789"
                required
              />
            </div>
            <div className="form-group">
              <label>Username:</label>
              <input
                type="text"
                value={newUser.username || ''}
                onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                className="form-control"
                placeholder="@username"
              />
            </div>
            <div className="form-group">
              <label>Имя:</label>
              <input
                type="text"
                value={newUser.first_name || ''}
                onChange={(e) => setNewUser({...newUser, first_name: e.target.value})}
                className="form-control"
                placeholder="Имя"
              />
            </div>
            <div className="form-group">
              <label>Фамилия:</label>
              <input
                type="text"
                value={newUser.last_name || ''}
                onChange={(e) => setNewUser({...newUser, last_name: e.target.value})}
                className="form-control"
                placeholder="Фамилия"
              />
            </div>
            <div className="form-group">
              <label>Роль:</label>
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                className="form-control"
              >
                <option value="client">👤 Клиент</option>
                <option value="manager">👨‍💼 Менеджер</option>
                <option value="admin">👑 Администратор</option>
              </select>
            </div>
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={newUser.notifications_enabled}
                  onChange={(e) => setNewUser({...newUser, notifications_enabled: e.target.checked})}
                />
                Уведомления включены
              </label>
            </div>
            <div className="form-group">
              <label>Настройки уведомлений:</label>
              <div className="preferences-grid">
                <label>
                  <input
                    type="checkbox"
                    checked={newUser.notification_preferences.low_stock}
                    onChange={(e) => setNewUser({
                      ...newUser,
                      notification_preferences: {
                        ...newUser.notification_preferences,
                        low_stock: e.target.checked
                      }
                    })}
                  />
                  📦 Низкие остатки
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={newUser.notification_preferences.new_orders}
                    onChange={(e) => setNewUser({
                      ...newUser,
                      notification_preferences: {
                        ...newUser.notification_preferences,
                        new_orders: e.target.checked
                      }
                    })}
                  />
                  🛒 Новые заказы
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={newUser.notification_preferences.system_alerts}
                    onChange={(e) => setNewUser({
                      ...newUser,
                      notification_preferences: {
                        ...newUser.notification_preferences,
                        system_alerts: e.target.checked
                      }
                    })}
                  />
                  ⚠️ Системные уведомления
                </label>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button onClick={() => setShowAddModal(false)} className="btn btn-secondary">
              Отмена
            </button>
            <button onClick={createUser} className="btn btn-primary">
              Создать
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="telegram-users-manager">
      <div className="telegram-users-header">
        <h2>👥 Управление пользователями Telegram</h2>
        <div className="header-actions">
          <button onClick={loadUsers} className="btn btn-secondary" disabled={loading}>
            {loading ? '⏳' : '🔄'} Обновить
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
            ➕ Добавить пользователя
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}

      <div className="users-table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>Chat ID</th>
              <th>Пользователь</th>
              <th>Роль</th>
              <th>Статус</th>
              <th>Уведомления</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="loading-cell">
                  ⏳ Загрузка пользователей...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-cell">
                  📭 Пользователи не найдены
                </td>
              </tr>
            ) : (
              users.map(renderUserRow)
            )}
          </tbody>
        </table>
      </div>

      {renderAddModal()}
      {renderEditModal()}
    </div>
  );
};
