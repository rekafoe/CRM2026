import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../Toast';
import {
  fetchMailConfig,
  fetchMailStats,
  fetchOrderEmailRules,
  postMailTest,
  patchOrderEmailRule,
} from '../../api/mailApi';
import type { OrderEmailRuleRow } from '../../api/mailApi';
import { fetchSmsConfig, fetchOrderSmsRules, patchOrderSmsRule } from '../../api/smsApi';
import type { OrderSmsRuleRow } from '../../api/smsApi';
import './OrderClientNotifyTab.css';

/**
 * Почта + SMS по смене статуса заказа (сайт / CRM). Стили: как блоки в NotificationsManager.
 */
export const OrderClientNotifyTab: React.FC = () => {
  const { addToast } = useToast();
  const [config, setConfig] = useState<{ configured: boolean; host?: string } | null>(null);
  const [stats, setStats] = useState<{ pending: number; failed: number; sent24h: number } | null>(
    null
  );
  const [rules, setRules] = useState<OrderEmailRuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [testTo, setTestTo] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [smsEnabled, setSmsEnabled] = useState<boolean | null>(null);
  const [smsDebounce, setSmsDebounce] = useState<number | null>(null);
  const [smsRules, setSmsRules] = useState<OrderSmsRuleRow[]>([]);
  const [smsTogglingId, setSmsTogglingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s, r, sc, sr] = await Promise.all([
        fetchMailConfig(),
        fetchMailStats(),
        fetchOrderEmailRules(),
        fetchSmsConfig().catch(() => ({ enabled: false, debounceSeconds: 0 })),
        fetchOrderSmsRules().catch(() => ({ rules: [] as OrderSmsRuleRow[] })),
      ]);
      setConfig(c);
      setStats(s);
      setRules(r.rules || []);
      setSmsEnabled(sc.enabled);
      setSmsDebounce(sc.debounceSeconds);
      setSmsRules(sr.rules || []);
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

  const handleToggle = async (rule: OrderEmailRuleRow) => {
    if (!config?.configured) {
      addToast({
        type: 'warning',
        title: 'SMTP',
        message: 'Сначала задайте SMTP_HOST и SMTP_FROM на сервере.',
      });
      return;
    }
    setTogglingId(rule.id);
    try {
      const next = !rule.is_active;
      await patchOrderEmailRule(rule.id, next);
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
      const r = (await postMailTest(to)) as { ok?: boolean; jobId?: number; immediateProcessed?: number };
      const message = r?.jobId
        ? `Задание #${r.jobId} создано, сразу обработано: ${r.immediateProcessed ?? 0}.`
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
        Уведомления клиенту при смене статуса. Email — при наличии <code>customerEmail</code>; авто-SMS — только
        для заказов с сайта и с <code>customerPhone</code> (ручная отправка в карточке заказа).
      </p>

      <div className="settings-sections">
        <div className="settings-section">
          <h4>Состояние SMTP</h4>
          <p className="client-notify-p">
            <strong>SMTP:</strong>{' '}
            {config?.configured ? (
              <span className="client-notify-ok">настроен ({config.host})</span>
            ) : (
              <span className="client-notify-bad">не настроен — задайте SMTP_HOST и SMTP_FROM</span>
            )}
          </p>
          {stats && (
            <p className="client-notify-meta">
              Очередь: {stats.pending} ожидает · {stats.failed} с ошибкой · {stats.sent24h} за 24ч
            </p>
          )}
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
          <p className="client-notify-hint">Нужен email клиента и <strong>включённое</strong> правило.</p>
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
                      <td>{rule.template_slug || '—'}</td>
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
        </div>
      </div>
    </div>
  );
};
