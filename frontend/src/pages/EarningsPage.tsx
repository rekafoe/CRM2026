import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { AdminPageLayout } from '../components/admin/AdminPageLayout';
import { Alert, Button, FormField, Modal } from '../components/common';
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
  const [totalPenalties, setTotalPenalties] = useState(0);
  const [totalBonuses, setTotalBonuses] = useState(0);
  const [totalNet, setTotalNet] = useState(0);
  const [penalties, setPenalties] = useState<Array<{ id: number; amount: number; reason: string; penaltyDate: string }>>([]);
  const [bonuses, setBonuses] = useState<Array<{ id: number; amount: number; reason: string; bonusDate: string }>>([]);
  const [showPenaltiesModal, setShowPenaltiesModal] = useState(false);
  const [showBonusesModal, setShowBonusesModal] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getMyEarnings({ month });
      const payload = res.data || {};
      setItems(Array.isArray(payload.items) ? payload.items : []);
      setTotal(Number(payload.total) || 0);
      setTotalPenalties(Number(payload.totalPenalties) || 0);
      setTotalBonuses(Number(payload.totalBonuses) || 0);
      const t = Number(payload.total) || 0;
      const tp = Number(payload.totalPenalties) || 0;
      const tb = Number(payload.totalBonuses) || 0;
      setTotalNet(Number(payload.totalNet) ?? Math.max(0, t + tb - tp));
      setPenalties(Array.isArray(payload.penalties) ? payload.penalties : []);
      setBonuses(Array.isArray(payload.bonuses) ? payload.bonuses : []);
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
          <button
            type="button"
            className="earnings-summary-card earnings-summary-card--bonus earnings-summary-card--clickable"
            onClick={() => setShowBonusesModal(true)}
          >
            <div className="earnings-summary-title">Премии</div>
            <div className="earnings-summary-value">+{totalBonuses.toFixed(2)} BYN</div>
          </button>
          <button
            type="button"
            className="earnings-summary-card earnings-summary-card--penalty earnings-summary-card--clickable"
            onClick={() => setShowPenaltiesModal(true)}
          >
            <div className="earnings-summary-title">Штрафы</div>
            <div className="earnings-summary-value">−{totalPenalties.toFixed(2)} BYN</div>
          </button>
          <div className="earnings-summary-card earnings-summary-card--net">
            <div className="earnings-summary-title">К выплате</div>
            <div className="earnings-summary-value">{totalNet.toFixed(2)} BYN</div>
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

      <Modal
        isOpen={showBonusesModal}
        onClose={() => setShowBonusesModal(false)}
        title="Мои премии"
        size="md"
        className="earnings-modal"
        overlayClassName="earnings-modal-overlay"
      >
        <div className="earnings-detail-modal">
          <p className="earnings-detail-modal__summary">
            За {month}: <strong>+{totalBonuses.toFixed(2)} BYN</strong>
          </p>
          {bonuses.length === 0 ? (
            <p className="earnings-detail-modal__empty">Нет премий за выбранный месяц</p>
          ) : (
            <table className="earnings-table earnings-table--aux">
              <thead>
                <tr><th>Дата</th><th>Сумма</th><th>Причина</th></tr>
              </thead>
              <tbody>
                {bonuses.map((b) => (
                  <tr key={b.id}>
                    <td>{b.bonusDate}</td>
                    <td className="earnings-amount earnings-amount--bonus">+{Number(b.amount).toFixed(2)} BYN</td>
                    <td>{b.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showPenaltiesModal}
        onClose={() => setShowPenaltiesModal(false)}
        title="Мои штрафы"
        size="md"
        className="earnings-modal"
        overlayClassName="earnings-modal-overlay"
      >
        <div className="earnings-detail-modal">
          <p className="earnings-detail-modal__summary">
            За {month}: <strong>−{totalPenalties.toFixed(2)} BYN</strong>
          </p>
          {penalties.length === 0 ? (
            <p className="earnings-detail-modal__empty">Нет штрафов за выбранный месяц</p>
          ) : (
            <table className="earnings-table earnings-table--aux">
              <thead>
                <tr><th>Дата</th><th>Сумма</th><th>Причина</th></tr>
              </thead>
              <tbody>
                {penalties.map((p) => (
                  <tr key={p.id}>
                    <td>{p.penaltyDate}</td>
                    <td className="earnings-amount earnings-amount--penalty">−{Number(p.amount).toFixed(2)} BYN</td>
                    <td>{p.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Modal>
    </AdminPageLayout>
  );
};
