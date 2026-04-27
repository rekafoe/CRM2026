// frontend/src/pages/DailyReportPage.tsx
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getDailyReports, getDailyReportByDate, updateDailyReport, getUsers, getPrinters, submitPrinterCounter, getPrinterCountersByDate, getDailySummary, getCurrentUser, getFullDailyReport, saveFullDailyReport } from '../api';
import { DailyReport } from '../types';
import EditModal from '../components/EditReportModal';
import { BynSymbol, MoneyAmount } from '../components/ui';

export const DailyReportPage: React.FC = () => {
  const [history, setHistory] = useState<DailyReport[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [isModalOpen, setModalOpen] = useState(false);
  const [filterUserId, setFilterUserId] = useState<number | ''>('');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [users, setUsers] = useState<{ id: number; name: string }[]>([]);
  const [printers, setPrinters] = useState<{ id: number; code: string; name: string }[]>([]);
  const [counterDate, setCounterDate] = useState<string>(() => new Date().toISOString().slice(0,10));
  const [counters, setCounters] = useState<Record<number, string>>({});
  const [printerCounters, setPrinterCounters] = useState<any[]>([]);
  const [summary, setSummary] = useState<any | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: number; name: string; role: string } | null>(null);
  const [showAllUsers, setShowAllUsers] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    getUsers().then(r => setUsers(r.data));
    getPrinters().then(r => setPrinters(r.data));
    getCurrentUser().then(r => setCurrentUser(r.data)).catch(() => setCurrentUser(null));
  }, []);

  // Initialize from query params: ?user_id=...&date=YYYY-MM-DD
  useEffect(() => {
    const qpUser = searchParams.get('user_id');
    const qpDate = searchParams.get('date');
    setSelectedDate(qpDate || null);
    if (qpUser) {
      setFilterUserId(Number(qpUser));
      setShowAllUsers(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadReports();
  }, [currentUser, showAllUsers, filterUserId, fromDate, toDate]);

  const loadReports = () => {
    const params: any = {};
    
    if (showAllUsers && currentUser?.role === 'admin') {
      // Администратор может видеть все отчёты
      if (filterUserId) {
        params.user_id = filterUserId;
      }
    } else if (currentUser) {
      // Обычный пользователь видит только свои отчёты
      params.current_user_id = currentUser.id;
    }
    
    if (fromDate) params.from = fromDate;
    if (toDate) params.to = toDate;
    
    getDailyReports(params).then(res => {
      setHistory(res.data);
      if (res.data.length) {
        setSelectedDate(res.data[0].report_date);
        setSelectedUserId(res.data[0].user_id ?? null);
      }
    });
  };

  useEffect(() => {
    if (selectedDate) {
      const uid = (currentUser?.role === 'admin' && showAllUsers && filterUserId) ? Number(filterUserId) : currentUser?.id;
      setSelectedUserId(uid ?? null);
      getDailyReportByDate(selectedDate, uid ?? undefined)
        .then(res => setReport(res.data))
        .catch(async () => {
          // Больше не создаём задним числом; только на сегодня через логин
          setReport(null);
        });
      getPrinterCountersByDate(selectedDate).then(r => setPrinterCounters(r.data as any[]));
      getDailySummary(selectedDate).then(r => setSummary(r.data as any));
      // Reflect in URL for deep-link
      const next = new URLSearchParams(searchParams);
      next.set('date', selectedDate);
      if (uid) next.set('user_id', String(uid)); else next.delete('user_id');
      setSearchParams(next);
    }
  }, [selectedDate]);

  return (
    <div style={{ display: 'flex', padding: 16 }}>
      <aside style={{ width: 200, marginRight: 16 }}>
        <h2>Архив отчётов</h2>
        
        {/* Информация о текущем пользователе */}
        {currentUser && (
          <div style={{ 
            padding: '8px', 
            backgroundColor: '#f5f5f5', 
            borderRadius: '4px', 
            marginBottom: '16px',
            fontSize: '14px'
          }}>
            <div><strong>Пользователь:</strong> {currentUser.name}</div>
            <div><strong>Роль:</strong> {currentUser.role}</div>
          </div>
        )}

        {/* Переключатель режима для администраторов */}
        {currentUser?.role === 'admin' && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              <input 
                type="checkbox" 
                checked={showAllUsers} 
                onChange={e => setShowAllUsers(e.target.checked)}
              />
              Показать все отчёты
            </label>
          </div>
        )}

        {/* Кнопка создания отчёта убрана: отчёт создаётся автоматически при логине */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '8px 0' }}>
          {/* Фильтр по пользователям - только для администраторов в режиме "все отчёты" */}
          {currentUser?.role === 'admin' && showAllUsers && (
            <select value={filterUserId} onChange={e => setFilterUserId(e.target.value ? +e.target.value : '')}>
              <option value="">Все пользователи</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          )}
          
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} placeholder="От даты" />
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} placeholder="До даты" />
          <button onClick={loadReports}>Обновить</button>
        </div>
        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
          {history.map(r => (
            <div
              key={r.id}
              onClick={() => { setSelectedDate(r.report_date); setSelectedUserId(r.user_id ?? null); }}
              style={{
                padding: 8,
                cursor: 'pointer',
                background: r.report_date === selectedDate ? '#eef' : undefined,
                borderBottom: '1px solid #eee'
              }}
            >
              <div style={{ fontWeight: 'bold' }}>{r.report_date}</div>
              <div style={{ fontSize: '12px', color: '#666' }}>
                Заказов: {r.orders_count} | Выручка: <MoneyAmount value={r.total_revenue} decimals={0} />
              </div>
              {r.user_name && (
                <div style={{ fontSize: '11px', color: '#888', fontStyle: 'italic' }}>
                  Пользователь: {r.user_name}
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      <section style={{ flex: 1 }}>
        {report ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>Отчёт за {selectedDate}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => {
                  if (!selectedDate) return;
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() - 1);
                  const prev = d.toISOString().slice(0,10);
                  setSelectedDate(prev);
                }}>← Предыдущий день</button>
                <input
                  type="date"
                  value={selectedDate || ''}
                  onChange={e => setSelectedDate(e.target.value)}
                />
                <button onClick={() => {
                  if (!selectedDate) return;
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() + 1);
                  const next = d.toISOString().slice(0,10);
                  setSelectedDate(next);
                }}>Следующий день →</button>
              </div>
            </div>
            <p>Заказов: {report.orders_count}</p>
            <p>
              Выручка:{' '}
              <MoneyAmount value={report.total_revenue} decimals={0} />
            </p>
            {(report.debt_closed_issued_by_me ?? 0) > 0 && (
              <p style={{ color: '#28a745' }}>
                {selectedUserId === currentUser?.id
                  ? 'Долги закрыты вами в этот день'
                  : 'Долги закрыты пользователем в этот день'}
                : <MoneyAmount value={report.debt_closed_issued_by_me!} signed decimals={0} />
              </p>
            )}
            <div style={{ margin: '8px 0', padding: 12, border: '1px dashed #ddd', borderRadius: 6 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ fontSize: 12, color: '#666' }}>Фактически в кассе (<BynSymbol />)</label>
                  <input
                    type="number"
                    value={report.cash_actual ?? ''}
                    onChange={e => setReport(r => r ? { ...r, cash_actual: Number(e.target.value) } : r)}
                    style={{ marginLeft: 8 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#666' }}>Ожидается по CRM (<BynSymbol />)</label>
                  <input type="number" value={report.total_revenue} disabled style={{ marginLeft: 8 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#666' }}>Δ Расхождение (<BynSymbol />)</label>
                  <input type="number" value={((report.cash_actual ?? 0) - (report.total_revenue || 0)).toFixed(2)} disabled style={{ marginLeft: 8 }} />
                </div>
                <button onClick={async () => {
                  try {
                    const res = await updateDailyReport(
                      report.report_date,
                      { cash_actual: report.cash_actual },
                      selectedUserId ?? undefined
                    );
                    setReport(res.data);
                    alert('Сохранено');
                  } catch { alert('Не удалось сохранить фактическую сумму'); }
                }}>Сохранить факт</button>
              </div>
            </div>
            {summary && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, margin: '8px 0' }}>
                <div className="order-total"><div className="order-total__line"><span>Позиции</span><span>{summary.items_qty}</span></div><div className="order-total__line"><span>Клики</span><span>{summary.total_clicks}</span></div></div>
                <div className="order-total"><div className="order-total__line"><span>Листы</span><span>{summary.total_sheets}</span></div><div className="order-total__line"><span>Брак</span><span>{summary.total_waste}</span></div></div>
                <div className="order-total">
                  <div className="order-total__line">
                    <span>Предоплаты (оплачено)</span>
                    <span><MoneyAmount value={summary.prepayment?.paid_amount || 0} decimals={0} /></span>
                  </div>
                  <div className="order-total__line">
                    <span>Ожидает</span>
                    <span><MoneyAmount value={summary.prepayment?.pending_amount || 0} decimals={0} /></span>
                  </div>
                </div>
                <div className="order-total">
                  <div className="order-total__line">
                    <span>🌐 Онлайн</span>
                    <span><MoneyAmount value={summary.prepayment?.online_paid_amount || 0} decimals={0} /></span>
                  </div>
                  <div className="order-total__line">
                    <span>🏪 Оффлайн</span>
                    <span><MoneyAmount value={summary.prepayment?.offline_paid_amount || 0} decimals={0} /></span>
                  </div>
                </div>
                <div className="order-total">
                  <div className="order-total__line">
                    <span>Общая сумма заказов</span>
                    <span><MoneyAmount value={summary.debt?.total_orders_amount || 0} decimals={0} /></span>
                  </div>
                  <div className="order-total__line">
                    <span>Долг клиентов</span>
                    <span style={{ color: (summary.debt?.total_debt||0) > 0 ? '#dc3545' : '#28a745' }}>
                      <MoneyAmount value={summary.debt?.total_debt || 0} decimals={0} />
                    </span>
                  </div>
                  {(summary.debt_closed_today ?? 0) > 0 && (
                    <div className="order-total__line">
                      <span>Долги закрыты в этот день</span>
                      <span style={{ color: '#28a745' }}>
                        <MoneyAmount value={summary.debt_closed_today ?? 0} signed decimals={0} />
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={() => setModalOpen(true)}>
                Редактировать
              </button>
              {currentUser?.role === 'admin' && (
                <button onClick={async () => {
                  if (!selectedDate) return;
                  const uid = selectedUserId ?? currentUser?.id;
                  const full = await getFullDailyReport(selectedDate, uid || undefined);
                  const orders = full.data.orders || [];
                  await saveFullDailyReport({
                    report_date: selectedDate,
                    user_id: uid || undefined,
                    orders_count: report.orders_count,
                    total_revenue: report.total_revenue,
                    created_at: report.created_at,
                    updated_at: report.updated_at,
                    id: report.id,
                    orders,
                    report_metadata: full.data.report_metadata
                  } as any);
                  alert('Снимок заказов сохранён в отчёте');
                }}>Сохранить снимок заказов</button>
              )}
            </div>

            {/* ===== СЧЁТЧИКИ ПРИНТЕРОВ ===== */}
            <div style={{ marginTop: 16, padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' }}>
              <h3 style={{ marginTop: 0 }}>Счётчики принтеров</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <span>Дата:</span>
                <input type="date" value={counterDate} onChange={e => setCounterDate(e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 150px 100px', gap: 8, alignItems: 'center' }}>
                <div style={{ fontWeight: 600 }}>Принтер</div>
                <div style={{ fontWeight: 600 }}>Предыдущее</div>
                <div style={{ fontWeight: 600 }}>Показание</div>
                <div />
                {printers.map(p => (
                  <React.Fragment key={p.id}>
                    <div>{p.name}</div>
                    <div>{printerCounters.find(pc => pc.id === p.id)?.prev_value ?? '—'}</div>
                    <input type="number" value={counters[p.id] || ''} onChange={e => setCounters(s => ({ ...s, [p.id]: e.target.value }))} />
                    <button onClick={async () => {
                      if (!counters[p.id]) return;
                      try {
                        await submitPrinterCounter(p.id, { counter_date: counterDate, value: Number(counters[p.id]) });
                        alert('Сохранено');
                        getPrinterCountersByDate(counterDate).then(r => setPrinterCounters(r.data as any[]));
                      } catch { alert('Не удалось сохранить'); }
                    }}>Сохранить</button>
                  </React.Fragment>
                ))}
              </div>
              {printerCounters.some(pc => !pc.value) && (
                <div style={{ marginTop: 8, color: '#b45309' }}>Внимание: не по всем принтерам внесены показания за выбранную дату.</div>
              )}
            </div>
            {/* ===== Снимок заказов (для администратора) ===== */}
            {currentUser?.role === 'admin' && (report as any)?.snapshot_json && (
              <div style={{ marginTop: 16 }}>
                <h3 style={{ margin: '8px 0' }}>Снимок заказов на день</h3>
                <pre style={{ whiteSpace: 'pre-wrap', background: '#f9fafb', padding: 12, borderRadius: 6, border: '1px solid #e5e7eb', maxHeight: 300, overflow: 'auto' }}>
                  {JSON.stringify(JSON.parse((report as any).snapshot_json || '{}'), null, 2)}
                </pre>
              </div>
            )}
          </>
        ) : (
          <p>Нет доступных данных</p>
        )}
      </section>

      {isModalOpen && report && (
        <EditModal
          report={report}
          onClose={() => setModalOpen(false)}
          onSave={async updates => {
            const res = await updateDailyReport(
              report.report_date,
              updates,
              selectedUserId ?? undefined
            );
            setReport(res.data);
            // обновим имя пользователя в списке
            const refreshed = await getDailyReports();
            setHistory(refreshed.data);
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
};
