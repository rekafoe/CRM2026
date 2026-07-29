import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../Toast';
import {
  fetchMailConfig,
  fetchMailDiagnostics,
  fetchMailStats,
  fetchOrderEmailRules,
  fetchOrderEmailTemplates,
  fetchOrderMailStatuses,
  postMailTest,
  patchOrderEmailRule,
  patchOrderEmailTemplate,
  createOrderEmailRule,
} from '../../api/mailApi';
import type { OrderEmailRuleRow, EmailTemplateRow } from '../../api/mailApi';
import type { MailDiagnosticsResponse, MailDiagnosticStep } from '../../api/mailApi';
import { fetchSmsConfig, fetchOrderSmsRules, patchOrderSmsRule } from '../../api/smsApi';
import type { OrderSmsRuleRow } from '../../api/smsApi';
import './OrderClientNotifyTab.css';

/**
 * Почта + SMS по смене статуса заказа (сайт / CRM). Стили: как блоки в NotificationsManager.
 */
export const OrderClientNotifyTab: React.FC = () => {
  const { addToast } = useToast();
  const [config, setConfig] = useState<{
    configured: boolean;
    host?: string;
    port?: number;
    from?: string;
    workerEnabled?: boolean;
    outboxIntervalMs?: number;
  } | null>(null);
  const [stats, setStats] = useState<{ pending: number; failed: number; sent24h: number } | null>(
    null
  );
  const [rules, setRules] = useState<OrderEmailRuleRow[]>([]);
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);
  const [statuses, setStatuses] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftSubject, setDraftSubject] = useState('');
  const [draftHtml, setDraftHtml] = useState('');
  const [draftText, setDraftText] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [newRuleStatusId, setNewRuleStatusId] = useState('');
  const [newRuleTemplateId, setNewRuleTemplateId] = useState('');
  const [loading, setLoading] = useState(true);
  const [testTo, setTestTo] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [diagnostics, setDiagnostics] = useState<MailDiagnosticsResponse | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [smsEnabled, setSmsEnabled] = useState<boolean | null>(null);
  const [smsDebounce, setSmsDebounce] = useState<number | null>(null);
  const [smsRules, setSmsRules] = useState<OrderSmsRuleRow[]>([]);
  const [smsTogglingId, setSmsTogglingId] = useState<number | null>(null);

  const applyTemplateDraft = useCallback((t: EmailTemplateRow | null) => {
    if (!t) {
      setSelectedTemplateId(null);
      setDraftName('');
      setDraftSubject('');
      setDraftHtml('');
      setDraftText('');
      return;
    }
    setSelectedTemplateId(t.id);
    setDraftName(t.name || '');
    setDraftSubject(t.subject_template || '');
    setDraftHtml(t.body_html_template || '');
    setDraftText(t.body_text_template || '');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s, r, sc, sr, tpl, st] = await Promise.all([
        fetchMailConfig(),
        fetchMailStats(),
        fetchOrderEmailRules(),
        fetchSmsConfig().catch(() => ({ enabled: false, debounceSeconds: 0 })),
        fetchOrderSmsRules().catch(() => ({ rules: [] as OrderSmsRuleRow[] })),
        fetchOrderEmailTemplates().catch(() => ({ templates: [] as EmailTemplateRow[] })),
        fetchOrderMailStatuses().catch(() => ({ statuses: [] as Array<{ id: number; name: string }> })),
      ]);
      setConfig(c);
      setStats(s);
      setRules(r.rules || []);
      setSmsEnabled(sc.enabled);
      setSmsDebounce(sc.debounceSeconds);
      setSmsRules(sr.rules || []);
      const list = tpl.templates || [];
      setTemplates(list);
      setStatuses(st.statuses || []);
      setSelectedTemplateId((prev) =>
        prev != null && list.some((x) => x.id === prev) ? prev : list[0]?.id ?? null
      );
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Ошибка',
        message: e instanceof Error ? e.message : 'Не удалось загрузить настройки',
      });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const syncedTemplateIdRef = React.useRef<number | null>(null);
  useEffect(() => {
    if (selectedTemplateId == null) return;
    if (syncedTemplateIdRef.current === selectedTemplateId) return;
    const current = templates.find((x) => x.id === selectedTemplateId) || null;
    if (!current) return;
    syncedTemplateIdRef.current = selectedTemplateId;
    applyTemplateDraft(current);
  }, [templates, selectedTemplateId, applyTemplateDraft]);

  const handleToggle = async (rule: OrderEmailRuleRow) => {
    if (!config?.configured) {
      addToast({
        type: 'warning',
        title: 'SMTP',
        message: 'Сначала задайте SMTP_HOST и SMTP_FROM на сервере, затем отправьте тестовое письмо.',
      });
      return;
    }
    setTogglingId(rule.id);
    try {
      const next = !rule.is_active;
      await patchOrderEmailRule(rule.id, { is_active: next });
      setRules((prev) => prev.map((x) => (x.id === rule.id ? { ...x, is_active: next ? 1 : 0 } : x)));
      addToast({ type: 'success', title: 'Сохранено', message: next ? 'Правило включено' : 'Правило выключено' });
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Ошибка',
        message: e instanceof Error ? e.message : 'Не удалось обновить правило',
      });
    } finally {
      setTogglingId(null);
    }
  };

  const handleRuleTemplateChange = async (rule: OrderEmailRuleRow, templateId: number) => {
    setTogglingId(rule.id);
    try {
      await patchOrderEmailRule(rule.id, { email_template_id: templateId });
      const slug = templates.find((t) => t.id === templateId)?.slug || null;
      setRules((prev) =>
        prev.map((x) =>
          x.id === rule.id ? { ...x, email_template_id: templateId, template_slug: slug } : x
        )
      );
      addToast({ type: 'success', title: 'Сохранено', message: 'Шаблон правила обновлён' });
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Ошибка',
        message: e instanceof Error ? e.message : 'Не удалось сменить шаблон',
      });
    } finally {
      setTogglingId(null);
    }
  };

  const handleSaveTemplate = async () => {
    if (selectedTemplateId == null) return;
    setSavingTemplate(true);
    try {
      const updated = await patchOrderEmailTemplate(selectedTemplateId, {
        name: draftName,
        subject_template: draftSubject,
        body_html_template: draftHtml,
        body_text_template: draftText,
      });
      setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      applyTemplateDraft(updated);
      addToast({ type: 'success', title: 'Шаблон сохранён' });
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Ошибка',
        message: e instanceof Error ? e.message : 'Не удалось сохранить шаблон',
      });
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleCreateRule = async () => {
    const statusId = Number(newRuleStatusId);
    const templateId = Number(newRuleTemplateId || selectedTemplateId);
    if (!Number.isFinite(statusId) || statusId <= 0 || !Number.isFinite(templateId) || templateId <= 0) {
      addToast({ type: 'warning', title: 'Правило', message: 'Выберите статус и шаблон' });
      return;
    }
    try {
      await createOrderEmailRule({
        to_status_id: statusId,
        email_template_id: templateId,
        is_active: true,
      });
      setNewRuleStatusId('');
      setNewRuleTemplateId('');
      await load();
      addToast({ type: 'success', title: 'Правило создано' });
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Ошибка',
        message: e instanceof Error ? e.message : 'Не удалось создать правило',
      });
    }
  };

  const handleSmsToggle = async (rule: OrderSmsRuleRow) => {
    if (smsEnabled === false) {
      addToast({
        type: 'warning',
        title: 'SMS',
        message: 'Включите SMS_ENABLED на сервере.',
      });
    }
    setSmsTogglingId(rule.id);
    try {
      const next = !rule.is_active;
      await patchOrderSmsRule(rule.id, next);
      setSmsRules((prev) => prev.map((x) => (x.id === rule.id ? { ...x, is_active: next ? 1 : 0 } : x)));
      addToast({ type: 'success', title: 'Сохранено', message: next ? 'Правило SMS включено' : 'Правило SMS выключено' });
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Ошибка',
        message: e instanceof Error ? e.message : 'Не удалось обновить правило',
      });
    } finally {
      setSmsTogglingId(null);
    }
  };

  const handleTest = async () => {
    const to = testTo.trim();
    if (!to.includes('@')) {
      setTestResult({ type: 'error', message: 'Укажите корректный email.' });
      addToast({ type: 'error', title: 'Адрес', message: 'Укажите корректный email' });
      return;
    }
    setTestSending(true);
    setTestResult(null);
    try {
      const r = (await postMailTest(to)) as {
        ok?: boolean;
        jobId?: number;
        processingAsync?: boolean;
        immediateProcessed?: number | null;
      };
      const message = r?.jobId
        ? r.processingAsync || r.immediateProcessed == null
          ? `Задание #${r.jobId} в очереди; отправка в фоне. При сбое SMTP смотрите логи и статистику очереди.`
          : `Задание #${r.jobId} создано, сразу обработано: ${r.immediateProcessed ?? 0}.`
        : 'Запрос отправлен.';
      setTestResult({ type: 'success', message });
      addToast({
        type: 'success',
        title: 'Очередь',
        message,
      });
      void load();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Не удалось поставить тест в очередь';
      setTestResult({ type: 'error', message });
      addToast({
        type: 'error',
        title: 'Ошибка',
        message,
      });
    } finally {
      setTestSending(false);
    }
  };

  const handleDiagnostics = async () => {
    setDiagnosticsLoading(true);
    try {
      const result = await fetchMailDiagnostics();
      setDiagnostics(result);
      const tcpOk = result.tcp?.ok;
      const smtpOk = result.smtp?.ok;
      addToast({
        type: tcpOk && (smtpOk || !result.configured) ? 'success' : 'warning',
        title: 'SMTP диагностика',
        message: tcpOk ? 'TCP-соединение проверено' : 'TCP-соединение не прошло',
      });
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Диагностика',
        message: e instanceof Error ? e.message : 'Не удалось проверить SMTP',
      });
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  const renderDiagnosticStep = (label: string, step: MailDiagnosticStep | null) => (
    <div className="client-notify-diagnostic-row">
      <strong>{label}</strong>
      {step ? (
        <span className={step.ok ? 'client-notify-ok' : 'client-notify-bad'}>
          {step.ok ? 'OK' : 'Ошибка'} · {step.ms} мс
          {step.address ? ` · ${step.address}` : ''}
          {step.code ? ` · ${step.code}` : ''}
          {step.error ? ` · ${step.error}` : ''}
        </span>
      ) : (
        <span className="client-notify-muted-inline">не запускалось</span>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="notifications-settings client-notify-tab">
        <p className="client-notify-muted">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="notifications-settings client-notify-tab">
      <h3 className="client-notify-title">Почта и SMS по заказам</h3>
      <p className="client-notify-lead">
        Уведомления клиенту при смене статуса. Email — при наличии <code>customerEmail</code> в заказе или
        карточке клиента; авто-SMS — только для заказов с сайта и с <code>customerPhone</code>.
      </p>

      <div className="settings-sections">
        <div className="settings-section">
          <h4>Состояние SMTP</h4>
          <p className="client-notify-p">
            <strong>SMTP:</strong>{' '}
            {config?.configured ? (
              <span className="client-notify-ok">
                настроен ({config.host}:{config.port})
              </span>
            ) : (
              <span className="client-notify-bad">
                не настроен — задайте SMTP_HOST и SMTP_FROM
              </span>
            )}
          </p>
          <p className="client-notify-meta">
            Отправитель: {config?.from || 'не задан'} · воркер:{' '}
            {config?.workerEnabled === false ? 'выключен' : `включён, интервал ${(config?.outboxIntervalMs ?? 0) / 1000 || 15} с`}
          </p>
          {!config?.configured && (
            <p className="client-notify-hint">
              Минимум для запуска: <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_FROM</code>.
              Если сервер требует авторизацию, добавьте <code>SMTP_USER</code> и <code>SMTP_PASS</code>.
            </p>
          )}
          {stats && (
            <p className="client-notify-meta">
              Очередь: {stats.pending} ожидает · {stats.failed} с ошибкой · {stats.sent24h} за 24ч
            </p>
          )}
          <div className="client-notify-diagnostics">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void handleDiagnostics()}
              disabled={diagnosticsLoading}
            >
              {diagnosticsLoading ? 'Проверяем...' : 'Проверить SMTP-соединение'}
            </button>
            {diagnostics && (
              <div className="client-notify-diagnostic-result">
                <p className="client-notify-meta">
                  Проверяется: {diagnostics.host}:{diagnostics.port} · secure={String(diagnostics.secure)}
                  {diagnostics.family ? ` · IPv${diagnostics.family}` : ''}
                </p>
                {renderDiagnosticStep('DNS', diagnostics.dns)}
                {renderDiagnosticStep('TCP', diagnostics.tcp)}
                {renderDiagnosticStep('SMTP verify', diagnostics.smtp)}
              </div>
            )}
          </div>
        </div>

        <div className="settings-section">
          <h4>Тест письма</h4>
          <div className="client-notify-test-row">
            <input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="email@example.com"
              className="client-notify-input"
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleTest()}
              disabled={testSending}
            >
              {testSending ? 'Отправка...' : 'Отправить тест'}
            </button>
          </div>
          {testResult && (
            <p className={testResult.type === 'success' ? 'client-notify-okmsg' : 'client-notify-errmsg'}>
              {testResult.message}
            </p>
          )}
        </div>

        <div className="settings-section">
          <h4>SMS (сайт, авто)</h4>
          <p className="client-notify-hint">
            Окно 8:30–20:00 (Минск), дебаунс в env. Только <strong>source=website</strong>.
          </p>
          <p className="client-notify-p">
            <strong>SMS:</strong>{' '}
            {smsEnabled ? (
              <span className="client-notify-ok">включено</span>
            ) : (
              <span className="client-notify-bad">выключено (SMS_ENABLED)</span>
            )}
            {smsDebounce != null && smsDebounce > 0 && (
              <span className="client-notify-meta"> · дебаунс {smsDebounce} с</span>
            )}
          </p>
          <div className="client-notify-table-wrap">
            <table className="client-notify-table">
              <thead>
                <tr>
                  <th>Статус</th>
                  <th>Шаблон</th>
                  <th>Вкл</th>
                </tr>
              </thead>
              <tbody>
                {smsRules.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="client-notify-muted">
                      Нет правил SMS
                    </td>
                  </tr>
                ) : (
                  smsRules.map((rule) => (
                    <tr key={rule.id}>
                      <td>{rule.status_name || `#${rule.to_status_id}`}</td>
                      <td>{rule.template_slug || '—'}</td>
                      <td>
                        <input
                          type="checkbox"
                          className="client-notify-check"
                          checked={Boolean(rule.is_active)}
                          disabled={smsTogglingId === rule.id}
                          onChange={() => void handleSmsToggle(rule)}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="settings-section">
          <h4>Email при смене статуса</h4>
          <p className="client-notify-hint">
            Нужен email клиента, настроенный SMTP и <strong>включённое</strong> правило для нового статуса.
            Письма содержат позиции, сумму, доставку и срок (как у конкурентов).
          </p>
          <div className="client-notify-table-wrap">
            <table className="client-notify-table">
              <thead>
                <tr>
                  <th>Статус</th>
                  <th>Шаблон</th>
                  <th>Вкл</th>
                </tr>
              </thead>
              <tbody>
                {rules.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="client-notify-muted">
                      Нет правил
                    </td>
                  </tr>
                ) : (
                  rules.map((rule) => (
                    <tr key={rule.id}>
                      <td>{rule.status_name || `#${rule.to_status_id}`}</td>
                      <td>
                        <select
                          className="client-notify-input client-notify-select"
                          value={rule.email_template_id}
                          disabled={togglingId === rule.id}
                          onChange={(e) => void handleRuleTemplateChange(rule, Number(e.target.value))}
                        >
                          {templates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} ({t.slug})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          className="client-notify-check"
                          checked={Boolean(rule.is_active)}
                          disabled={togglingId === rule.id}
                          onChange={() => void handleToggle(rule)}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="client-notify-new-rule">
            <h5 className="client-notify-subtitle">Добавить правило</h5>
            <div className="client-notify-test-row">
              <select
                className="client-notify-input client-notify-select"
                value={newRuleStatusId}
                onChange={(e) => setNewRuleStatusId(e.target.value)}
              >
                <option value="">Статус…</option>
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                className="client-notify-input client-notify-select"
                value={newRuleTemplateId || String(selectedTemplateId ?? '')}
                onChange={(e) => setNewRuleTemplateId(e.target.value)}
              >
                <option value="">Шаблон…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-secondary" onClick={() => void handleCreateRule()}>
                Добавить
              </button>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h4>Редактор шаблона письма</h4>
          <p className="client-notify-hint">
            Плейсхолдеры: <code>{'{{customerName}}'}</code>, <code>{'{{orderNumber}}'}</code>,{' '}
            <code>{'{{statusPhrase}}'}</code>, <code>{'{{itemsHtml}}'}</code>/<code>{'{{itemsText}}'}</code>,{' '}
            <code>{'{{orderTotal}}'}</code>, <code>{'{{deliveryHtml}}'}</code>,{' '}
            <code>{'{{productionTerm}}'}</code>, <code>{'{{readyAt}}'}</code>,{' '}
            <code>{'{{companyName}}'}</code>, <code>{'{{companyEmail}}'}</code>,{' '}
            <code>{'{{companyPhone}}'}</code>, <code>{'{{cabinetUrl}}'}</code>.
          </p>
          <label className="client-notify-field">
            <span>Шаблон</span>
            <select
              className="client-notify-input"
              value={selectedTemplateId ?? ''}
              onChange={(e) => {
                syncedTemplateIdRef.current = null;
                setSelectedTemplateId(Number(e.target.value) || null);
              }}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.slug})
                </option>
              ))}
            </select>
          </label>
          <label className="client-notify-field">
            <span>Название</span>
            <input
              className="client-notify-input"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
            />
          </label>
          <label className="client-notify-field">
            <span>Тема</span>
            <input
              className="client-notify-input"
              value={draftSubject}
              onChange={(e) => setDraftSubject(e.target.value)}
            />
          </label>
          <label className="client-notify-field">
            <span>HTML</span>
            <textarea
              className="client-notify-textarea"
              rows={14}
              value={draftHtml}
              onChange={(e) => setDraftHtml(e.target.value)}
            />
          </label>
          <label className="client-notify-field">
            <span>Текст (plain)</span>
            <textarea
              className="client-notify-textarea"
              rows={10}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={savingTemplate || selectedTemplateId == null}
            onClick={() => void handleSaveTemplate()}
          >
            {savingTemplate ? 'Сохранение…' : 'Сохранить шаблон'}
          </button>
        </div>
      </div>
    </div>
  );
};
