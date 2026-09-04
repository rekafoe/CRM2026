import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getCurrentUser, getCashRegisterDay, recalculateCashRegisterDay, getDepartments, getPrinterCountersByDate, getDepartmentCashActual, saveDepartmentCashActual, type Department } from '../api';
import { addCalendarDaysLocal, todayCalendarLocal } from '../utils/numberInput';
import { AppIcon, MoneyAmount, BynSymbol } from '../components/ui';
import './CountersPage.css';

function isAdminRole(role?: string | null): boolean {
  return String(role || '').toLowerCase() === 'admin';
}

function parseCashActual(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

interface PrinterCounter {
  id: number;
  code: string;
  name: string;
  value: number | null;
  prev_value: number | null;
  difference?: number | null;
  expected_clicks?: number;
}

interface CashData {
  actual: number | null;
  calculated: number;
  difference: number;
  dailyRevenue?: number;
  previousActual?: number | null;
  /** Общая сумма выданных заказов за день (debt_closed_events) */
  issuedOrdersTotal?: number;
  /** Выдано по операторам: user_id, user_name, amount */
  issuedByOperators?: Array<{ user_id: number; user_name: string; amount: number }>;
  /** Оборот заказов за день работы (справочно) */
  orderVolumeWorkDay?: number;
}

interface CashContribution {
  user_id: number;
  user_name?: string;
  cash_actual?: number | null;
}

interface User {
  id: number;
  name: string;
  role: string;
  department_id?: number | null;
}

interface CountersPageProps {
  isModal?: boolean;
}

export const CountersPage: React.FC<CountersPageProps> = ({ isModal = false }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Данные счетчиков
  const [printerCounters, setPrinterCounters] = useState<PrinterCounter[]>([]);
  const [cashData, setCashData] = useState<CashData>({ actual: null, calculated: 0, difference: 0 });
  
  // Состояние формы
  const [selectedDate, setSelectedDate] = useState<string>(todayCalendarLocal);
  const [editingPrinter, setEditingPrinter] = useState<number | null>(null);
  const [newCounterValue, setNewCounterValue] = useState<string>('');
  const [cashActualValue, setCashActualValue] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [recalculatingCash, setRecalculatingCash] = useState(false);
  const [printerExpectedClicks, setPrinterExpectedClicks] = useState<Record<number, number>>({});
  const [cashContributions, setCashContributions] = useState<CashContribution[]>([]);
  const [cashContributionsTotal, setCashContributionsTotal] = useState<number>(0);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | undefined>(undefined);
  const [scopeReady, setScopeReady] = useState(false);
  const [cashRefreshing, setCashRefreshing] = useState(false);
  const [printersRefreshing, setPrintersRefreshing] = useState(false);
  const isAdmin = isAdminRole(user?.role);
  const departmentLocked = !isAdmin;
  const [activeTab, setActiveTab] = useState<'cash' | 'printers'>('cash');
  const cashRequestSeq = useRef(0);
  const printerRequestSeq = useRef(0);
  const previousDateLabel = useMemo(
    () => addCalendarDaysLocal(selectedDate, -1),
    [selectedDate],
  );
  const canLoadScopedData = Boolean(user && scopeReady && (isAdmin || selectedDepartmentId != null));
  const dataRefreshing = cashRefreshing || (activeTab === 'printers' && printersRefreshing);

  const loadCashData = useCallback(async () => {
    const seq = ++cashRequestSeq.current;
    setCashRefreshing(true);
    setError(null);
    try {
      const previousDateKey = addCalendarDaysLocal(selectedDate, -1);
      const deptParam =
        selectedDepartmentId != null ? { department_id: selectedDepartmentId } : undefined;

      const actualPromise =
        selectedDepartmentId != null
          ? getDepartmentCashActual(selectedDate, { department_id: selectedDepartmentId }).then((res) =>
              parseCashActual(res.data?.cash_actual),
            )
          : Promise.resolve(null);
      const previousActualPromise =
        selectedDepartmentId != null
          ? getDepartmentCashActual(previousDateKey, { department_id: selectedDepartmentId }).then((res) =>
              parseCashActual(res.data?.cash_actual),
            )
          : Promise.resolve(null);

      const [actualCash, previousActualCash, cashRegisterRes] = await Promise.all([
        actualPromise,
        previousActualPromise,
        getCashRegisterDay(selectedDate, deptParam),
      ]);
      if (seq !== cashRequestSeq.current) return;

      const reg = cashRegisterRes.data;
      const dailyRevenue = Number(reg.cash_in_today ?? 0);
      const issuedOrdersTotal = Number(reg.issued_today ?? 0);
      const issuedByOperators = Array.isArray(reg.issued_by_operators) ? reg.issued_by_operators : [];

      const contributionsToShow: CashContribution[] = (reg.contributions_by_user ?? []).map((c) => ({
        user_id: c.user_id,
        user_name: c.user_name || `ID ${c.user_id}`,
        cash_actual: c.amount,
      }));
      const total = contributionsToShow.reduce((sum, report) => sum + Number(report.cash_actual || 0), 0);
      setCashContributions(contributionsToShow);
      setCashContributionsTotal(total);
      setCashActualValue(actualCash != null ? String(actualCash) : '');

      const calculatedCash = Number(previousActualCash || 0) + dailyRevenue;
      const difference = actualCash !== null ? actualCash - calculatedCash : 0;

      setCashData({
        actual: actualCash,
        calculated: calculatedCash,
        difference,
        dailyRevenue,
        previousActual: previousActualCash,
        issuedOrdersTotal,
        issuedByOperators,
        orderVolumeWorkDay: Number(reg.order_volume_work_day ?? 0),
      });
    } catch (err: unknown) {
      if (seq !== cashRequestSeq.current) return;
      console.error('Error loading cash data:', err);
      setError('Ошибка загрузки кассы');
      setCashData({
        actual: null,
        calculated: 0,
        difference: 0,
        dailyRevenue: 0,
        previousActual: null,
        issuedOrdersTotal: 0,
        issuedByOperators: [],
      });
      setCashContributions([]);
      setCashContributionsTotal(0);
    } finally {
      if (seq === cashRequestSeq.current) setCashRefreshing(false);
    }
  }, [selectedDate, selectedDepartmentId]);

  const loadPrinters = useCallback(async () => {
    const seq = ++printerRequestSeq.current;
    setPrintersRefreshing(true);
    setError(null);
    try {
      const deptParam =
        selectedDepartmentId != null ? { department_id: selectedDepartmentId } : undefined;
      const countersResponse = await getPrinterCountersByDate(selectedDate, deptParam);
      if (seq !== printerRequestSeq.current) return;

      const counters = (Array.isArray(countersResponse.data) ? countersResponse.data : []).map((counter: PrinterCounter) => ({
        ...counter,
        difference:
          counter.value != null && counter.prev_value != null
            ? counter.value - counter.prev_value
            : null,
      }));
      setPrinterCounters(counters);

      const expectedClicks: Record<number, number> = {};
      for (const printer of counters) {
        expectedClicks[printer.id] = Number(printer.expected_clicks ?? 0);
      }
      setPrinterExpectedClicks(expectedClicks);
    } catch (err: unknown) {
      if (seq !== printerRequestSeq.current) return;
      console.error('Error loading counters:', err);
      setError('Ошибка загрузки счетчиков');
    } finally {
      if (seq === printerRequestSeq.current) setPrintersRefreshing(false);
    }
  }, [selectedDate, selectedDepartmentId]);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const response = await getCurrentUser();
        const me = response.data;
        const admin = isAdminRole(me?.role);
        if (admin) {
          setSelectedDepartmentId(undefined);
        } else if (me?.department_id != null && Number(me.department_id) > 0) {
          setSelectedDepartmentId(Number(me.department_id));
        } else {
          setSelectedDepartmentId(undefined);
        }
        setUser(me);
        setScopeReady(true);
      } catch (err: unknown) {
        console.error('Failed to load user:', err);
        navigate('/');
      } finally {
        setLoading(false);
      }
    };
    void loadUser();
  }, [navigate]);

  useEffect(() => {
    getDepartments()
      .then((res) => setDepartments(Array.isArray(res.data) ? res.data : []))
      .catch(() => setDepartments([]));
  }, []);

  useEffect(() => {
    if (!canLoadScopedData) return;
    void loadCashData();
  }, [canLoadScopedData, loadCashData]);

  useEffect(() => {
    if (!canLoadScopedData || activeTab !== 'printers') return;
    void loadPrinters();
  }, [canLoadScopedData, activeTab, loadPrinters]);

  const handleRecalculateCash = async () => {
    try {
      setRecalculatingCash(true);
      setError(null);
      await recalculateCashRegisterDay(selectedDate, {
        department_id: selectedDepartmentId,
      });
      await loadCashData();
    } catch (err: unknown) {
      console.error('Recalculate cash register failed', err);
      setError('Не удалось пересчитать кассу из CRM');
    } finally {
      setRecalculatingCash(false);
    }
  };

  const updatePrinterCounter = async (printerId: number, value: number) => {
    try {
      setSaving(true);
      await api.post(`/printers/${printerId}/counters`, {
        counter_date: selectedDate,
        value: value
      });
      await loadPrinters();
      setEditingPrinter(null);
      setNewCounterValue('');
    } catch (error: any) {
      console.error('Error updating printer counter:', error);
      setError('Ошибка обновления счетчика');
    } finally {
      setSaving(false);
    }
  };

  const updateCashActual = async (value: number) => {
    if (!user) return;
    if (selectedDepartmentId == null) {
      setError('Выберите точку, чтобы сохранить кассу');
      return;
    }
    
    try {
      setSaving(true);
      await saveDepartmentCashActual(selectedDate, value, { department_id: selectedDepartmentId });
      await loadCashData();
    } catch (error: any) {
      console.error('Error updating cash actual:', error);
      setError(`Ошибка обновления кассы: ${error.response?.data?.message || error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const getTotalPrinterDifference = () => {
    return printerCounters.reduce((sum, printer) => {
      return sum + (printer.difference || 0);
    }, 0);
  };

  const getExpectedClicksForPrinter = (printerId: number) => {
    return printerExpectedClicks[printerId] ?? 0;
  };

  const getExpectedPrinterCounter = (printerId: number, prevValue: number | null | undefined) => {
    const base = Number(prevValue ?? 0);
    return base + getExpectedClicksForPrinter(printerId);
  };

  const getPrinterDelta = (printerId: number, currentValue: number | null | undefined, prevValue: number | null | undefined) => {
    if (currentValue === null || currentValue === undefined) return null;
    const expectedCounter = getExpectedPrinterCounter(printerId, prevValue);
    return currentValue - expectedCounter;
  };

  const getCashStatus = () => {
    if (cashData.actual === null) return 'warning';
    if (Math.abs(cashData.difference) < 0.01) return 'success';
    return 'error';
  };

  const getCashStatusIcon = () => {
    const status = getCashStatus();
    switch (status) {
      case 'success': return '✅';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      default: return '💰';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ru-RU');
  };

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    setEditingPrinter(null);
    setNewCounterValue('');
  };

  const handlePrinterEdit = (printerId: number) => {
    setEditingPrinter(printerId);
    setNewCounterValue('');
  };

  const handlePrinterSave = () => {
    if (!editingPrinter || !newCounterValue) return;
    const value = parseInt(newCounterValue);
    if (!isNaN(value)) {
      updatePrinterCounter(editingPrinter, value);
    }
  };

  const handleCashSave = () => {
    const value = parseFloat(cashActualValue);
    if (!isNaN(value) && cashActualValue.trim() !== '') {
      updateCashActual(value);
    } else {
      setError('Введите корректную сумму');
    }
  };

  const handleCashInputChange = (value: string) => {
    setCashActualValue(value);
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      // Обновляем разницу в реальном времени
      const difference = numValue - cashData.calculated;
      setCashData(prev => ({
        ...prev,
        actual: numValue,
        difference
      }));
    }
  };

  if (loading) {
    return (
      <div className="counters-page">
        <div className="counters-loading">
          <div className="loading-spinner"></div>
          <p>Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="counters-page">
        <div className="counters-error">
          <p>Ошибка загрузки пользователя</p>
          <button onClick={() => navigate('/')}>Вернуться на главную</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`counters-page ${isModal ? 'counters-page--modal' : ''}`}>
      <div className="counters-header">
        <div className="header-content">
          {!isModal && (
            <button 
              onClick={() => navigate('/')} 
              className="back-btn"
              title="Вернуться на главную"
            >
              ← Назад
            </button>
          )}
          {!isModal && (
            <div className="header-text">
              <h1><AppIcon name="chart-bar" size="sm" /> Счётчики принтеров и кассы</h1>
              <p>Контроль счетчиков принтеров и сверка кассы</p>
            </div>
          )}
        </div>
        
        <div className="date-selector">
          <label htmlFor="date-input"><AppIcon name="calendar" size="xs" /> Дата:</label>
          <input
            id="date-input"
            type="date"
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="date-input"
          />
        </div>
        <div className="date-selector">
          <label htmlFor="dept-input"><AppIcon name="building" size="xs" /> Точка:</label>
          <select
            id="dept-input"
            className="date-input"
            value={selectedDepartmentId ?? ''}
            disabled={departmentLocked}
            onChange={(e) => setSelectedDepartmentId(e.target.value === '' ? undefined : Number(e.target.value))}
          >
            {isAdmin ? <option value="">Все точки</option> : null}
            {!isAdmin && selectedDepartmentId != null && !departments.some((d) => d.id === selectedDepartmentId) ? (
              <option value={selectedDepartmentId}>Точка #{selectedDepartmentId}</option>
            ) : null}
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="counters-error-banner">
          <AppIcon name="warning" size="xs" /> {error}
          <button onClick={() => setError(null)} aria-label="Закрыть"><AppIcon name="x" size="xs" /></button>
        </div>
      )}

      {!isAdmin && selectedDepartmentId == null && (
        <div className="counters-error-banner">
          <AppIcon name="warning" size="xs" /> Пользователь не привязан к точке — касса и счётчики недоступны
        </div>
      )}

      <div className="counters-tabs">
        <button
          type="button"
          className={`counters-tab ${activeTab === 'cash' ? 'active' : ''}`}
          onClick={() => setActiveTab('cash')}
        >
          <AppIcon name="wallet" size="xs" /> Касса
        </button>
        <button
          type="button"
          className={`counters-tab ${activeTab === 'printers' ? 'active' : ''}`}
          onClick={() => setActiveTab('printers')}
        >
          <AppIcon name="printer" size="xs" /> Принтеры
        </button>
      </div>

      <div className={`counters-content ${dataRefreshing ? 'counters-content--busy' : ''}`}>
        {dataRefreshing && (
          <div className="counters-refreshing" aria-live="polite">
            <div className="loading-spinner"></div>
            <p>Обновление...</p>
          </div>
        )}
        {activeTab === 'cash' && (
        <div className="counters-section">
          <div className="section-header">
            <h2><AppIcon name="wallet" size="sm" /> Касса</h2>
            <p>Сверка фактической и расчётной суммы. В кассу — оплаты и выдачи за выбранную дату (не месячный оборот из админ-отчётов).</p>
          </div>

          <div className="cash-recalculate-row">
            <button
              type="button"
              className="save-btn"
              onClick={handleRecalculateCash}
              disabled={recalculatingCash || saving}
            >
              {recalculatingCash ? (
                <><AppIcon name="refresh" size="xs" /> Пересчёт...</>
              ) : (
                <><AppIcon name="refresh" size="xs" /> Пересчитать из CRM</>
              )}
            </button>
          </div>
          
          <div className="cash-card">
            <div className="cash-row">
              <div className="cash-label">Фактическая сумма (из терминала):</div>
              <div className="cash-input-group">
                <input
                  type="number"
                  step="0.01"
                  className="cash-input"
                  value={cashActualValue}
                  onChange={(e) => handleCashInputChange(e.target.value)}
                  placeholder="Введите сумму"
                />
                <span className="currency"><BynSymbol /></span>
                <button
                  className="save-btn"
                  onClick={handleCashSave}
                  disabled={saving || !cashActualValue.trim() || selectedDepartmentId == null}
                >
                  {saving ? <><AppIcon name="refresh" size="xs" /> Сохранение...</> : <><AppIcon name="save" size="xs" /> Сохранить</>}
                </button>
              </div>
            </div>
            
            <div className="cash-row">
              <div className="cash-label">Счётчик за вчера (факт):</div>
              <div className="cash-value">
                <MoneyAmount value={cashData.previousActual} />
              </div>
            </div>

            <div className="cash-row">
              <div className="cash-label">В кассу за день (CRM):</div>
              <div className="cash-value"><MoneyAmount value={cashData.dailyRevenue ?? 0} /></div>
            </div>

            {(cashData.orderVolumeWorkDay ?? 0) > 0 && (
              <div className="cash-row cash-row--hint">
                <div className="cash-label">Оборот заказов за день работы (справочно):</div>
                <div className="cash-value cash-value--muted">
                  <MoneyAmount value={cashData.orderVolumeWorkDay ?? 0} />
                </div>
              </div>
            )}

            <div className="cash-row">
              <div className="cash-label">Выдано за день (общая сумма):</div>
              <div className="cash-value"><MoneyAmount value={cashData.issuedOrdersTotal ?? 0} /></div>
            </div>

            {(cashData.issuedByOperators?.length ?? 0) > 0 && (
              <div className="cash-contributions">
                <div className="cash-contributions-header">Выдано по операторам:</div>
                <div className="cash-contributions-list">
                  {cashData.issuedByOperators!.map((op, idx) => (
                    <div key={`${op.user_id}-${op.user_name}-${idx}`} className="cash-contribution-row">
                      <span className="cash-contribution-user">{op.user_name}</span>
                      <span className="cash-contribution-amount"><MoneyAmount value={op.amount} /></span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="cash-row">
              <div className="cash-label">Расчётный счётчик (CRM):</div>
              <div className="cash-value"><MoneyAmount value={cashData.calculated} /></div>
            </div>
            
            <div className="cash-row">
              <div className="cash-label">Разница:</div>
              <div className={`cash-difference ${getCashStatus()}`}>
                <MoneyAmount value={cashData.difference} signed />
              </div>
            </div>

            <div className="cash-contributions">
              <div className="cash-contributions-header">Вклады в кассу (по пользователям):</div>
              {cashContributions.length === 0 ? (
                <div className="cash-contributions-empty">Нет данных за выбранную дату</div>
              ) : (
                <>
                  <div className="cash-contributions-list">
                    {cashContributions.map((report) => (
                      <div key={report.user_id} className="cash-contribution-row">
                        <span className="cash-contribution-user">
                          {report.user_name || `Пользователь #${report.user_id}`}
                        </span>
                        <span className="cash-contribution-amount">
                          <MoneyAmount value={Number(report.cash_actual || 0)} />
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="cash-contribution-total">
                    <span>Итого за день:</span>
                    <span><MoneyAmount value={cashContributionsTotal} /></span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        )}

        {activeTab === 'printers' && (
        <div className="counters-section">
          <div className="section-header">
            <h2><AppIcon name="printer" size="sm" /> Счётчики принтеров</h2>
            <p>Сверка кликов SRA3: расчетные vs фактические</p>
          </div>
          
          <div className="printers-grid">
            {printerCounters.length === 0 ? (
              <p className="cash-contributions-empty">
                На этой точке нет принтеров. Привяжите принтеры к департаменту в админке «Принтеры».
              </p>
            ) : printerCounters.map(printer => (
              <div key={printer.id} className="printer-card">
                <div className="printer-header">
                  <div className="printer-info">
                    <h3>{printer.name}</h3>
                    <span className="printer-code">({printer.code})</span>
                  </div>
                  <button
                    className="edit-btn"
                    onClick={() => handlePrinterEdit(printer.id)}
                    disabled={saving}
                    title="Редактировать"
                  >
                    <AppIcon name="pencil" size="xs" />
                  </button>
                </div>
                
                <div className="printer-values">
                  <div className="value-row">
                    <span className="value-label">Вчера ({previousDateLabel}):</span>
                    <span className="value-previous">
                      {printer.prev_value !== null ? printer.prev_value.toLocaleString() : '—'}
                    </span>
                  </div>
                  
                  <div className="value-row">
                    <span className="value-label">Сегодня ({selectedDate}):</span>
                    <span className="value-current">
                      {printer.value !== null ? printer.value.toLocaleString() : '—'}
                    </span>
                  </div>
                  
                  <div className="value-row">
                    <span className="value-label">Разница:</span>
                    <span className={`value-difference ${printer.difference != null ? (printer.difference >= 0 ? 'positive' : 'negative') : 'neutral'}`}>
                      {printer.difference != null ? (printer.difference >= 0 ? '+' : '') + printer.difference : '—'}
                    </span>
                  </div>
                  <div className="value-row">
                    <span className="value-label">Клики за день (CRM):</span>
                    <span className="value-calculated">
                      {getExpectedClicksForPrinter(printer.id).toLocaleString()}
                    </span>
                  </div>
                  <div className="value-row">
                    <span className="value-label">Расчётный счётчик:</span>
                    <span className="value-calculated">
                      {getExpectedPrinterCounter(printer.id, printer.prev_value).toLocaleString()}
                    </span>
                  </div>
                  <div className="value-row">
                    <span className="value-label">Отклонение:</span>
                    {getPrinterDelta(printer.id, printer.value, printer.prev_value) === null ? (
                      <span className="value-difference neutral">—</span>
                    ) : (
                      <span className={`value-difference ${getPrinterDelta(printer.id, printer.value, printer.prev_value)! >= 0 ? 'positive' : 'negative'}`}>
                        {getPrinterDelta(printer.id, printer.value, printer.prev_value)! >= 0 ? '+' : ''}
                        {getPrinterDelta(printer.id, printer.value, printer.prev_value)}
                      </span>
                    )}
                  </div>
                </div>
                
                {editingPrinter === printer.id && (
                  <div className="printer-edit">
                    <input
                      type="number"
                      className="counter-input"
                      placeholder="Новый счетчик"
                      value={newCounterValue}
                      onChange={(e) => setNewCounterValue(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handlePrinterSave();
                        }
                      }}
                    />
                    <div className="edit-actions">
                    <button
                      className="save-btn"
                      onClick={handlePrinterSave}
                      disabled={saving || !newCounterValue}
                    >
                      {saving ? <><AppIcon name="refresh" size="xs" /> Сохранение...</> : <><AppIcon name="save" size="xs" /> Сохранить</>}
                    </button>
                    <button
                      className="cancel-btn"
                      onClick={() => {
                        setEditingPrinter(null);
                        setNewCounterValue('');
                      }}
                    >
                      <AppIcon name="x" size="xs" /> Отмена
                    </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        )}
      </div>
    </div>
  );
};
