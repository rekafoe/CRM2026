import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../Logo.tsx';
import { AppIcon } from '../ui/AppIcon';
import type { Organization } from '../../api';
import './TopBar.css';

interface TopBarProps {
  organization?: Organization | null;
  contextDate: string;
  currentUserName: string;
  isAdmin: boolean;
  onShowPageSwitcher: () => void;
  onShowOrderPool: () => void;
  onShowCountersPage: () => void;
  onLogout: () => void;
  /** Новый заказ с сайта/TG в пуле — показываем зелёный бейдж "new" */
  hasNewPoolOrder?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  organization,
  contextDate,
  currentUserName,
  isAdmin,
  onShowPageSwitcher,
  onShowOrderPool,
  onShowCountersPage,
  onLogout,
  hasNewPoolOrder = false,
}) => {
  const navigate = useNavigate();
  const rawLogoUrl = organization?.logo_url;
  const logoUrl = rawLogoUrl && typeof rawLogoUrl === 'string' && rawLogoUrl.length > 10
    ? (rawLogoUrl.startsWith('/') ? `${window.location.origin}${rawLogoUrl}` : rawLogoUrl)
    : null;
  const isDataOrHttp = logoUrl &&
    (logoUrl.startsWith('data:') || logoUrl.startsWith('http') || logoUrl.startsWith('blob:'));
  const [logoError, setLogoError] = React.useState(false);
  React.useEffect(() => setLogoError(false), [rawLogoUrl]);
  const hasLogo = isDataOrHttp && !logoError;
  return (
    <div className="app-topbar">
      <div className="topbar-logo">
        {hasLogo ? (
          <div className="topbar-org">
            <img
              src={logoUrl!}
              alt={organization!.name || 'Лого'}
              className="topbar-org-logo"
              onError={() => setLogoError(true)}
            />
            {organization?.name && <span className="topbar-org-name">{organization.name}</span>}
          </div>
        ) : (
          <div className="topbar-org topbar-org--fallback">
            <Logo size="small" showText={false} />
            {organization?.name && <span className="topbar-org-name">{organization.name}</span>}
          </div>
        )}
      </div>
      <div className="topbar-info">
        <button 
          className="chip chip--clickable" 
          onClick={onShowPageSwitcher} 
          title="Переключиться между страницами заказов" 
          aria-label="Переключиться между страницами заказов"
        >
          <AppIcon name="calendar" size="xs" /> {contextDate} · <AppIcon name="user" size="xs" /> {currentUserName}
        </button>
      </div>
      <div className="topbar-actions">
        <button 
          onClick={onShowOrderPool}
          title="Пул заказов" 
          aria-label="Пул заказов" 
          className="app-icon-btn app-icon-btn--with-label app-icon-btn--pool"
        >
          <span className="app-icon-btn__icon" aria-hidden="true"><AppIcon name="clipboard" size="sm" /></span>
          <span className="app-icon-btn__label">Пул заказов</span>
          {hasNewPoolOrder && <span className="pool-badge pool-badge--new">new</span>}
        </button>
        <button 
          onClick={onShowCountersPage}
          title="Счётчики принтеров и кассы" 
          aria-label="Счётчики принтеров и кассы" 
          className="app-icon-btn app-icon-btn--with-label"
        >
          <span className="app-icon-btn__icon" aria-hidden="true"><AppIcon name="chart-bar" size="sm" /></span>
          <span className="app-icon-btn__label">Счётчики</span>
        </button>
        <button
          onClick={() => navigate('/earnings')}
          title="Мои проценты"
          aria-label="Мои проценты"
          className="app-icon-btn app-icon-btn--with-label"
        >
          <span className="app-icon-btn__icon" aria-hidden="true"><AppIcon name="money" size="sm" /></span>
          <span className="app-icon-btn__label">Мои проценты</span>
        </button>
        <button
          onClick={() => navigate('/clients')}
          title="Клиенты CRM"
          aria-label="Клиенты CRM"
          className="app-icon-btn app-icon-btn--with-label"
        >
          <span className="app-icon-btn__icon" aria-hidden="true"><AppIcon name="users" size="sm" /></span>
          <span className="app-icon-btn__label">Клиенты</span>
        </button>
        {isAdmin && (
          <>
            <button 
              onClick={() => window.location.href = '/adminpanel/reports'}
              title="Аналитика и отчёты" 
              aria-label="Аналитика и отчёты" 
              className="app-icon-btn app-icon-btn--with-label"
            >
              <span className="app-icon-btn__icon" aria-hidden="true"><AppIcon name="chart-up" size="sm" /></span>
              <span className="app-icon-btn__label">Отчёты</span>
            </button>
            <button 
              onClick={() => window.location.href = '/adminpanel'}
              title="Админ панель" 
              aria-label="Админ панель" 
              className="app-icon-btn"
            >
              <AppIcon name="settings" size="sm" />
            </button>
          </>
        )}
        <button onClick={onLogout} title="Выйти" aria-label="Выйти" className="app-icon-btn">
          <AppIcon name="power" size="sm" />
        </button>
      </div>
      
    </div>
  );
};
