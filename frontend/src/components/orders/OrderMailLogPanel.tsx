import React, { useCallback, useEffect, useState } from 'react';
import { AppIcon } from '../ui/AppIcon';
import { fetchMailJobsByOrder, postMailJobBounce, type MailJobListRow } from '../../api/mailApi';
import './OrderMailLogPanel.css';

function statusLabel(s: string): string {
  if (s === 'sent') return 'Отправлено';
  if (s === 'failed') return 'Ошибка';
  if (s === 'pending') return 'В очереди';
  if (s === 'sending') return 'Отправка…';
  return s;
}

export const OrderMailLogPanel: React.FC<{ orderId: number }> = ({ orderId }) => {
  const [jobs, setJobs] = useState<MailJobListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [bounceBusy, setBounceBusy] = useState<number | null>(null);
  const [bounceErr, setBounceErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    setBounceErr(null);
    void fetchMailJobsByOrder(orderId, 20)
      .then((d) => setJobs(d.jobs || []))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const onBounce = (jobId: number) => {
    setBounceBusy(jobId);
    setBounceErr(null);
    void postMailJobBounce(jobId)
      .then(() => load())
      .catch((e) => setBounceErr(e instanceof Error ? e.message : 'Ошибка'))
      .finally(() => setBounceBusy(null));
  };

  if (loading) {
    return (
      <div className="order-mail-log order-mail-log--loading">
        <AppIcon name="document" size="sm" /> Письма: загрузка…
      </div>
    );
  }
  if (err) {
    return (
      <div className="order-mail-log order-mail-log--error">
        {err}
      </div>
    );
  }
  if (jobs.length === 0) {
    return (
      <div className="order-mail-log order-mail-log--empty">
        <span className="order-mail-log__title">
          <AppIcon name="document" size="sm" /> Почта по заказу
        </span>
        <span className="order-mail-log__muted">Нет записей (ещё не ставили в очередь)</span>
      </div>
    );
  }

  return (
    <div className="order-mail-log">
      <div className="order-mail-log__head">
        <span className="order-mail-log__title">
          <AppIcon name="document" size="sm" /> Почта по заказу
        </span>
        <button type="button" className="order-mail-log__refresh" onClick={load} title="Обновить">
          <AppIcon name="refresh" size="xs" />
        </button>
      </div>
      {bounceErr ? <div className="order-mail-log__action-err">{bounceErr}</div> : null}
      <ul className="order-mail-log__list">
        {jobs.map((j) => (
          <li key={j.id} className={`order-mail-log__item order-mail-log__item--${j.status}`}>
            <span className="order-mail-log__subj" title={j.subject}>
              {j.subject}
            </span>
            <span className="order-mail-log__meta">
              {j.to_email} · {statusLabel(j.status)}
              {j.status === 'failed' && j.last_error ? ` — ${j.last_error.slice(0, 80)}` : ''}
            </span>
            <span className="order-mail-log__date">{j.created_at?.replace('T', ' ').slice(0, 19)}</span>
            {(j.first_opened_at || j.bounce_noted_at) && (
              <span className="order-mail-log__flags">
                {j.first_opened_at ? `Открытие: ${j.first_opened_at.replace('T', ' ').slice(0, 19)}` : null}
                {j.first_opened_at && j.bounce_noted_at ? ' · ' : null}
                {j.bounce_noted_at ? `Bounce: ${j.bounce_noted_at.replace('T', ' ').slice(0, 19)}` : null}
              </span>
            )}
            <span className="order-mail-log__actions">
              {!j.bounce_noted_at && (
                <button
                  type="button"
                  className="order-mail-log__bounce"
                  disabled={bounceBusy === j.id}
                  onClick={() => onBounce(j.id)}
                >
                  {bounceBusy === j.id ? '…' : 'Отметить bounce'}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
