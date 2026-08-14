import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getDefaultOrganization, type Organization } from '../../../api';
import { AppIcon } from '../../../components/ui/AppIcon';
import { InboxNotifications } from '../../../components/notifications/InboxNotifications';
import { useCurrentUser } from '../../../hooks/useCurrentUser';
import { useInboxNotifications } from '../../../hooks/useInboxNotifications';
import '../knowledgeBase.css';

interface KnowledgeShellProps {
  children: React.ReactNode;
}

export const KnowledgeShell: React.FC<KnowledgeShellProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useCurrentUser();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [logoError, setLogoError] = useState(false);
  const inbox = useInboxNotifications({
    enabled: Boolean(user?.id),
    onOpenPath: (path) => navigate(path),
  });
  const rawLogoUrl = organization?.logo_url;
  const logoUrl = rawLogoUrl && rawLogoUrl.length > 10
    ? (rawLogoUrl.startsWith('/') ? `${window.location.origin}${rawLogoUrl}` : rawLogoUrl)
    : null;
  const hasLogo = Boolean(
    logoUrl
    && !logoError
    && (logoUrl.startsWith('data:') || logoUrl.startsWith('http') || logoUrl.startsWith('blob:')),
  );

  useEffect(() => {
    getDefaultOrganization()
      .then((response) => setOrganization(response.data ?? null))
      .catch(() => setOrganization(null));
  }, []);

  useEffect(() => setLogoError(false), [rawLogoUrl]);

  return (
    <div className="kb-app">
      <header className="kb-topbar">
        <button type="button" className="kb-brand" onClick={() => navigate('/knowledge')}>
          <span className={`kb-brand-mark${hasLogo ? ' kb-brand-mark--logo' : ''}`}>
            {hasLogo
              ? <img src={logoUrl!} alt={organization?.name || 'Логотип организации'} onError={() => setLogoError(true)} />
              : <AppIcon name="document" size="md" />}
          </span>
          <span><strong>База знаний</strong><small>{organization?.name || 'PRINT CORE'}</small></span>
        </button>
        <nav className="kb-topnav" aria-label="Навигация базы знаний">
          <Link className={location.pathname === '/knowledge' ? 'active' : ''} to="/knowledge">Каталог</Link>
          <Link className={location.pathname === '/knowledge/new' ? 'active' : ''} to="/knowledge/new">Создать</Link>
        </nav>
        <InboxNotifications
          unreadCount={inbox.unreadCount}
          open={inbox.open}
          items={inbox.items}
          onToggle={() => inbox.setOpen((value) => !value)}
          onClose={() => inbox.setOpen(false)}
          onMarkAllRead={() => void inbox.markAllRead()}
          onOpenNotification={(notification) => void inbox.openNotification(notification)}
        />
        <div className="kb-user">
          <span className="kb-avatar">{user?.name?.charAt(0).toLocaleUpperCase('ru') || 'Я'}</span>
          <span>{user?.name || 'Пользователь'}</span>
          <button type="button" className="kb-icon-button" onClick={() => navigate('/')} title="Вернуться в CRM">
            <AppIcon name="x" size="sm" />
          </button>
        </div>
      </header>
      <main className="kb-main">{children}</main>
    </div>
  );
};
