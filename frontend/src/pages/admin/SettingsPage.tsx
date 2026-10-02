import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { Alert, FormField } from '../../components/common';
import { AppIcon, type IconName } from '../../components/ui';
import { DepartmentManagement, UserManagement } from '../../features/userManagement';
import { useAdminBack } from '../../hooks/useAdminBack';
import { getCustomCalculatorPercent, updateCustomCalculatorPercent } from '../../api';
import { PostalCarrierSettings } from './PostalCarrierSettings';
import './SettingsPage.css';

interface SettingsPageProps {
  onBack?: () => void;
}

type SectionId = 'team' | 'delivery' | 'payroll' | 'production' | 'documents' | 'communication';
type TeamTab = 'users' | 'departments';

const SECTIONS: Array<{ id: SectionId; title: string; hint: string; icon: IconName }> = [
  { id: 'team', title: 'Команда', hint: 'Сотрудники и точки', icon: 'users' },
  { id: 'delivery', title: 'Доставка', hint: 'Белпочта и Европочта', icon: 'package' },
  { id: 'payroll', title: 'Начисления', hint: 'Процент произвольного калькулятора', icon: 'briefcase' },
  { id: 'production', title: 'Производство', hint: 'Калькулятор и оборудование', icon: 'wrench' },
  { id: 'documents', title: 'Документы', hint: 'Шаблоны и юрлица', icon: 'document' },
  { id: 'communication', title: 'Связь', hint: 'Почта и уведомления', icon: 'bell' },
];

const SECTION_IDS = new Set<string>(SECTIONS.map((section) => section.id));

function isSection(value: string | null): value is SectionId {
  return !!value && SECTION_IDS.has(value);
}

function sectionFromLocation(pathname: string, hash: string, param: string | null): SectionId {
  if (isSection(param)) return param;
  if (hash === '#postal-carriers') return 'delivery';
  if (pathname.endsWith('/order-templates')) return 'communication';
  return 'team';
}

type SettingsLink = {
  title: string;
  description: string;
  to: string;
  icon: IconName;
};

const PRODUCTION_LINKS: SettingsLink[] = [
  {
    title: 'Продукты калькулятора',
    description: 'Типы изделий, шаблоны и техпроцесс.',
    to: '/adminpanel/products',
    icon: 'puzzle',
  },
  {
    title: 'Операции',
    description: 'Постпечатные услуги и проценты операторов.',
    to: '/adminpanel/services-management',
    icon: 'wrench',
  },
  {
    title: 'Плоттерная резка',
    description: 'Тарифы рулона и листа, выборка и накатка.',
    to: '/adminpanel/plotter-cutting',
    icon: 'scissors',
  },
  {
    title: 'Принтеры',
    description: 'Оборудование и привязка к печати.',
    to: '/adminpanel/printers',
    icon: 'printer',
  },
  {
    title: 'Ценообразование',
    description: 'Обзор формул и переход к продуктам калькулятора.',
    to: '/adminpanel/pricing',
    icon: 'chart-up',
  },
];

const DOCUMENT_LINKS: SettingsLink[] = [
  {
    title: 'Шаблоны документов',
    description: 'Договоры, счета и бланки для клиента.',
    to: '/adminpanel/document-templates',
    icon: 'clipboard',
  },
  {
    title: 'Организации и чеки',
    description: 'Юрлица, УНП и реквизиты для оплаты.',
    to: '/adminpanel/organizations',
    icon: 'building',
  },
  {
    title: 'Шаблоны дизайна',
    description: 'Каталог макетов редактора.',
    to: '/adminpanel/design-templates',
    icon: 'image',
  },
  {
    title: 'Префлайт',
    description: 'Проверка макетов перед печатью.',
    to: '/adminpanel/preflight',
    icon: 'layers',
  },
];

const COMMUNICATION_LINKS: SettingsLink[] = [
  {
    title: 'Уведомления',
    description: 'Все каналы оповещений внутри CRM.',
    to: '/adminpanel/notifications',
    icon: 'bell',
  },
  {
    title: 'Почта заказов',
    description: 'SMTP и письма при смене статуса заказа.',
    to: '/adminpanel/notifications?tab=client',
    icon: 'document',
  },
  {
    title: 'Рассылка',
    description: 'Кампании, сегменты и журнал отправки.',
    to: '/adminpanel/notifications?tab=campaigns',
    icon: 'bell-ring',
  },
];

export const SettingsPage: React.FC<SettingsPageProps> = ({ onBack }) => {
  const goBack = useAdminBack();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const section = sectionFromLocation(location.pathname, location.hash, searchParams.get('section'));
  const teamParam = searchParams.get('team');
  const teamTab: TeamTab = teamParam === 'departments' ? 'departments' : 'users';

  const active = useMemo(
    () => SECTIONS.find((item) => item.id === section) ?? SECTIONS[0],
    [section],
  );

  const openSection = (next: SectionId) => {
    const params: Record<string, string> = { section: next };
    if (next === 'team') params.team = teamTab;
    setSearchParams(params);
  };

  const openTeam = (next: TeamTab) => {
    setSearchParams({ section: 'team', team: next });
  };

  useEffect(() => {
    if (location.hash !== '#postal-carriers' || section !== 'delivery') return;
    document.getElementById('postal-carriers')?.scrollIntoView({ block: 'start' });
  }, [location.hash, section]);

  return (
    <AdminPageLayout
      title="Настройки"
      description="Доступы, команда и разделы, которые задают работу CRM."
      icon={<AppIcon name="settings" size="lg" />}
      onBack={onBack ?? goBack}
      className="settings-page"
    >
      <div className="settings-shell">
        <nav className="settings-nav" aria-label="Категории настроек">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`settings-nav__btn${item.id === section ? ' settings-nav__btn--active' : ''}`}
              onClick={() =>openSection(item.id)}
              aria-current={item.id === section ? 'page' : undefined}
            >
              <span className="settings-nav__icon">
                <AppIcon name={item.icon} size="sm" />
              </span>
              <span className="settings-nav__text">
                <span className="settings-nav__title">{item.title}</span>
                <span className="settings-nav__hint">{item.hint}</span>
              </span>
            </button>
          ))}
        </nav>

        <section className="settings-panel" aria-labelledby="settings-panel-title">
          <header className="settings-panel__header">
            <h2 id="settings-panel-title">{active.title}</h2>
            <p>{active.hint}</p>
          </header>

          {section === 'team' && (
            <>
              <div className="settings-subtabs" role="tablist" aria-label="Команда">
                <button
                  type="button"
                  role="tab"
                  aria-selected={teamTab === 'users'}
                  className={`lg-btn${teamTab === 'users' ? ' lg-btn--primary' : ''}`}
                  onClick={() =>openTeam('users')}
                >
                  Пользователи
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={teamTab === 'departments'}
                  className={`lg-btn${teamTab === 'departments' ? ' lg-btn--primary' : ''}`}
                  onClick={() =>openTeam('departments')}
                >
                  Точки и департаменты
                </button>
              </div>
              {teamTab === 'users' ? <UserManagement embedded /> : <DepartmentManagement embedded />}
            </>
          )}

          {section === 'delivery' && <PostalCarrierSettings />}

          {section === 'payroll' && <PayrollSettings onOpenEarnings={() => navigate('/adminpanel/earnings')} />}

          {section === 'production' && (
            <SettingsLinkGrid links={PRODUCTION_LINKS} onOpen={(to) => navigate(to)} />
          )}

          {section === 'documents' && (
            <SettingsLinkGrid links={DOCUMENT_LINKS} onOpen={(to) => navigate(to)} />
          )}

          {section === 'communication' && (
            <SettingsLinkGrid links={COMMUNICATION_LINKS} onOpen={(to) => navigate(to)} />
          )}
        </section>
      </div>
    </AdminPageLayout>
  );
};

const PayrollSettings: React.FC<{ onOpenEarnings: () => void }> = ({ onOpenEarnings }) => {
  const [value, setValue] = useState('17.5');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCustomCalculatorPercent()
      .then((response) => {
        const next = Number(response.data?.operatorPercent);
        if (Number.isFinite(next)) setValue(String(next));
      })
      .catch(() => {
        setError('Процент видит авторизованный пользователь. Сохраняет его администратор.');
      });
  }, []);

  const save = async () => {
    const numeric = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
      setError('Процент должен быть от 0 до 100');
      setMessage(null);
      return;
    }
    try {
      setSaving(true);
      setError(null);
      setMessage(null);
      const response = await updateCustomCalculatorPercent(numeric);
      setValue(String(response.data.operatorPercent));
      setMessage('Сохранено. Новые произвольные позиции и пересчёт процентов берут это число.');
    } catch (reason: any) {
      setError(reason?.response?.data?.message || 'Не удалось сохранить процент');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-payroll">
      <p className="settings-lead">
        Доля оператора с произвольных позиций. Обычные продукты и постпечать берут свои проценты из карточек услуг.
      </p>
      {error ? <Alert type="error">{error}</Alert> : null}
      {message ? <Alert type="success">{message}</Alert> : null}
      <div className="settings-payroll__row">
        <FormField label="Процент оператора">
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            className="settings-input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </FormField>
        <button type="button" className="lg-btn lg-btn--primary" onClick={save} disabled={saving}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
      <button type="button" className="settings-text-link" onClick={onOpenEarnings}>
        Начисления, часы и аналитика сотрудников
      </button>
    </div>
  );
};

const SettingsLinkGrid: React.FC<{ links: SettingsLink[]; onOpen: (to: string) => void }> = ({ links, onOpen }) => (
  <div className="settings-links">
    {links.map((link) => (
      <button key={link.to} type="button" className="settings-link" onClick={() =>onOpen(link.to)}>
        <span className="settings-link__icon">
          <AppIcon name={link.icon} size="md" circle />
        </span>
        <span className="settings-link__body">
          <strong>{link.title}</strong>
          <span>{link.description}</span>
        </span>
      </button>
    ))}
  </div>
);
