import React, { useState } from 'react';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { UserManagement, DepartmentManagement } from '../../features/userManagement';
import { useAdminBack } from '../../hooks/useAdminBack';

interface SettingsPageProps {
  onBack?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onBack }) => {
  const goBack = useAdminBack();
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [showDepartmentManagement, setShowDepartmentManagement] = useState(false);

  if (showUserManagement) {
    return (
      <UserManagement onBack={() => setShowUserManagement(false)} />
    );
  }

  if (showDepartmentManagement) {
    return (
      <DepartmentManagement onBack={() => setShowDepartmentManagement(false)} />
    );
  }

  return (
    <AdminPageLayout
      title="Общие настройки"
      icon="⚙️"
      onBack={onBack ?? goBack}
      className="settings-page"
    >
      <div className="settings-content">
        <div className="settings-grid">
          <div className="setting-card">
            <h3>⚙️ Системные настройки</h3>
            <p>Основные настройки системы</p>
            <button className="btn btn-primary">Открыть</button>
          </div>

          <div className="setting-card">
            <h3>💾 Резервные копии</h3>
            <p>Управление бэкапами данных</p>
            <button className="btn btn-primary">Открыть</button>
          </div>

          <div className="setting-card">
            <h3>🏢 Департаменты</h3>
            <p>Создание и редактирование департаментов для распределения пользователей</p>
            <button
              className="btn btn-primary"
              onClick={() => setShowDepartmentManagement(true)}
            >
              Открыть
            </button>
          </div>

          <div className="setting-card">
            <h3>👥 Пользователи</h3>
            <p>Управление пользователями и правами</p>
            <button
              className="btn btn-primary"
              onClick={() => setShowUserManagement(true)}
            >
              Открыть
            </button>
          </div>
        </div>
      </div>
    </AdminPageLayout>
  );
};
