import React from 'react';
import '../../styles/admin-page-layout.css';

interface AdminPageLayoutProps {
  title: string;
  icon: string;
  onBack: () => void;
  children: React.ReactNode;
  className?: string;
  /** Контент в шапке справа (например, фильтр по месяцу) */
  headerExtra?: React.ReactNode;
}

export const AdminPageLayout: React.FC<AdminPageLayoutProps> = ({
  title,
  icon,
  onBack,
  children,
  className = '',
  headerExtra
}) => {
  return (
    <div className={`admin-page-layout ${className}`}>
      <div className="admin-page-header">
        <button onClick={onBack} className="back-btn">
          ← Назад
        </button>
        <h1>
          {icon} {title}
        </h1>
        {headerExtra != null && (
          <div className="admin-page-header__extra">
            {headerExtra}
          </div>
        )}
      </div>
      <div className="admin-page-content">
        {children}
      </div>
    </div>
  );
};
