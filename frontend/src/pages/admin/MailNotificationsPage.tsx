import React, { useCallback, useEffect, useState } from 'react';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AppIcon } from '../../components/ui/AppIcon';
import { useToast } from '../../components/Toast';
import {
  fetchMailConfig,
  fetchMailStats,
  fetchOrderEmailRules,
  postMailTest,
  patchOrderEmailRule,
} from '../../api/mailApi';
import type { OrderEmailRuleRow } from '../../api/mailApi';
import './MailNotificationsPage.css';

interface MailNotificationsPageProps {
  onBack: () => void;
}

export const MailNotificationsPage: React.FC<MailNotificationsPageProps> = ({ onBack }) => {
  const { addToast } = useToast();
  const [config, setConfig] = useState<{ configured: boolean; host?: string } | null>(null);
  const [stats, setStats] = useState<{ pending: number; failed: number; sent24h: number } | null>(
    null
  );
  const [rules, setRules] = useState<OrderEmailRuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [testTo, setTestTo] = useState('');
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s, r] = await Promise.all([
        fetchMailConfig(),
        fetchMailStats(),
        fetchOrderEmailRules(),
      ]);
      setConfig(c);
      setStats(s);
      setRules(r.rules || []);
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Ошибка',
        message: e instanceof Error ? e.message : 'Не удалось загрузить настройки почты',
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
        message: 'Сначала задайте SMTP_HOST и SMTP_FROM на сервере (Railway / .env).',
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

  const handleTest = async () => {
    const to = testTo.trim();
    if (!to.includes('@')) {
      addToast({ type: 'error', title: 'Адрес', message: 'Укажите корректный email' });
      return;
    }
    try {
      const r = (await postMailTest(to)) as { ok?: boolean; jobId?: number; immediateProcessed?: number };
      addToast({
        type: 'success',
        title: 'Очередь',
        message: r?.jobId
          ? `Задание #${r.jobId}, обработано сразу: ${r.immediateProcessed ?? 0}`
          : 'Запрос отправлен',
      });
      void load();
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Ошибка',
        message: e instanceof Error ? e.message : 'Не удалось поставить тест в очередь',
      });
    }
  };

  return (
    <AdminPageLayout
      title="Почта: уведомления по заказам"
      icon={<AppIcon name="document" size="md" />}
      onBack={onBack}
      className="mail-notifications-page"
    >
      <div className="mail-notifications-content">
        {loading ? (
          <p className="mail-notifications-muted">Загрузка…</p>
        ) : (
          <>
            <section className="mail-notifications-section">
              <h2>
                <AppIcon name="info" size="sm" /> Состояние
              </h2>
              <p>
                <strong>SMTP:</strong>{' '}
                {config?.configured ? (
                  <span className="mail-ok">настроен ({config.host})</span>
                ) : (
                  <span className="mail-bad">не настроен — задайте SMTP_HOST и SMTP_FROM</span>
                )}
              </p>
              {stats && (
                <p className="mail-notifications-stats">
                  Очередь: {stats.pending} ожидает · {stats.failed} с ошибкой · {stats.sent24h} отправлено
                  за 24ч
                </p>
              )}
            </section>

            <section className="mail-notifications-section">
              <h2>Тест письма</h2>
              <div className="mail-test-row">
                <input
                  type="email"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="email@example.com"
                  className="mail-test-input"
                />
                <button type="button" className="lg-btn" onClick={() => void handleTest()}>
                  Отправить тест
                </button>
              </div>
            </section>

            <section className="mail-notifications-section">
              <h2>Уведомление при смене статуса</h2>
              <p className="mail-notifications-hint">
                Письмо уходит, если у заказа заполнен email клиента и правило <strong>включено</strong>.
                Текст правится в БД (шаблоны) — в следующих версиях будет редактор.
              </p>
              <div className="mail-rules-table-wrap">
                <table className="mail-rules-table">
                  <thead>
                    <tr>
                      <th>Статус (цель)</th>
                      <th>Шаблон</th>
                      <th>Вкл</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="mail-notifications-muted">
                          Нет правил (после миграции появится сид)
                        </td>
                      </tr>
                    ) : (
                      rules.map((rule) => (
                        <tr key={rule.id}>
                          <td>
                            {rule.status_name || `#${rule.to_status_id}`}
                          </td>
                          <td>{rule.template_slug || '—'}</td>
                          <td>
                            <label className="mail-rule-toggle">
                              <input
                                type="checkbox"
                                checked={Boolean(rule.is_active)}
                                disabled={togglingId === rule.id}
                                onChange={() => void handleToggle(rule)}
                              />
                            </label>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </AdminPageLayout>
  );
};

export default MailNotificationsPage;
