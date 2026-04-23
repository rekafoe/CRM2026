import React, { useCallback, useEffect, useState } from 'react';
import { AppIcon } from '../ui/AppIcon';
import { fetchSmsTemplates, postOrderManualSms, type SmsTemplateRow } from '../../api/smsApi';
import './OrderSmsPanel.css';

export const OrderSmsPanel: React.FC<{ orderId: number; customerPhone?: string | null }> = ({
  orderId,
  customerPhone,
}) => {
  const [templates, setTemplates] = useState<SmsTemplateRow[]>([]);
  const [templateId, setTemplateId] = useState<number | ''>('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const loadT = useCallback(() => {
    void fetchSmsTemplates()
      .then((d) => setTemplates((d.templates || []).filter((t) => t.is_active === 1)))
      .catch(() => setTemplates([]));
  }, []);

  useEffect(() => {
    loadT();
  }, [loadT]);

  const onSend = () => {
    setErr(null);
    setOk(false);
    setLoading(true);
    const payload =
      body.trim() !== ''
        ? { body: body.trim() }
        : templateId !== '' && templateId
          ? { templateId: Number(templateId) }
          : null;
    if (!payload) {
      setErr('Введите текст или выберите шаблон');
      setLoading(false);
      return;
    }
    void postOrderManualSms(orderId, payload)
      .then(() => {
        setOk(true);
        setBody('');
      })
      .catch((e) => {
        const msg = e?.response?.data?.error || (e instanceof Error ? e.message : 'Ошибка');
        setErr(String(msg));
      })
      .finally(() => setLoading(false));
  };

  if (!((customerPhone || '').trim().length > 5)) {
    return (
      <div className="order-sms-panel order-sms-panel--muted">
        <AppIcon name="document" size="sm" /> SMS: нет телефона в заказе
      </div>
    );
  }

  return (
    <div className="order-sms-panel">
      <div className="order-sms-panel__head">
        <span className="order-sms-panel__title">
          <AppIcon name="document" size="sm" /> SMS клиенту (ручная)
        </span>
      </div>
      <p className="order-sms-panel__hint">Только 8:30–20:00 (Минск), SMS_ENABLED на сервере.</p>
      <div className="order-sms-panel__row">
        <label>
          Шаблон
          <select
            value={templateId === '' ? '' : String(templateId)}
            onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : '')}
            className="order-sms-panel__select"
          >
            <option value="">—</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <textarea
        className="order-sms-panel__textarea"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Или введите текст ({{orderNumber}}, {{statusName}}, ...)"
        rows={3}
      />
      {err ? <div className="order-sms-panel__err">{err}</div> : null}
      {ok ? <div className="order-sms-panel__ok">Отправлено</div> : null}
      <button type="button" className="order-sms-panel__btn" disabled={loading} onClick={onSend}>
        {loading ? '…' : 'Отправить SMS'}
      </button>
    </div>
  );
};
