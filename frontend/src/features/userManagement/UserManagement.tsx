// Компонент управления пользователями

import React, { useState, useEffect } from 'react';
import { User, Department, getAllUsers, getDepartments, createUser, updateUser, deleteUser, resetUserToken, getCurrentUser, setAuthToken } from '../../api';
import { getErrorMessage } from '../../utils/errorUtils';
import { Alert } from '../../components/common';
import { useAdminBack } from '../../hooks/useAdminBack';
import './UserManagement.css';

interface UserManagementProps {
  onBack?: () => void;
}

export const UserManagement: React.FC<UserManagementProps> = ({ onBack }) => {
  const goBack = useAdminBack();
  const handleBack = onBack ?? goBack;
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState<number | ''>('');
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showTokenModal, setShowTokenModal] = useState<User | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  useEffect(() => {
    loadUsers();
    loadDepartments();
    void loadCurrentUser();
  }, []);

  const loadDepartments = async () => {
    try {
      const response = await getDepartments();
      setDepartments(response.data ?? []);
    } catch {
      setDepartments([]);
    }
  };

  const loadCurrentUser = async () => {
    try {
      const res = await getCurrentUser();
      setCurrentUserId(res.data?.id ?? null);
    } catch {
      // если токена нет/просрочен — просто не будем пытаться авто-обновлять токен при reset-token
      setCurrentUserId(null);
    }
  };

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      setErrorMessage(null);
      const response = await getAllUsers();
      setUsers(response.data);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Ошибка при загрузке пользователей'));
    } finally {
      setIsLoading(false);
    }
  };

  const filteredUsers = departmentFilter === ''
    ? users
    : users.filter(u => u.department_id === departmentFilter);

  const handleCreateUser = async (userData: { name: string; email: string; password: string; role: string; department_id?: number | null }) => {
    try {
      setErrorMessage(null);
      await createUser(userData);
      setShowCreateModal(false);
      await loadUsers();
      alert('Пользователь успешно создан');
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error, 'Ошибка при создании пользователя'));
    }
  };

  const handleUpdateUser = async (userId: number, userData: { name: string; email: string; role: string; department_id?: number | null }) => {
    try {
      setErrorMessage(null);
      await updateUser(userId, userData);
      setEditingUser(null);
      await loadUsers();
      alert('Пользователь успешно обновлен');
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error, 'Ошибка при обновлении пользователя'));
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Вы уверены, что хотите удалить этого пользователя?')) return;

    try {
      setErrorMessage(null);
      await deleteUser(userId);
      await loadUsers();
      alert('Пользователь успешно удален');
    } catch (error: unknown) {
      // Бэкенд возвращает 400, если у пользователя есть активные заказы — показываем это в интерфейсе
      setErrorMessage(getErrorMessage(error, 'Ошибка при удалении пользователя'));
    }
  };

  const handleResetToken = async (user: User) => {
    try {
      setErrorMessage(null);
      const response = await resetUserToken(user.id);
      // Если сбрасываем токен текущему пользователю — не ломаем сессию: обновляем token в storage
      if (currentUserId && currentUserId === user.id) {
        setAuthToken(response.data.api_token);
      }
      alert(`Новый API токен для ${user.name}: ${response.data.api_token}`);
      setShowTokenModal(null);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error, 'Ошибка при сбросе токена'));
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
          <button
            type="button"
            onClick={handleBack}
            className="user-management-back-btn"
          >
            ← Назад
          </button>
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

      {errorMessage && (
        <Alert type="error" className="mb-4" onClose={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}

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
          <span>Пользователи ({filteredUsers.length})</span>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value === '' ? '' : Number(e.target.value))}
            className="user-form-select"
            style={{ marginLeft: 'auto', minWidth: '160px' }}
          >
            <option value="">Все департаменты</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div className="users-loading">
            Загрузка пользователей...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="users-empty">
            {users.length === 0 ? 'Нет пользователей' : 'Нет пользователей в выбранном департаменте'}
          </div>
        ) : (
          <div className="users-scroll-container">
            {filteredUsers.map(user => (
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
                    {user.department_name && (
                      <span className="user-department-badge" title="Департамент">
                        {user.department_name}
                      </span>
                    )}
                    {user.has_api_token && (
                      <div className="user-api-badge">
                        API ✓
                      </div>
                    )}
                  </div>
                  <div className="user-details">
                    <span>📧 {user.email}</span>
                    <span>📅 {new Date(user.created_at).toLocaleDateString('ru-RU')}</span>
                    {!user.department_name && user.department_id == null && (
                      <span title="Без департамента">—</span>
                    )}
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
          departments={departments}
          onSubmit={handleCreateUser}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {/* Модальное окно редактирования пользователя */}
      {editingUser && (
        <UserFormModal
          title="Редактировать пользователя"
          departments={departments}
          initialData={{
            name: editingUser.name,
            email: editingUser.email,
            role: editingUser.role,
            department_id: editingUser.department_id ?? undefined
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
  departments: Department[];
  initialData?: { name: string; email: string; role: string; department_id?: number | null };
  onSubmit: (data: any) => void;
  onClose: () => void;
}

const UserFormModal: React.FC<UserFormModalProps> = ({
  title,
  departments,
  initialData,
  onSubmit,
  onClose
}) => {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    email: initialData?.email || '',
    password: '',
    role: initialData?.role || 'user',
    department_id: initialData?.department_id ?? '' as number | ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = { ...formData };
    payload.department_id = formData.department_id === '' ? null : Number(formData.department_id);
    onSubmit(payload);
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
          <div className="user-form-group">
            <label className="user-form-label">
              Департамент:
            </label>
            <select
              value={formData.department_id === '' ? '' : formData.department_id}
              onChange={(e) => setFormData({ ...formData, department_id: e.target.value === '' ? '' : Number(e.target.value) })}
              className="user-form-select"
            >
              <option value="">Без департамента</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
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
