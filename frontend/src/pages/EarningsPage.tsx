import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { AdminPageLayout } from '../components/admin/AdminPageLayout';
import { Alert, Button, FormField } from '../components/common';
import { AppIcon } from '../components/ui/AppIcon';
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

  // Группировка по дням
  const { groupedByDate, todayTotal } = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const sorted = items.slice().sort((a, b) => b.earnedDate.localeCompare(a.earnedDate));
    
    // Группируем по дате
    const groups: Record<string, { items: EarningsItem[]; total: number }> = {};
    let todaySum = 0;
    
    for (const item of sorted) {
      const date = item.earnedDate.slice(0, 10);
      if (!groups[date]) {
        groups[date] = { items: [], total: 0 };
      }
      groups[date].items.push(item);
      groups[date].total += Number(item.amount) || 0;
      
      if (date === today) {
        todaySum += Number(item.amount) || 0;
      }
    }
    
    return {
      groupedByDate: Object.entries(groups).sort(([a], [b]) => b.localeCompare(a)),
      todayTotal: todaySum
    };
  }, [items]);

  // Статистика выработки: заказов и общая стоимость за день/месяц
  const outputStats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayItems = items.filter((i) => i.earnedDate.slice(0, 10) === today);
    const todayOrderIds = new Set(todayItems.map((i) => i.orderId));
    const todayOrdersCount = todayOrderIds.size;
    const todayOrderValue = todayItems.reduce((s, i) => s + (Number(i.itemTotal) || 0), 0);
    const monthOrderIds = new Set(items.map((i) => i.orderId));
    const monthOrdersCount = monthOrderIds.size;
    const monthOrderValue = items.reduce((s, i) => s + (Number(i.itemTotal) || 0), 0);
    return {
      todayOrdersCount,
      todayOrderValue,
      monthOrdersCount,
      monthOrderValue,
    };
  }, [items]);

  const handleExportExcel = useCallback(() => {
    const rows = items
      .slice()
      .sort((a, b) => b.earnedDate.localeCompare(a.earnedDate))
      .map((item) => ({
        Дата: item.earnedDate.slice(0, 10),
        Заказ: item.orderNumber || `#${item.orderId}`,
        Позиция: item.itemName,
        'Сумма позиции': Number(item.itemTotal),
        '%': Number(item.percent),
        Начислено: Number(item.amount),
      }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Проценты');
    const fileName = `мои-проценты-${month}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }, [items, month]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (dateStr === today.toISOString().slice(0, 10)) {
      return 'Сегодня';
    }
    if (dateStr === yesterday.toISOString().slice(0, 10)) {
      return 'Вчера';
    }
    return date.toLocaleDateString('ru-RU', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short' 
    });
  };

  return (
    <AdminPageLayout
      title="Мои проценты"
      icon={<AppIcon name="briefcase" size="sm" />}
      onBack={() => navigate('/')}
      className="earnings-page"
      headerExtra={
        <>
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
          <Button variant="secondary" onClick={handleExportExcel} disabled={items.length === 0}>
            Экспорт в Excel
          </Button>
        </>
      }
    >
      {error && <Alert type="error">{error}</Alert>}
      <div className="earnings-summary earnings-summary--row">
        <div className="earnings-summary-group">
          <div className="earnings-summary-card earnings-summary-card--today">
            <div className="earnings-summary-title"><AppIcon name="wallet" size="xs" /> Сегодня</div>
            <div className="earnings-summary-value">{todayTotal.toFixed(2)} BYN</div>
          </div>
          <div className="earnings-summary-card">
            <div className="earnings-summary-title">Итого за месяц</div>
            <div className="earnings-summary-value">{total.toFixed(2)} BYN</div>
          </div>
          <div className="earnings-summary-card">
            <div className="earnings-summary-title">Количество позиций</div>
            <div className="earnings-summary-value">{items.length}</div>
          </div>
        </div>
        <div className="earnings-summary-group earnings-summary-group--right">
          <div className="earnings-summary-card">
            <div className="earnings-summary-title">Выработка за день</div>
            <div className="earnings-summary-value">
              {outputStats.todayOrdersCount} заказов · {outputStats.todayOrderValue.toFixed(2)} BYN
            </div>
          </div>
          <div className="earnings-summary-card">
            <div className="earnings-summary-title">Выработка за месяц</div>
            <div className="earnings-summary-value">
              {outputStats.monthOrderValue.toFixed(2)} BYN
            </div>
          </div>
        </div>
      </div>

      {groupedByDate.length === 0 ? (
        <div className="earnings-empty">
          <div className="earnings-muted">Нет начислений за выбранный месяц</div>
        </div>
      ) : (
        <div className="earnings-days">
          {groupedByDate.map(([date, { items: dayItems, total: dayTotal }]) => (
            <div key={date} className="earnings-day-group">
              <div className="earnings-day-header">
                <span className="earnings-day-title">{formatDate(date)}</span>
                <span className="earnings-day-total">{dayTotal.toFixed(2)} BYN</span>
              </div>
              <table className="earnings-table">
                <colgroup>
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '38%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '20%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Заказ</th>
                    <th>Позиция</th>
                    <th>Сумма позиции</th>
                    <th>%</th>
                    <th>Начислено</th>
                  </tr>
                </thead>
                <tbody>
                  {dayItems.map((item) => (
                    <tr key={`${item.itemId}-${item.earnedDate}`}>
                      <td>{item.orderNumber || `#${item.orderId}`}</td>
                      <td>{item.itemName}</td>
                      <td>{Number(item.itemTotal).toFixed(2)} BYN</td>
                      <td>{Number(item.percent).toFixed(2)}%</td>
                      <td className="earnings-amount">{Number(item.amount).toFixed(2)} BYN</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </AdminPageLayout>
  );
};
