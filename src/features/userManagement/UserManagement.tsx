// Компонент управления пользователями

import React, { useState, useEffect } from 'react';
import { User, getAllUsers, createUser, updateUser, deleteUser, resetUserToken } from '../../api';
import './UserManagement.css';

interface UserManagementProps {
  onBack?: () => void;
}

export const UserManagement: React.FC<UserManagementProps> = ({ onBack }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showTokenModal, setShowTokenModal] = useState<User | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const response = await getAllUsers();
      setUsers(response.data);
    } catch (error) {
      console.error('Error loading users:', error);
      alert('Ошибка при загрузке пользователей');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateUser = async (userData: { name: string; email: string; password: string; role: string }) => {
    try {
      await createUser(userData);
      setShowCreateModal(false);
      await loadUsers();
      alert('Пользователь успешно создан');
    } catch (error: any) {
      console.error('Error creating user:', error);
      alert(error.response?.data?.message || 'Ошибка при создании пользователя');
    }
  };

  const handleUpdateUser = async (userId: number, userData: { name: string; email: string; role: string }) => {
    try {
      await updateUser(userId, userData);
      setEditingUser(null);
      await loadUsers();
      alert('Пользователь успешно обновлен');
    } catch (error: any) {
      console.error('Error updating user:', error);
      alert(error.response?.data?.message || 'Ошибка при обновлении пользователя');
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Вы уверены, что хотите удалить этого пользователя?')) return;

    try {
      await deleteUser(userId);
      await loadUsers();
      alert('Пользователь успешно удален');
    } catch (error: any) {
      console.error('Error deleting user:', error);
      alert(error.response?.data?.message || 'Ошибка при удалении пользователя');
    }
  };

  const handleResetToken = async (user: User) => {
    try {
      const response = await resetUserToken(user.id);
      alert(`Новый API токен для ${user.name}: ${response.data.api_token}`);
      setShowTokenModal(null);
    } catch (error) {
      console.error('Error resetting token:', error);
      alert('Ошибка при сбросе токена');
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'var(--error)';
      case 'manager': return 'var(--accent-primary)';
      case 'user': return 'var(--accent-light)';
      default: return 'var(--text-secondary)';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return 'Администратор';
      case 'manager': return 'Менеджер';
      case 'user': return 'Пользователь';
      default: return role;
    }
  };

  return (
    <div className="user-management">
      {/* Заголовок */}
      <div className="user-management-header">
        <div className="user-management-header-left">
          {onBack && (
            <button
              onClick={onBack}
              className="user-management-back-btn"
            >
              ← Назад
            </button>
          )}
          <div>
            <h1 className="user-management-title">
              👥 Управление пользователями
            </h1>
            <p className="user-management-description">
              Создание, редактирование и управление пользователями системы
            </p>
          </div>
        </div>
        <div className="user-management-header-actions">
          <button
            onClick={() => setShowCreateModal(true)}
            className="user-management-create-btn"
          >
            ➕ Создать пользователя
          </button>
        </div>
      </div>

      {/* Статистика */}
      <div className="user-stats">
        <div className="user-stat-card">
          <div className="user-stat-value">
            {users.length}
          </div>
          <div className="user-stat-label">Всего пользователей</div>
        </div>
        <div className="user-stat-card">
          <div className="user-stat-value-admin">
            {users.filter(u => u.role === 'admin').length}
          </div>
          <div className="user-stat-label">Администраторов</div>
        </div>
        <div className="user-stat-card">
          <div className="user-stat-value-manager">
            {users.filter(u => u.role === 'manager').length}
          </div>
          <div className="user-stat-label">Менеджеров</div>
        </div>
        <div className="user-stat-card">
          <div className="user-stat-value-user">
            {users.filter(u => u.role === 'user').length}
          </div>
          <div className="user-stat-label">Пользователей</div>
        </div>
      </div>

      {/* Список пользователей */}
      <div className="users-list">
        <div className="users-list-header">
          Пользователи ({users.length})
        </div>

        {isLoading ? (
          <div className="users-loading">
            Загрузка пользователей...
          </div>
        ) : users.length === 0 ? (
          <div className="users-empty">
            Нет пользователей
          </div>
        ) : (
          <div className="users-scroll-container">
            {users.map(user => (
              <div
                key={user.id}
                className="user-item"
              >
                <div className="user-info">
                  <div className="user-header">
                    <div className="user-name">
                      {user.name}
                    </div>
                    <div className={`user-role-badge user-role-badge-${user.role}`}>
                      {getRoleLabel(user.role)}
                    </div>
                    {user.has_api_token && (
                      <div className="user-api-badge">
                        API ✓
                      </div>
                    )}
                  </div>
                  <div className="user-details">
                    <span>📧 {user.email}</span>
                    <span>📅 {new Date(user.created_at).toLocaleDateString('ru-RU')}</span>
                  </div>
                </div>
                <div className="user-actions">
                  <button
                    onClick={() => setEditingUser(user)}
                    className="user-edit-btn"
                  >
                    ✏️ Редактировать
                  </button>
                  <button
                    onClick={() => setShowTokenModal(user)}
                    className="user-token-btn"
                  >
                    🔑 API токен
                  </button>
                  <button
                    onClick={() => handleDeleteUser(user.id)}
                    className="user-delete-btn"
                  >
                    🗑️ Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Модальное окно создания пользователя */}
      {showCreateModal && (
        <UserFormModal
          title="Создать пользователя"
          onSubmit={handleCreateUser}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {/* Модальное окно редактирования пользователя */}
      {editingUser && (
        <UserFormModal
          title="Редактировать пользователя"
          initialData={{
            name: editingUser.name,
            email: editingUser.email,
            role: editingUser.role
          }}
          onSubmit={(data) => handleUpdateUser(editingUser.id, data)}
          onClose={() => setEditingUser(null)}
        />
      )}

      {/* Модальное окно API токена */}
      {showTokenModal && (
        <div className="user-modal-overlay">
          <div className="user-modal">
            <div className="user-modal-header">
              <h3 className="user-modal-title">
                🔑 Управление API токеном
              </h3>
              <button
                onClick={() => setShowTokenModal(null)}
                className="user-modal-close"
              >
                ×
              </button>
            </div>
            <div className="user-modal-body">
              <p className="user-modal-description">
                Пользователь: <strong>{showTokenModal.name}</strong>
              </p>
              <p className="user-modal-text">
                {showTokenModal.has_api_token ?
                  'У пользователя есть активный API токен. Вы можете сбросить его и сгенерировать новый.' :
                  'У пользователя нет API токена. Сброс создаст новый токен.'
                }
              </p>
              <div className="user-form-actions">
                <button
                  onClick={() => setShowTokenModal(null)}
                  className="user-btn-secondary"
                >
                  Отмена
                </button>
                <button
                  onClick={() => handleResetToken(showTokenModal)}
                  className="user-btn-primary"
                >
                  🔄 Сбросить токен
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Компонент формы пользователя
interface UserFormModalProps {
  title: string;
  initialData?: { name: string; email: string; role: string };
  onSubmit: (data: any) => void;
  onClose: () => void;
}

const UserFormModal: React.FC<UserFormModalProps> = ({
  title,
  initialData,
  onSubmit,
  onClose
}) => {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    email: initialData?.email || '',
    password: '',
    role: initialData?.role || 'user'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="user-modal-overlay">
      <div className="user-modal">
        <div className="user-modal-header">
          <h3 className="user-modal-title">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="user-modal-close"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="user-form">
          <div className="user-form-group">
            <label className="user-form-label">
              Имя:
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="user-form-input"
            />
          </div>
          <div className="user-form-group">
            <label className="user-form-label">
              Email:
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              className="user-form-input"
            />
          </div>
          {!initialData && (
            <div className="user-form-group">
              <label className="user-form-label">
                Пароль:
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required={!initialData}
                className="user-form-input"
              />
            </div>
          )}
          <div className="user-form-group">
            <label className="user-form-label">
              Роль:
            </label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="user-form-select"
            >
              <option value="user">Пользователь</option>
              <option value="manager">Менеджер</option>
              <option value="admin">Администратор</option>
            </select>
          </div>
          <div className="user-form-actions">
            <button
              type="button"
              onClick={onClose}
              className="user-btn-secondary"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="user-btn-primary"
            >
              {initialData ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
