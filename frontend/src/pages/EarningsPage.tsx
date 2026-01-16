import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminPageLayout } from '../components/admin/AdminPageLayout';
import { Alert, Button, FormField } from '../components/common';
import { getMyEarnings } from '../api';
import './EarningsPage.css';

type EarningsItem = {
  orderId: number;
  orderNumber?: string;
  itemId: number;
  itemType: string;
  itemName: string;
  itemTotal: number;
  percent: number;
  amount: number;
  earnedDate: string;
};

export const EarningsPage: React.FC = () => {
  const navigate = useNavigate();
  const [month, setMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<EarningsItem[]>([]);
  const [total, setTotal] = useState(0);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getMyEarnings({ month });
      const payload = res.data || {};
      setItems(Array.isArray(payload.items) ? payload.items : []);
      setTotal(Number(payload.total) || 0);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Не удалось загрузить проценты');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const itemsByDate = useMemo(() => {
    return items.slice().sort((a, b) => b.earnedDate.localeCompare(a.earnedDate));
  }, [items]);

  return (
    <AdminPageLayout
      title="Мои проценты"
      icon="💸"
      onBack={() => navigate('/')}
      className="earnings-page"
    >
      {error && <Alert type="error">{error}</Alert>}
      <div className="earnings-filters">
        <FormField label="Месяц">
          <input
            type="month"
            className="form-input"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </FormField>
        <Button variant="secondary" onClick={loadData} disabled={loading}>
          {loading ? 'Обновление…' : 'Обновить'}
        </Button>
      </div>

      <div className="earnings-summary">
        <div className="earnings-summary-card">
          <div className="earnings-summary-title">Итого за месяц</div>
          <div className="earnings-summary-value">{total.toFixed(2)} ₽</div>
        </div>
        <div className="earnings-summary-card">
          <div className="earnings-summary-title">Количество позиций</div>
          <div className="earnings-summary-value">{items.length}</div>
        </div>
      </div>

      <table className="earnings-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Заказ</th>
            <th>Позиция</th>
            <th>Сумма позиции</th>
            <th>%</th>
            <th>Начислено</th>
          </tr>
        </thead>
        <tbody>
          {itemsByDate.length === 0 && (
            <tr>
              <td colSpan={6} className="earnings-muted">
                Нет начислений за выбранный месяц
              </td>
            </tr>
          )}
          {itemsByDate.map((item) => (
            <tr key={`${item.itemId}-${item.earnedDate}`}>
              <td>{item.earnedDate}</td>
              <td>{item.orderNumber || `#${item.orderId}`}</td>
              <td>{item.itemName}</td>
              <td>{Number(item.itemTotal).toFixed(2)} ₽</td>
              <td>{Number(item.percent).toFixed(2)}%</td>
              <td>{Number(item.amount).toFixed(2)} ₽</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminPageLayout>
  );
};
