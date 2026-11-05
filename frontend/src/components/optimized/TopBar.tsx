import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppIcon } from '../ui/AppIcon';
import type { Organization } from '../../api';
import type { InboxNotification } from '../../api';
import { InboxNotifications } from '../notifications/InboxNotifications';
import {
  CRM_APPEARANCE_EVENT,
  currentAppearanceUserId,
  readCrmAppearance,
  saveCrmAppearance,
  type CrmTheme,
} from '../../hooks/useCrmAppearance';
import './TopBar.css';

interface TopBarProps {
  organization?: Organization | null;
  contextDate: string;
  currentUserName: string;
  isAdmin: boolean;
  onShowPageSwitcher: () => void;
  onShowOrderPool: () => void;
  onShowSupportChats?: () => void;
  onShowCountersPage: () => void;
  onLogout: () => void;
  /** Новый заказ с сайта/TG в пуле — статичный штамп «new» */
  hasNewPoolOrder?: boolean;
  supportAttentionCount?: number;
  inboxUnreadCount?: number;
  inboxOpen?: boolean;
  inboxItems?: InboxNotification[];
  onInboxToggle?: () => void;
  onInboxClose?: () => void;
  onInboxMarkAllRead?: () => void;
  onInboxOpenNotification?: (notification: InboxNotification) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  organization,
  contextDate,
  currentUserName,
  isAdmin,
  onShowPageSwitcher,
  onShowOrderPool,
  onShowSupportChats,
  onShowCountersPage,
  onLogout,
  hasNewPoolOrder = false,
  supportAttentionCount = 0,
  inboxUnreadCount = 0,
  inboxOpen = false,
  inboxItems = [],
  onInboxToggle,
  onInboxClose,
  onInboxMarkAllRead,
  onInboxOpenNotification,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = React.useState(false);
  const profileRef = React.useRef<HTMLDivElement>(null);
  const orgName = organization?.name?.trim() || '';

  React.useEffect(() => {
    if (!profileOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [profileOpen]);

  const sectionActive = (path: string) => {
    if (path === '/adminpanel/reports') return location.pathname.startsWith('/adminpanel/reports');
    if (path === '/adminpanel') {
      return location.pathname.startsWith('/adminpanel') && !location.pathname.startsWith('/adminpanel/reports');
    }
    if (path === '/knowledge') return location.pathname.startsWith('/knowledge');
    return location.pathname === path;
  };

  const [theme, setTheme] = React.useState<CrmTheme>(() => readCrmAppearance(currentAppearanceUserId()).theme);

  React.useEffect(() => {
    const sync = () => setTheme(readCrmAppearance(currentAppearanceUserId()).theme);
    window.addEventListener(CRM_APPEARANCE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CRM_APPEARANCE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const chooseTheme = (next: CrmTheme) => {
    saveCrmAppearance(currentAppearanceUserId(), { theme: next, density: 'regular' });
  };

  return (
    <header className="app-topbar">
      <div className="pc-topbar__brand" title={orgName || 'CRM'}>
        <span className="pc-topbar__mark" aria-hidden="true" />
        <span className="pc-topbar__brand-text">
          CRM
          {orgName ? <span className="pc-topbar__org"> · {orgName}</span> : null}
        </span>
      </div>

      <button
        type="button"
        className="pc-topbar__context"
        onClick={onShowPageSwitcher}
        title="Переключиться между страницами заказов"
        aria-label="Переключиться между страницами заказов"
      >
        <AppIcon name="calendar" size="xs" />
        <span>{contextDate}</span>
        <span className="pc-topbar__context-sep" aria-hidden="true">·</span>
        <AppIcon name="user" size="xs" />
        <span>{currentUserName}</span>
      </button>

      <nav className="pc-topbar__nav" aria-label="Разделы">
        <button
          type="button"
          className={navClass(sectionActive('/order-pool'))}
          onClick={onShowOrderPool}
          title="Пул заказов"
          aria-label="Пул заказов"
          aria-current={sectionActive('/order-pool') ? 'page' : undefined}
        >
          <AppIcon name="clipboard" size="sm" />
          <span>Пул заказов</span>
          {hasNewPoolOrder ? <span className="pc-pool-stamp">new</span> : null}
        </button>
        {onShowSupportChats ? (
          <button
            type="button"
            className="pc-nav-btn"
            onClick={onShowSupportChats}
            title={supportAttentionCount > 0 ? `Чаты: ${supportAttentionCount} ждут внимания` : 'Чаты'}
            aria-label={supportAttentionCount > 0 ? `Чаты, ждут внимания: ${supportAttentionCount}` : 'Чаты'}
          >
            <AppIcon name="message" size="sm" />
            <span>Чаты</span>
            {supportAttentionCount > 0 ? (
              <span className="pc-count-stamp">{supportAttentionCount > 99 ? '99+' : supportAttentionCount}</span>
            ) : null}
          </button>
        ) : null}
        <button
          type="button"
          className="pc-nav-btn"
          onClick={onShowCountersPage}
          title="Счётчики принтеров и кассы"
          aria-label="Счётчики принтеров и кассы"
        >
          <AppIcon name="chart-bar" size="sm" />
          <span>Счётчики</span>
        </button>
        <button
          type="button"
          className={navClass(sectionActive('/earnings'))}
          onClick={() => navigate('/earnings')}
          title="Мои проценты"
          aria-label="Мои проценты"
          aria-current={sectionActive('/earnings') ? 'page' : undefined}
        >
          <AppIcon name="money" size="sm" />
          <span>Мои проценты</span>
        </button>
        <button
          type="button"
          className={navClass(sectionActive('/clients'))}
          onClick={() => navigate('/clients')}
          title="Клиенты CRM"
          aria-label="Клиенты CRM"
          aria-current={sectionActive('/clients') ? 'page' : undefined}
        >
          <AppIcon name="users" size="sm" />
          <span>Клиенты</span>
        </button>
        <button
          type="button"
          className={navClass(sectionActive('/knowledge'))}
          onClick={() => navigate('/knowledge')}
          title="База знаний"
          aria-label="База знаний"
          aria-current={sectionActive('/knowledge') ? 'page' : undefined}
        >
          <AppIcon name="document" size="sm" />
          <span>База знаний</span>
        </button>
        {isAdmin ? (
          <>
            <button
              type="button"
              className={navClass(sectionActive('/adminpanel/reports'))}
              onClick={() => { window.location.href = '/adminpanel/reports'; }}
              title="Аналитика и отчёты"
              aria-label="Аналитика и отчёты"
              aria-current={sectionActive('/adminpanel/reports') ? 'page' : undefined}
            >
              <AppIcon name="chart-up" size="sm" />
              <span>Отчёты</span>
            </button>
          </>
        ) : null}
      </nav>

      <div className="pc-topbar__tools">
        <div className="pc-profile" ref={profileRef}>
          <button
            type="button"
            className="pc-icon-btn"
            title="Профиль"
            aria-label="Профиль"
            aria-expanded={profileOpen}
            aria-haspopup="menu"
            onClick={() => setProfileOpen((open) => !open)}
          >
            <AppIcon name="user" size="sm" />
          </button>
          {profileOpen ? (
            <div className="pc-profile__menu" role="menu" aria-label="Профиль">
              <div className="pc-profile__heading">Оформление</div>
              <div className="pc-profile__group" role="radiogroup" aria-label="Тема">
                <button type="button" role="radio" aria-checked={theme === 'light'} className={theme === 'light' ? 'is-selected' : ''} onClick={() => chooseTheme('light')}>
                  Светлая
                </button>
                <button type="button" role="radio" aria-checked={theme === 'powder'} className={theme === 'powder' ? 'is-selected' : ''} onClick={() => chooseTheme('powder')}>
                  Пудра
                </button>
                <button type="button" role="radio" aria-checked={theme === 'dark'} className={theme === 'dark' ? 'is-selected' : ''} onClick={() => chooseTheme('dark')}>
                  Deep Ink
                </button>
              </div>
              <div className="pc-profile__group" role="radiogroup" aria-label="Плотность">
                <button type="button" role="radio" aria-checked="true" className="is-selected" onClick={() => chooseTheme(theme)}>
                  Обычная
                </button>
                <button type="button" role="radio" aria-checked="false" disabled title="Пока недоступно">
                  Компактная
                </button>
              </div>
              <button
                type="button"
                className="pc-profile__logout"
                role="menuitem"
                onClick={() => {
                  setProfileOpen(false);
                  onLogout();
                }}
              >
                <AppIcon name="power" size="xs" />
                Выйти
              </button>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="pc-icon-btn"
          title="Выйти"
          aria-label="Выйти"
          onClick={onLogout}
        >
          <AppIcon name="power" size="sm" />
        </button>
        {isAdmin ? (
          <button
            type="button"
            className={navClass(sectionActive('/adminpanel'), true)}
            onClick={() => { window.location.href = '/adminpanel'; }}
            title="Админ панель"
            aria-label="Админ панель"
            aria-current={sectionActive('/adminpanel') ? 'page' : undefined}
          >
            <AppIcon name="settings" size="sm" />
          </button>
        ) : null}
        {onInboxToggle && onInboxClose && onInboxMarkAllRead && onInboxOpenNotification ? (
          <InboxNotifications
            unreadCount={inboxUnreadCount}
            open={inboxOpen}
            items={inboxItems}
            onToggle={onInboxToggle}
            onClose={onInboxClose}
            onMarkAllRead={onInboxMarkAllRead}
            onOpenNotification={onInboxOpenNotification}
          />
        ) : null}
      </div>
    </header>
  );
};

function navClass(active: boolean, iconOnly = false): string {
  return ['pc-nav-btn', active ? 'is-active' : '', iconOnly ? 'pc-nav-btn--icon' : ''].filter(Boolean).join(' ');
}
