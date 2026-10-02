import React, { lazy, Suspense, useMemo } from 'react';
import { Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AdminPageLayout } from '../components/admin/AdminPageLayout';
import { useAdminBack } from '../hooks/useAdminBack';
import { NotificationsManager } from '../components/notifications/NotificationsManager';
import { DailyActivityOverview } from '../components/admin/DailyActivityOverview';
import SystemFeaturesPanel from '../components/admin/SystemFeaturesPanel';
import { AppIcon, type IconName } from '../components/ui/AppIcon';
import '../styles/admin-panel.css';
import '../components/notifications/NotificationsManager.css';
import './NotificationsPage.css';
import './admin/SettingsPage.css';
const LoadingFallback: React.FC = () => (
  <div className="loading-overlay">Загрузка...</div>
);

const ProductManagementPage = lazy(() => import('./admin/ProductManagementPage'));
const ProductTemplatePage = lazy(() => import('../features/productTemplate/ProductTemplatePage'));
const ProductTechProcessPage = lazy(() => import('./admin/ProductTechProcessPage'));
const ProductEditPage = lazy(() => import('./admin/ProductEditPage'));
const AdminReportsPage = lazy(() =>
  import('./AdminReportsPage').then((m) => ({ default: m.AdminReportsPage }))
);
const ReportsPage = lazy(() =>
  import('./admin/ReportsPage').then((m) => ({ default: m.ReportsPage }))
);
const EarningsAdminPage = lazy(() =>
  import('./admin/EarningsAdminPage').then((m) => ({ default: m.EarningsAdminPage }))
);
const WarehousePage = lazy(() =>
  import('./admin/WarehousePage').then((m) => ({ default: m.WarehousePage }))
);
const PricingPage = lazy(() =>
  import('./admin/PricingPage').then((m) => ({ default: m.PricingPage }))
);
const PrintersPage = lazy(() => import('./admin/PrintersPage'));
const PrintPriceEditPage = lazy(() => import('./admin/PrintPriceEditPage'));
const CountersServicePage = lazy(() => import('./admin/CountersServicePage'));
const CustomersAdminPage = lazy(() =>
  import('./admin/CustomersAdminPage').then((m) => ({ default: m.default }))
);
const CustomerDetailPage = lazy(() => import('./admin/CustomerDetailPage'));
const DocumentTemplatesPage = lazy(() => import('./admin/DocumentTemplatesPage'));
const OrganizationsPage = lazy(() => import('./admin/OrganizationsPage'));
const SettingsPage = lazy(() =>
  import('./admin/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
const UserManagement = lazy(() =>
  import('../features/userManagement').then((m) => ({ default: m.UserManagement }))
);
const PreflightPage = lazy(() =>
  import('./admin/PreflightPage').then((m) => ({ default: m.PreflightPage }))
);
const InboxFunnelPlanPage = lazy(() =>
  import('./admin/InboxFunnelPlanPage').then((m) => ({ default: m.InboxFunnelPlanPage }))
);
const ServicesManagementPage = lazy(() =>
  import('./admin/ServicesManagementPage').then((m) => ({ default: m.ServicesManagementPage }))
);
const PlotterCuttingSettingsPage = lazy(() =>
  import('./admin/PlotterCuttingSettingsPage').then((m) => ({ default: m.PlotterCuttingSettingsPage }))
);
const AdminProductManager = lazy(() =>
  import('../components/calculator/AdminProductManager').then((m) => ({ default: m.AdminProductManager }))
);
const DesignTemplatesPage = lazy(() =>
  import('./admin/DesignTemplatesPage').then((m) => ({ default: m.DesignTemplatesPage }))
);
const DesignFontsPage = lazy(() =>
  import('./admin/DesignFontsPage').then((m) => ({ default: m.DesignFontsPage }))
);
const DesignAssetsPage = lazy(() =>
  import('./admin/DesignAssetsPage').then((m) => ({ default: m.DesignAssetsPage }))
);
const DesignEditorPage = lazy(() =>
  import('./admin/DesignEditorPage').then((m) => ({ default: m.DesignEditorPage }))
);
const PostalTrackingPage = lazy(() =>
  import('./admin/PostalTrackingPage').then((m) => ({ default: m.PostalTrackingPage }))
);
const ExpensesPage = lazy(() =>
  import('../features/expenses/ExpensesPage').then((m) => ({ default: m.ExpensesPage }))
);

const DESIGN_TEMPLATES_CATALOG = '/adminpanel/design-templates';

// Компонент страницы уведомлений (исправлен - убраны инлайн стили)
const NotificationsPage: React.FC = () => {
  const goBack = useAdminBack();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  const title = tab === 'client' ? 'Почта заказов' : tab === 'campaigns' ? 'Рассылка' : 'Уведомления';
  const description = tab === 'client'
    ? 'SMTP и письма при смене статуса заказа.'
    : tab === 'campaigns'
      ? 'Кампании, сегменты и журнал отправки.'
      : 'Остатки, Telegram и служебные оповещения.';
  const iconName = tab === 'client' ? 'document' : tab === 'campaigns' ? 'bell-ring' : 'bell';

  return (
    <AdminPageLayout
      title={title}
      description={description}
      icon={<AppIcon name={iconName} size="lg" />}
      onBack={goBack}
      className="notifications-layout"
    >
      <NotificationsManager />
    </AdminPageLayout>
  );
};

type AdminGroupId = 'overview' | 'work' | 'production' | 'clients' | 'design' | 'communication' | 'settings' | 'plan';

type AdminLink = {
  title: string;
  description: string;
  to: string;
  icon: IconName;
};

const ADMIN_GROUPS: Array<{ id: AdminGroupId; title: string; hint: string; icon: IconName; links?: AdminLink[] }> = [
  { id: 'overview', title: 'Обзор', hint: 'Заказы и выручка по дням', icon: 'chart' },
  {
    id: 'work',
    title: 'Работа',
    hint: 'Заказы, деньги, доставка',
    icon: 'briefcase',
    links: [
      { title: 'Отчеты', description: 'Аналитика, выручка и дневные отчёты.', to: '/adminpanel/reports', icon: 'chart' },
      { title: 'Расходы', description: 'Операционные расходы по департаментам.', to: '/adminpanel/expenses', icon: 'receipt' },
      { title: 'Проценты', description: 'Начисления сотрудников, часы и аналитика.', to: '/adminpanel/earnings', icon: 'briefcase' },
      { title: 'Счётчики', description: 'Касса и принтеры по дням.', to: '/adminpanel/counters', icon: 'receipt' },
      { title: 'Доставка', description: 'Белпочта и Европочта: статус и история.', to: '/adminpanel/deliveries', icon: 'package' },
    ],
  },
  {
    id: 'production',
    title: 'Производство',
    hint: 'Калькулятор и склад',
    icon: 'wrench',
    links: [
      { title: 'Материалы', description: 'Склад, остатки и поставщики.', to: '/adminpanel/materials', icon: 'package' },
      { title: 'Продукты калькулятора', description: 'Типы изделий, шаблоны и техпроцесс.', to: '/adminpanel/products', icon: 'puzzle' },
      { title: 'Операции', description: 'Постпечатные услуги и проценты операторов.', to: '/adminpanel/services-management', icon: 'wrench' },
      { title: 'Плоттерная резка', description: 'Тарифы рулона и листа, выборка и накатка.', to: '/adminpanel/plotter-cutting', icon: 'scissors' },
      { title: 'Принтеры', description: 'Оборудование и привязка к печати.', to: '/adminpanel/printers', icon: 'printer' },
      { title: 'Ценообразование', description: 'Обзор формул и переход к продуктам.', to: '/adminpanel/pricing', icon: 'chart-up' },
    ],
  },
  {
    id: 'clients',
    title: 'Клиенты',
    hint: 'База и юрлица',
    icon: 'users',
    links: [
      { title: 'Клиенты', description: 'База клиентов и история заказов.', to: '/adminpanel/clients', icon: 'users' },
      { title: 'Организации и чеки', description: 'Юрлица, УНП и реквизиты для оплаты.', to: '/adminpanel/organizations', icon: 'building' },
    ],
  },
  {
    id: 'design',
    title: 'Макеты',
    hint: 'Документы и редактор',
    icon: 'image',
    links: [
      { title: 'Шаблоны документов', description: 'Договоры, счета и бланки для клиента.', to: '/adminpanel/document-templates', icon: 'clipboard' },
      { title: 'Шаблоны дизайна', description: 'Каталог макетов редактора.', to: '/adminpanel/design-templates', icon: 'image' },
      { title: 'Префлайт', description: 'Проверка макетов перед печатью.', to: '/adminpanel/preflight', icon: 'layers' },
      { title: 'База знаний', description: 'Инструкции, регламенты и предложения команды.', to: '/knowledge', icon: 'document' },
    ],
  },
  {
    id: 'communication',
    title: 'Связь',
    hint: 'Почта и уведомления',
    icon: 'bell',
    links: [
      { title: 'Уведомления', description: 'Каналы оповещений внутри CRM.', to: '/adminpanel/notifications', icon: 'bell' },
      { title: 'Почта заказов', description: 'SMTP и письма при смене статуса.', to: '/adminpanel/notifications?tab=client', icon: 'document' },
      { title: 'Рассылка', description: 'Кампании, сегменты и журнал отправки.', to: '/adminpanel/notifications?tab=campaigns', icon: 'bell-ring' },
      { title: 'Воронка чатов', description: 'План единого входящего: Telegram, Viber, Instagram, сайт.', to: '/adminpanel/inbox-plan', icon: 'bell' },
    ],
  },
  {
    id: 'settings',
    title: 'Настройки',
    hint: 'Доступы и команда',
    icon: 'settings',
    links: [
      { title: 'Общие настройки', description: 'Доставка, процент калькулятора и связанные разделы.', to: '/adminpanel/settings', icon: 'settings' },
      { title: 'Пользователи', description: 'Сотрудники, роли и API-токены.', to: '/adminpanel/users', icon: 'user' },
    ],
  },
  { id: 'plan', title: 'План модулей', hint: 'Что уже есть и что в работе', icon: 'layers' },
];

const ADMIN_GROUP_IDS = new Set<string>(ADMIN_GROUPS.map((group) => group.id));

const AdminPanelHome: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('group');
  const groupId: AdminGroupId = requested && ADMIN_GROUP_IDS.has(requested) ? requested as AdminGroupId : 'overview';
  const group = useMemo(
    () => ADMIN_GROUPS.find((item) => item.id === groupId) ?? ADMIN_GROUPS[0],
    [groupId],
  );

  return (
    <AdminPageLayout
      title="Админ панель"
      description="Заказы, производство, клиенты и доступы."
      icon={<AppIcon name="settings" size="lg" />}
      onBack={() => navigate('/')}
      className="admin-home"
    >
      <div className="settings-shell">
        <nav className="settings-nav" aria-label="Разделы админки">
          {ADMIN_GROUPS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`settings-nav__btn${item.id === groupId ? ' settings-nav__btn--active' : ''}`}
              onClick={() => setSearchParams({ group: item.id })}
              aria-current={item.id === groupId ? 'page' : undefined}
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

        <section className="settings-panel" aria-labelledby="admin-group-title">
          <header className="settings-panel__header">
            <h2 id="admin-group-title">{group.title}</h2>
            <p>{group.hint}</p>
          </header>

          {group.id === 'overview' && <DailyActivityOverview />}
          {group.id === 'plan' && <SystemFeaturesPanel />}
          {group.links && (
            <div className="settings-links">
              {group.links.map((link) => (
                <button key={link.to} type="button" className="settings-link" onClick={() => navigate(link.to)}>
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
          )}
        </section>
      </div>
    </AdminPageLayout>
  );
};

export const AdminPanelPage: React.FC = () => {
  return (
    <div className="admin-panel-page">
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<AdminPanelHome />} />
          
          {/* Оригинальные админ страницы */}
          <Route path="/reports" element={<AdminReportsPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/deliveries" element={<PostalTrackingPage />} />
          <Route path="/daily-reports" element={<AdminReportsPage />} />
          <Route path="/analytics" element={<ReportsPage />} />
          
          {/* Материалы */}
          <Route path="/materials" element={<WarehousePage />} />
          <Route path="/inventory" element={<WarehousePage />} />
          <Route path="/suppliers" element={<WarehousePage />} />
          <Route path="/categories" element={<WarehousePage />} />
          
          {/* Склад */}
          <Route path="/warehouse" element={<WarehousePage />} />
          <Route path="/warehouse-reports" element={<ReportsPage />} />
          <Route path="/low-stock-alerts" element={<WarehousePage />} />
          
          {/* Ценообразование */}
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/cost-calculation" element={<Navigate to="/adminpanel/pricing" replace />} />
          <Route path="/services-management" element={<ServicesManagementPage />} />
          <Route path="/plotter-cutting" element={<PlotterCuttingSettingsPage />} />
          <Route path="/discounts" element={<PricingPage />} />
          <Route path="/earnings" element={<EarningsAdminPage />} />
          <Route path="/printers" element={<PrintersPage />} />
          <Route path="/print-prices/new" element={<PrintPriceEditPage />} />
          <Route path="/print-prices/:id" element={<PrintPriceEditPage />} />
          <Route path="/counters" element={<CountersServicePage />} />
          <Route path="/preflight" element={<PreflightPage />} />
          <Route path="/inbox-plan" element={<InboxFunnelPlanPage />} />
          <Route path="/design-templates" element={<DesignTemplatesPage />} />
          <Route path="/design-fonts" element={<DesignFontsPage />} />
          <Route path="/design-assets" element={<DesignAssetsPage />} />
          <Route path="/design-editor/:templateId" element={<DesignEditorPage />} />
          <Route
            path="/public-design-editor-preview/:templateId"
            element={<Navigate to={DESIGN_TEMPLATES_CATALOG} replace />}
          />
          <Route path="/clients/:id" element={<CustomerDetailPage />} />
          <Route path="/clients" element={<CustomersAdminPage />} />
          <Route path="/document-templates" element={<DocumentTemplatesPage />} />
          <Route path="/organizations" element={<OrganizationsPage />} />
          
          {/* Настройки */}
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/users" element={<UserManagement />} />
          {/* Устаревший маршрут настроек калькулятора → редирект на продукты */}
          <Route path="/calculator-settings" element={<Navigate to="/adminpanel/products" replace />} />
          {/* Переключаем продукты на новую страницу управления продуктами */}
          <Route path="/products" element={<ProductManagementPage />} />
          <Route path="/products/:id/edit" element={<ProductEditPage />} />
          {/* Новые внутренние редакторы */}
          <Route path="/products/:id/template" element={<ProductTemplatePage />} />
          <Route path="/products/:id/tech-process" element={<ProductTechProcessPage />} />
          <Route path="/products-old" element={<AdminProductManager />} />
          <Route path="/backup" element={<SettingsPage />} />
          
          {/* Пользователи и заказы */}
          <Route path="/roles" element={<UserManagement />} />
          <Route path="/all-orders" element={<ReportsPage />} />
          <Route path="/order-templates" element={<SettingsPage />} />
          
          {/* Уведомления */}
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route
            path="/mail-notifications"
            element={<Navigate to="/adminpanel/notifications?tab=client" replace />}
          />
          
          <Route path="*" element={<Navigate to="/adminpanel" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
};
