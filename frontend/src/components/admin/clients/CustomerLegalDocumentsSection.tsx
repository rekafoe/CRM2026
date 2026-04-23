import React, { useCallback, useEffect, useState } from 'react';
import {
  createCustomerLegalDocument,
  deleteCustomerLegalDocument,
  getCustomerLegalDocuments,
  updateCustomerLegalDocument,
} from '../../../api';
import { Button } from '../../common';
import type { CustomerLegalDocument, Order } from '../../../types';
import './CustomerLegalDocumentsSection.css';

const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: 'act', label: 'Акт' },
  { value: 'invoice', label: 'Счёт' },
  { value: 'contract', label: 'Договор' },
  { value: 'other', label: 'Другое' },
];

function kindLabel(kind: string | null): string {
  if (!kind) return '—';
  return KIND_OPTIONS.find((o) => o.value === kind)?.label || kind;
}

function toInputDatetime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromInputDatetime(s: string): string {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

function formatWhen(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

type FormState = {
  order_id: string;
  title: string;
  document_kind: string;
  issued_at: string;
  returned_at: string;
  notes: string;
};

const emptyForm = (): FormState => ({
  order_id: '',
  title: '',
  document_kind: 'act',
  issued_at: toInputDatetime(new Date().toISOString()),
  returned_at: '',
  notes: '',
});

function orderLabelFor(orders: Order[], orderId: number | null | undefined): string {
  if (orderId == null) return '—';
  const o = orders.find((x) => x.id === orderId);
  if (o) return o.number || `#${o.id}`;
  return `№${orderId}`;
}

export const CustomerLegalDocumentsSection: React.FC<{
  customerId: number;
  /** Заказы клиента — для привязки выдачи/возврата к заказу */
  orders: Order[];
  /** Увеличьте после автозаписи документа, чтобы обновить таблицу */
  refreshToken?: number;
}> = ({ customerId, orders, refreshToken = 0 }) => {
  const [rows, setRows] = useState<CustomerLegalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCustomerLegalDocuments(customerId);
      setRows(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить документы');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    setEditingId(null);
    setShowNew(false);
    void load();
  }, [load, refreshToken]);

  const startEdit = (r: CustomerLegalDocument) => {
    setEditingId(r.id);
    setEditForm({
      order_id: r.order_id != null && r.order_id !== undefined ? String(r.order_id) : '',
      title: r.title,
      document_kind: r.document_kind || 'act',
      issued_at: toInputDatetime(r.issued_at),
      returned_at: r.returned_at ? toInputDatetime(r.returned_at) : '',
      notes: r.notes || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const handleCreate = async () => {
    const title = form.title.trim();
    if (!title) {
      setError('Укажите наименование документа');
      return;
    }
    if (orders.length > 0 && !form.order_id.trim()) {
      setError('Укажите заказ, к которому относится документ');
      return;
    }
    if (!form.issued_at) {
      setError('Укажите дату и время формирования или выдачи');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const oid = form.order_id.trim() ? parseInt(form.order_id, 10) : null;
      await createCustomerLegalDocument(customerId, {
        title,
        document_kind: form.document_kind || null,
        issued_at: fromInputDatetime(form.issued_at),
        returned_at: form.returned_at ? fromInputDatetime(form.returned_at) : null,
        notes: form.notes.trim() || null,
        order_id: oid != null && !Number.isNaN(oid) ? oid : null,
      });
      setForm(orders[0] ? { ...emptyForm(), order_id: String(orders[0].id) } : emptyForm());
      setShowNew(false);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: number) => {
    const title = editForm.title.trim();
    if (!title) {
      setError('Укажите наименование документа');
      return;
    }
    if (orders.length > 0 && !editForm.order_id.trim()) {
      setError('Укажите заказ, к которому относится документ');
      return;
    }
    if (!editForm.issued_at) {
      setError('Укажите дату и время формирования или выдачи');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const eOid = editForm.order_id.trim() ? parseInt(editForm.order_id, 10) : null;
      await updateCustomerLegalDocument(customerId, id, {
        title,
        document_kind: editForm.document_kind || null,
        issued_at: fromInputDatetime(editForm.issued_at),
        returned_at: editForm.returned_at ? fromInputDatetime(editForm.returned_at) : null,
        notes: editForm.notes.trim() || null,
        order_id: eOid != null && !Number.isNaN(eOid) ? eOid : null,
      });
      setEditingId(null);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Удалить запись о документе?')) return;
    setError(null);
    try {
      await deleteCustomerLegalDocument(customerId, id);
      if (editingId === id) setEditingId(null);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    }
  };

  return (
    <div className="customers-legal-docs">
      <div className="customers-legal-docs__head">
        <h5>Документы</h5>
        <p className="customers-legal-docs__hint">
          Учёт выдачи и возврата оригиналов — каждая запись привязана к заказу (если в базе есть заказы
          клиента).
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setShowNew((v) => !v);
            setError(null);
            if (!showNew) {
              setForm(
                orders[0] ? { ...emptyForm(), order_id: String(orders[0].id) } : emptyForm(),
              );
            }
          }}
        >
          {showNew ? 'Отмена' : 'Добавить запись'}
        </Button>
      </div>

      {error && <div className="customers-legal-docs__error" role="alert">{error}</div>}

      {showNew && (
        <div className="customers-legal-docs__form customers-legal-docs__form--new">
          {orders.length > 0 && (
            <label>
              <span>Заказ</span>
              <select
                value={form.order_id}
                onChange={(e) => setForm((p) => ({ ...p, order_id: e.target.value }))}
              >
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.number || `#${o.id}`}{' '}
                    {o.created_at
                      ? new Date(
                          o.created_at || (o as { created_at?: string }).created_at || '',
                        ).toLocaleDateString('ru-RU')
                      : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span>Наименование</span>
            <input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Например: Акт за март 2025"
            />
          </label>
          <label>
            <span>Тип</span>
            <select
              value={form.document_kind}
              onChange={(e) => setForm((p) => ({ ...p, document_kind: e.target.value }))}
            >
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Сформирован / выдан</span>
            <input
              type="datetime-local"
              value={form.issued_at}
              onChange={(e) => setForm((p) => ({ ...p, issued_at: e.target.value }))}
            />
          </label>
          <label>
            <span>Документы возвращены к нам</span>
            <input
              type="datetime-local"
              value={form.returned_at}
              onChange={(e) => setForm((p) => ({ ...p, returned_at: e.target.value }))}
            />
            <span className="customers-legal-docs__optional">по факту получения оригиналов</span>
          </label>
          <label className="customers-legal-docs__full">
            <span>Заметка</span>
            <input
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Номер, комментарий"
            />
          </label>
          <div className="customers-legal-docs__form-actions">
            <Button type="button" size="sm" onClick={handleCreate} disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="customers-legal-docs__muted">Загрузка…</p>
      ) : (
        <div className="customers-legal-docs__table-wrap">
          <table className="customers-legal-docs__table">
            <thead>
              <tr>
                <th>Заказ</th>
                <th>Документ</th>
                <th>Тип</th>
                <th>Сформирован / выдан</th>
                <th>Возврат к нам</th>
                <th>Заметка</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !showNew && (
                <tr>
                  <td colSpan={7} className="customers-legal-docs__muted">
                    Нет записей — добавьте акт, счёт, договор и даты
                  </td>
                </tr>
              )}
              {rows.map((r) =>
                editingId === r.id ? (
                  <tr key={r.id} className="customers-legal-docs__row--edit">
                    <td colSpan={7}>
                      <div className="customers-legal-docs__form customers-legal-docs__form--inline">
                        {orders.length > 0 && (
                          <label>
                            <span>Заказ</span>
                            <select
                              value={editForm.order_id}
                              onChange={(e) => setEditForm((p) => ({ ...p, order_id: e.target.value }))}
                            >
                              {orders.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.number || `#${o.id}`}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <label>
                          <span>Наименование</span>
                          <input
                            value={editForm.title}
                            onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                          />
                        </label>
                        <label>
                          <span>Тип</span>
                          <select
                            value={editForm.document_kind}
                            onChange={(e) => setEditForm((p) => ({ ...p, document_kind: e.target.value }))}
                          >
                            {KIND_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Сформирован / выдан</span>
                          <input
                            type="datetime-local"
                            value={editForm.issued_at}
                            onChange={(e) => setEditForm((p) => ({ ...p, issued_at: e.target.value }))}
                          />
                        </label>
                        <label>
                          <span>Возврат к нам</span>
                          <input
                            type="datetime-local"
                            value={editForm.returned_at}
                            onChange={(e) => setEditForm((p) => ({ ...p, returned_at: e.target.value }))}
                          />
                        </label>
                        <label className="customers-legal-docs__full">
                          <span>Заметка</span>
                          <input
                            value={editForm.notes}
                            onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))}
                          />
                        </label>
                        <div className="customers-legal-docs__form-actions">
                          <Button type="button" size="sm" onClick={() => handleUpdate(r.id)} disabled={saving}>
                            Сохранить
                          </Button>
                          <Button type="button" variant="secondary" size="sm" onClick={cancelEdit}>
                            Отмена
                          </Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={r.id}>
                    <td>{orderLabelFor(orders, r.order_id)}</td>
                    <td>{r.title}</td>
                    <td>{kindLabel(r.document_kind)}</td>
                    <td>{formatWhen(r.issued_at)}</td>
                    <td>
                      {r.returned_at ? formatWhen(r.returned_at) : <span className="customers-legal-docs__no">—</span>}
                    </td>
                    <td className="customers-legal-docs__notes">{r.notes || '—'}</td>
                    <td className="customers-legal-docs__actions">
                      <button type="button" className="customers-legal-docs__link" onClick={() => startEdit(r)}>
                        Изменить
                      </button>
                      <button type="button" className="customers-legal-docs__link" onClick={() => void handleDelete(r.id)}>
                        Удалить
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
