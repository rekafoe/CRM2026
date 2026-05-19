import React from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { Button } from '../../components/common';
import { AppIcon } from '../../components/ui/AppIcon';
import { finalizePublicEditorPreviewDraft } from '../../api';
import { ClientEditorRouter, type ClientEditorMode } from '../clientEditor';
import './publicDesignEditorPreview.css';

const CLIENT_EDITOR_MODES: ClientEditorMode[] = ['single', 'multipage', 'photo_batch'];

const MODE_LABELS: Record<ClientEditorMode, string> = {
  single: 'Один макет',
  multipage: 'Многостраничный',
  photo_batch: 'Пачка фото',
};

export const PublicDesignEditorPreviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [customerForm, setCustomerForm] = React.useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
  });
  const [finalizing, setFinalizing] = React.useState(false);
  const [crmStatus, setCrmStatus] = React.useState<string | null>(null);
  const [crmError, setCrmError] = React.useState<string | null>(null);
  const id = Number(templateId);
  const requestedMode = searchParams.get('mode') as ClientEditorMode | null;
  const mode = requestedMode && CLIENT_EDITOR_MODES.includes(requestedMode) ? requestedMode : 'single';
  const draftToken = searchParams.get('draft');

  const updateSearchParam = React.useCallback((key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleModeChange = React.useCallback((nextMode: ClientEditorMode) => {
    if (nextMode === mode) return;
    const next = new URLSearchParams(searchParams);
    next.set('mode', nextMode);
    next.delete('draft');
    setSearchParams(next, { replace: true });
    setCrmStatus('Режим редактора переключён. Draft сброшен, чтобы не смешивать разные контракты состояния.');
    setCrmError(null);
  }, [mode, searchParams, setSearchParams]);

  const handleFinalizePreview = async () => {
    if (!draftToken) {
      setCrmError('Сначала создайте или сохраните draft в редакторе.');
      return;
    }
    const customerName = customerForm.customerName.trim();
    const customerPhone = customerForm.customerPhone.trim();
    const customerEmail = customerForm.customerEmail.trim();
    if (!customerName && !customerPhone) {
      setCrmError('Для тестовой заявки укажите имя или телефон.');
      return;
    }
    try {
      setFinalizing(true);
      setCrmError(null);
      setCrmStatus(null);
      await finalizePublicEditorPreviewDraft(draftToken, {
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        customerEmail: customerEmail || undefined,
      });
      setCrmStatus('Тестовая заявка отправлена из CRM preview.');
    } catch (err) {
      setCrmError(err instanceof Error ? err.message : 'Не удалось отправить тестовую заявку.');
    } finally {
      setFinalizing(false);
    }
  };

  const headerExtra = (
    <div className="public-editor-preview-header-tools" aria-label="CRM preview controls">
      <div className="public-editor-preview-crm__modes" aria-label="Режим редактора">
        {CLIENT_EDITOR_MODES.map((item) => (
          <button
            key={item}
            type="button"
            className={item === mode ? 'public-editor-preview-crm__mode public-editor-preview-crm__mode--active' : 'public-editor-preview-crm__mode'}
            onClick={() => handleModeChange(item)}
          >
            {MODE_LABELS[item]}
          </button>
        ))}
      </div>
      <div className="public-editor-preview-crm__draft">
        <span>Draft</span>
        <strong>{draftToken ? `${draftToken.slice(0, 12)}...` : 'нет'}</strong>
      </div>
      <details className="public-editor-preview-crm__details">
        <summary>CRM тест</summary>
        <form
          className="public-editor-preview-crm__contacts"
          onSubmit={(event) => {
            event.preventDefault();
            void handleFinalizePreview();
          }}
        >
          <label>
            <span>Имя</span>
            <input
              type="text"
              value={customerForm.customerName}
              onChange={(event) => setCustomerForm({ ...customerForm, customerName: event.target.value })}
              placeholder="Иван Петров"
              autoComplete="name"
            />
          </label>
          <label>
            <span>Телефон</span>
            <input
              type="tel"
              value={customerForm.customerPhone}
              onChange={(event) => setCustomerForm({ ...customerForm, customerPhone: event.target.value })}
              placeholder="+375..."
              autoComplete="tel"
            />
          </label>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={customerForm.customerEmail}
              onChange={(event) => setCustomerForm({ ...customerForm, customerEmail: event.target.value })}
              placeholder="client@example.com"
              autoComplete="email"
            />
          </label>
          <Button variant="secondary" type="submit" disabled={finalizing || !draftToken}>
            {finalizing ? 'Отправляем...' : 'Отправить тест'}
          </Button>
        </form>
      </details>
      {(crmStatus || crmError) && (
        <div className={crmError ? 'public-editor-preview-crm__message public-editor-preview-crm__message--error' : 'public-editor-preview-crm__message'}>
          {crmError || crmStatus}
        </div>
      )}
    </div>
  );

  return (
    <AdminPageLayout
      title="Предпросмотр клиентского редактора"
      icon={<AppIcon name="image" size="sm" />}
      onBack={() => navigate('/adminpanel/design-templates')}
      className="design-editor-fullbleed"
      headerExtra={headerExtra}
    >
      <div className="public-editor-preview-shell">
        <div className="public-editor-preview-editor">
          <ClientEditorRouter
            key={`${mode}-${id}`}
            mode={mode}
            templateId={id}
            initialDraftToken={draftToken}
            onDraftTokenChange={(token) => {
              updateSearchParam('draft', token);
            }}
            onReadyForCart={(token) => {
              updateSearchParam('draft', token);
              setCrmStatus('Макет сохранён. Можно оценить чистый редактор или отправить тестовую заявку сверху.');
              setCrmError(null);
            }}
          />
        </div>
      </div>
    </AdminPageLayout>
  );
};

export default PublicDesignEditorPreviewPage;
