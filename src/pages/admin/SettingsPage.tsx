import React, { useState } from 'react';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { UserManagement } from '../../features/userManagement';

interface SettingsPageProps {
  onBack: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onBack }) => {
  const [showUserManagement, setShowUserManagement] = useState(false);

  if (showUserManagement) {
    return (
      <UserManagement onBack={() => setShowUserManagement(false)} />
    );
  }

  return (
    <AdminPageLayout
      title="Общие настройки"
      icon="⚙️"
      onBack={onBack}
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
