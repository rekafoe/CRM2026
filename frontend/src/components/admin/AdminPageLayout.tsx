import React from 'react';
import { useAdminBack } from '../../hooks/useAdminBack';
import '../../styles/admin-page-layout.css';

interface AdminPageLayoutProps {
  title: string;
  /** Иконка слева от заголовка (например, <AppIcon />). Без эмодзи — предпочтительно. */
  icon?: string | React.ReactNode | null;
  /** Вторая часть заголовка (например, имя клиента) — визуально мягче основного title */
  titleSuffix?: string | null;
  /** Явный callback «Назад» (приоритет над backTo и авто-иерархией) */
  onBack?: () => void;
  /** Родительский маршрут, если не задан onBack */
  backTo?: string;
  children: React.ReactNode;
  className?: string;
  /** Контент в шапке справа (например, фильтр по месяцу) */
  headerExtra?: React.ReactNode;
  /** Подзаголовок под h1 */
  description?: string;
}

export const AdminPageLayout: React.FC<AdminPageLayoutProps> = ({
  title,
  icon,
  titleSuffix,
  onBack,
  backTo,
  children,
  className = '',
  headerExtra,
  description,
}) => {
  const goBack = useAdminBack(backTo);

  return (
    <div className={`admin-page-layout ${className}`}>
      <div className="admin-page-header">
        <button type="button" onClick={onBack ?? goBack} className="back-btn">
          ← Назад
        </button>
        <div className="admin-page-header__title-block">
        <h1>
          {icon != null && <span className="admin-page-header__title-icon">{icon}</span>}
          <span className="admin-page-header__title-main">{title}</span>
          {titleSuffix && (
            <>
              <span className="admin-page-header__title-sep" aria-hidden="true" />
              <span className="admin-page-header__title-suffix" title={titleSuffix}>
                {titleSuffix}
              </span>
            </>
          )}
        </h1>
        {description ? (
          <p className="admin-page-header__description">{description}</p>
        ) : null}
        </div>
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
