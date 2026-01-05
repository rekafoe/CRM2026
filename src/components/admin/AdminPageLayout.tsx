import React from 'react';
import '../../styles/admin-page-layout.css';

interface AdminPageLayoutProps {
  title: string;
  icon: string;
  onBack: () => void;
  children: React.ReactNode;
  className?: string;
}

export const AdminPageLayout: React.FC<AdminPageLayoutProps> = ({
  title,
  icon,
  onBack,
  children,
  className = ''
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
      </div>
      <div className="admin-page-content">
        {children}
      </div>
    </div>
  );
};
