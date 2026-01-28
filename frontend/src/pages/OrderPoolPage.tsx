import React, { useState, useEffect, useCallback, useMemo, useReducer } from 'react';
import { useNavigate } from 'react-router-dom';
import { Order } from '../types';
import { getOrders, reassignOrderByNumber, cancelOnlineOrder, getUsers, createPrepaymentLink, issueOrder } from '../api';
import { parseNumberFlexible } from '../utils/numberInput';
import { StatusBadge } from '../components/common/StatusBadge';
import { OrderHeader } from '../components/optimized/OrderHeader';
import { OrderContent } from '../components/optimized/OrderContent';
import { OrderTotal } from '../components/order/OrderTotal';
import { FilesModal } from '../components/FilesModal';
import { PrepaymentModal } from '../components/PrepaymentModal';
import { PrepaymentDetailsModal } from '../components/PrepaymentDetailsModal';
import { useToastNotifications } from '../components/Toast';
import { useLogger } from '../utils/logger';
import '../styles/order-pool.css';

interface OrderPoolPageProps {
  currentUserId: number;
  currentUserName: string;
}

type FilterState = {
  source: 'all' | 'crm' | 'website' | 'telegram';
  cancelled: 'all' | 'cancelled' | 'not_cancelled';
  assigned: 'all' | 'assigned' | 'not_assigned';
  searchInput: string;
  searchTerm: string;
  quickFilter: 'debt' | 'prepay' | null;
  sortBy: 'created_at' | 'number' | 'totalAmount';
  sortDirection: 'asc' | 'desc';
  visibleCount: number;
};

type FilterAction =
  | { type: 'setSource'; value: FilterState['source'] }
  | { type: 'setCancelled'; value: FilterState['cancelled'] }
  | { type: 'setAssigned'; value: FilterState['assigned'] }
  | { type: 'setSearchInput'; value: string }
  | { type: 'setSearchTerm'; value: string }
  | { type: 'setQuickFilter'; value: FilterState['quickFilter'] }
  | { type: 'setSortBy'; value: FilterState['sortBy'] }
  | { type: 'toggleSortDirection' }
  | { type: 'resetFilters' }
  | { type: 'resetVisible' }
  | { type: 'increaseVisible'; step?: number };

const initialFilters: FilterState = {
  source: 'all',
  cancelled: 'all',
  assigned: 'not_assigned',
  searchInput: '',
  searchTerm: '',
  quickFilter: null,
  sortBy: 'created_at',
  sortDirection: 'desc',
  visibleCount: 100,
};

function filtersReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case 'setSource':
      return { ...state, source: action.value };
    case 'setCancelled':
      return { ...state, cancelled: action.value };
    case 'setAssigned':
      return { ...state, assigned: action.value };
    case 'setSearchInput':
      return { ...state, searchInput: action.value };
    case 'setSearchTerm':
      return { ...state, searchTerm: action.value };
    case 'setQuickFilter':
      return { ...state, quickFilter: action.value };
    case 'setSortBy':
      return { ...state, sortBy: action.value };
    case 'toggleSortDirection':
      return { ...state, sortDirection: state.sortDirection === 'asc' ? 'desc' : 'asc' };
    case 'resetFilters':
      return { ...state, source: 'all', cancelled: 'all', assigned: 'all', searchInput: '', searchTerm: '', quickFilter: null };
    case 'resetVisible':
      return { ...state, visibleCount: 100 };
    case 'increaseVisible':
      return { ...state, visibleCount: state.visibleCount + (action.step ?? 100) };
    default:
      return state;
  }
}

const OrderRow = React.memo<{
  order: Order;
  isSelected: boolean;
  onSelect: (order: Order) => void;
  getSourceLabel: (source?: string) => string;
  getAssigneeLabel: (order: Order) => string;
  getPaymentMethodLabel: (method?: string | null) => string;
  getOrderPrepayment: (order: Order) => number;
  getOrderDebt: (order: Order) => number;
  getOrderTotal: (order: Order) => number;
}>(
  ({
    order,
    isSelected,
    onSelect,
    getSourceLabel,
    getAssigneeLabel,
    getPaymentMethodLabel,
    getOrderPrepayment,
    getOrderDebt,
    getOrderTotal,
  }) => (
    <tr
      className={`${isSelected ? 'selected' : ''} ${order.userId ? 'assigned' : ''}`}
      onClick={() => onSelect(order)}
    >
      <td className="sticky-col">
        <div className="order-number">{order.number}</div>
      </td>
      <td>
        <div className="order-date">{new Date(order.created_at).toLocaleDateString()}</div>
      </td>
      <td>
        <div className="order-customer" title={order.customerName || 'Не указан'}>
          {order.customerName || 'Не указан'}
        </div>
      </td>
      <td>
        <div className="order-phone" title={order.customerPhone || 'Не указан'}>
          {order.customerPhone || '—'}
        </div>
      </td>
      <td>
        <div className="order-badges">
          {order.source && <StatusBadge status={getSourceLabel(order.source)} color="info" size="sm" />}
        </div>
      </td>
      <td>
        <div className="order-assignee">{getAssigneeLabel(order)}</div>
      </td>
      <td className="order-status">
        {order.userId ? (
          <span className="assigned-badge">✓ Назначен</span>
        ) : order.is_cancelled === 1 ? (
          <StatusBadge status="Отменён" color="error" size="sm" />
        ) : (
          <span style={{ color: '#666' }}>В пуле</span>
        )}
      </td>
      <td>
        <div className="order-payment-method">{getPaymentMethodLabel(order.paymentMethod)}</div>
      </td>
      <td className="numeric">
        <div className="order-prepayment">
          {getOrderPrepayment(order) > 0 ? (
            <span className={`prepayment-amount ${order.prepaymentStatus === 'paid' ? 'paid' : 'pending'}`}>
              {getOrderPrepayment(order).toFixed(2)} BYN
              <br />
              <small className={`prepayment-status ${order.prepaymentStatus === 'paid' ? 'paid' : 'pending'}`}>
                {order.prepaymentStatus === 'paid' ? 'Оплачено' : 'Ожидает'}
              </small>
            </span>
          ) : (
            <span style={{ color: '#999' }}>—</span>
          )}
        </div>
      </td>
      <td className="numeric">
        <div className={`order-debt ${getOrderDebt(order) > 0 ? 'order-debt--due' : 'order-debt--paid'}`}>
          {getOrderDebt(order).toFixed(2)} BYN
        </div>
      </td>
      <td className="numeric">
        <div className="order-total">{getOrderTotal(order).toFixed(2)} BYN</div>
      </td>
    </tr>
  )
);

export const OrderPoolPage: React.FC<OrderPoolPageProps> = ({ currentUserId, currentUserName }) => {
  const navigate = useNavigate();
  const toast = useToastNotifications();
  const logger = useLogger('OrderPoolPage');

  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showFilesModal, setShowFilesModal] = useState(false);
  const [showPrepaymentModal, setShowPrepaymentModal] = useState(false);
  const [showPrepaymentDetailsModal, setShowPrepaymentDetailsModal] = useState(false);
  const [allUsers, setAllUsers] = useState<Array<{ id: number; name: string }>>([]);
  const [filters, dispatchFilters] = useReducer(filtersReducer, initialFilters);
  const selectedItems = selectedOrder?.items ?? [];
  const userNameById = useMemo(() => {
    const map = new Map<number, string>();
    allUsers.forEach((u) => map.set(Number(u.id), u.name));
    return map;
  }, [allUsers]);

  const orderMetrics = useMemo(() => {
    const map = new Map<number, { total: number; prepayment: number; debt: number }>();
    orders.forEach((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      const subtotal = items.reduce((sum, item) => {
        const price = parseNumberFlexible(item.price ?? 0);
        const qty = parseNumberFlexible(item.quantity ?? 1);
        return sum + price * qty;
      }, 0);
      const pct = (order as any).discount_percent ?? 0;
      const total = Math.round(subtotal * (1 - pct / 100) * 100) / 100;
      const prepayment = parseNumberFlexible(order.prepaymentAmount ?? 0);
      const debt = Math.max(0, total - prepayment);
      map.set(order.id, { total, prepayment, debt });
    });
    return map;
  }, [orders]);

  const getOrderTotal = useCallback((order: Order) => {
    return orderMetrics.get(order.id)?.total ?? 0;
  }, [orderMetrics]);

  const getOrderPrepayment = useCallback((order: Order) => {
    return orderMetrics.get(order.id)?.prepayment ?? 0;
  }, [orderMetrics]);

  const getOrderDebt = useCallback((order: Order) => {
    return orderMetrics.get(order.id)?.debt ?? 0;
  }, [orderMetrics]);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getOrders({ all: true });
      const list = res.data as Order[];
      setOrders(list);
      setError(null);
      setSelectedOrder((prev) => {
        if (!prev) return prev;
        const next = list.find((o) => o.id === prev!.id);
        return next ?? prev;
      });
    } catch (err) {
      logger.error('Failed to load orders for pool', err);
      setError('Не удалось загрузить заказы.');
    } finally {
      setLoading(false);
    }
  }, [logger]);

  useEffect(() => {
    if (isInitialized) return;
    loadOrders().then(() => setIsInitialized(true));
    getUsers().then(res => setAllUsers(res.data)).catch(err => logger.error('Failed to load users', err));
  }, [isInitialized, loadOrders, logger]);

  useEffect(() => {
    const t = setTimeout(() => dispatchFilters({ type: 'setSearchTerm', value: filters.searchInput.trim() }), 200);
    return () => clearTimeout(t);
  }, [filters.searchInput]);

  useEffect(() => {
    dispatchFilters({ type: 'resetVisible' });
  }, [filters.source, filters.cancelled, filters.assigned, filters.searchTerm, filters.quickFilter, filters.sortBy, filters.sortDirection]);

  const matchesSearch = useCallback((o: Order, term: string) => {
    const lower = term.toLowerCase();
    if (String(o.id ?? '').includes(lower)) return true;
    if (o.number?.toLowerCase().includes(lower)) return true;
    if (o.customerName?.toLowerCase().includes(lower)) return true;
    if (o.customerPhone?.toLowerCase().includes(lower)) return true;
    if (o.customerEmail?.toLowerCase().includes(lower)) return true;
    const desc = (o.items ?? []).some((item) => {
      const t = String(item.type ?? '').toLowerCase();
      const d = String((item.params as any)?.description ?? '').toLowerCase();
      return t.includes(lower) || d.includes(lower);
    });
    if (desc) return true;
    return false;
  }, []);

  const filteredOrders = useMemo(() => {
    const hasSearch = Boolean(filters.searchTerm?.trim());
    // Без поиска: только ожидающие (0) и оформленные с долгом (1). С поиском — по всем заказам, только поиск.
    let filtered: Order[];
    if (hasSearch) {
      const term = filters.searchTerm!.trim();
      filtered = orders.filter((o) => matchesSearch(o, term));
    } else {
      filtered = orders.filter((o) => {
        const s = Number(o.status);
        if (s === 0) return true;
        if (s === 1) return getOrderDebt(o) > 0;
        return false;
      });
      if (filters.source !== 'all') {
        filtered = filtered.filter((o) => o.source === filters.source);
      }
      if (filters.cancelled !== 'all') {
        filtered = filtered.filter((o) => (o.is_cancelled === 1) === (filters.cancelled === 'cancelled'));
      }
      if (filters.assigned !== 'all') {
        filtered = filtered.filter((o) => (o.userId != null) === (filters.assigned === 'assigned'));
      }
      if (filters.quickFilter === 'debt') {
        filtered = filtered.filter((o) => getOrderDebt(o) > 0);
      } else if (filters.quickFilter === 'prepay') {
        filtered = filtered.filter((o) => getOrderPrepayment(o) > 0);
      }
    }

    filtered.sort((a, b) => {
      let valA: any;
      let valB: any;

      if (filters.sortBy === 'created_at') {
        valA = new Date(a.created_at).getTime();
        valB = new Date(b.created_at).getTime();
      } else if (filters.sortBy === 'number') {
        valA = a.number || '';
        valB = b.number || '';
      } else if (filters.sortBy === 'totalAmount') {
        valA = getOrderTotal(a);
        valB = getOrderTotal(b);
      }

      if (valA < valB) return filters.sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return filters.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [
    orders,
    filters.source,
    filters.cancelled,
    filters.assigned,
    filters.searchTerm,
    filters.quickFilter,
    filters.sortBy,
    filters.sortDirection,
    getOrderTotal,
    getOrderDebt,
    getOrderPrepayment,
    matchesSearch,
  ]);

  const poolStats = useMemo(() => {
    const assigned = filteredOrders.filter((o) => o.userId != null).length;
    const cancelled = filteredOrders.filter((o) => o.is_cancelled === 1).length;
    const withDebt = filteredOrders.filter((o) => getOrderDebt(o) > 0).length;
    const withPrepay = filteredOrders.filter((o) => getOrderPrepayment(o) > 0).length;
    return { assigned, cancelled, withDebt, withPrepay };
  }, [filteredOrders, getOrderDebt, getOrderPrepayment]);

  const visibleOrders = useMemo(
    () => filteredOrders.slice(0, filters.visibleCount),
    [filteredOrders, filters.visibleCount]
  );
  const hasMoreOrders = visibleOrders.length < filteredOrders.length;

  const handleAssignToMe = useCallback(async (orderNumber: string) => {
    try {
      await reassignOrderByNumber(orderNumber, currentUserId);
      toast.success('Заказ назначен вам!', `Заказ ${orderNumber} успешно назначен.`);
      loadOrders();
    } catch (err) {
      logger.error('Failed to assign order', err);
      toast.error('Ошибка назначения', (err as Error).message);
    }
  }, [currentUserId, loadOrders, toast, logger]);

  const handleReassignTo = useCallback(async (orderNumber: string, userId: number) => {
    try {
      await reassignOrderByNumber(orderNumber, userId);
      const name = allUsers.find((u) => u.id === userId)?.name ?? 'оператору';
      toast.success('Заказ переназначен', `Заказ ${orderNumber} назначен ${name}.`);
      loadOrders();
    } catch (err) {
      logger.error('Failed to reassign order', err);
      toast.error('Ошибка переназначения', (err as Error).message);
    }
  }, [allUsers, loadOrders, toast, logger]);

  const handleIssueOrder = useCallback(async (orderId: number) => {
    try {
      await issueOrder(orderId);
      toast.success('Заказ выдан', 'Долг закрыт, заказ переведён в «Выдан»');
      loadOrders();
    } catch (err: any) {
      logger.error('Issue order failed', err);
      toast.error('Ошибка', err?.message ?? 'Не удалось выдать заказ');
    }
  }, [loadOrders, toast, logger]);

  const handleCancelOnline = useCallback(async (orderId: number) => {
    try {
      await cancelOnlineOrder(orderId);
      toast.success('Заказ отменен!', `Онлайн-заказ ${orderId} отменен и перемещен в пул.`);
      loadOrders();
    } catch (err) {
      logger.error('Failed to cancel online order', err);
      toast.error('Ошибка отмены', (err as Error).message);
    }
  }, [loadOrders, toast, logger]);

  const handlePrepaymentCreated = useCallback(
    async (amount: number, _email: string, paymentMethod: 'online' | 'offline' | 'telegram', assignToMe?: boolean) => {
      if (!selectedOrder) return;
      try {
        const method = paymentMethod === 'telegram' ? 'online' : paymentMethod;
        await createPrepaymentLink(selectedOrder.id, amount, method, assignToMe);
        await loadOrders();
        toast.success('Успешно', 'Предоплата обновлена');
      } catch (err: any) {
        logger.error('Prepayment failed', err);
        toast.error('Ошибка', err?.message ?? 'Не удалось обновить предоплату');
        throw err;
      }
    },
    [selectedOrder, loadOrders, toast, logger]
  );

  const getSourceLabel = (source?: string) => {
    switch (source) {
      case 'website': return 'Онлайн';
      case 'telegram': return 'Telegram';
      case 'crm': return 'CRM';
      default: return 'Неизвестно';
    }
  };

  const getAssigneeLabel = (order: Order) => {
    const userId = order.userId ?? null;
    if (!userId) return '—';
    return userNameById.get(Number(userId)) || `ID ${userId}`;
  };

  const getPaymentMethodLabel = (method?: string | null) => {
    if (!method) return '—';
    if (method === 'online') return 'Онлайн';
    if (method === 'offline') return 'Оффлайн';
    if (method === 'telegram') return 'Telegram';
    return method;
  };

  if (loading) return <div className="loading-overlay">Загрузка...</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="order-pool-page">
      <div className="order-pool-sidebar">
        <button onClick={() => navigate('/')} className="back-button">← Назад</button>
        <h2>Пул заказов ({filteredOrders.length})</h2>

        <div className="filters">
          <div className="filters-quick">
            <button
              className={`quick-btn ${filters.assigned === 'not_assigned' ? 'active' : ''}`}
              onClick={() => dispatchFilters({ type: 'setAssigned', value: 'not_assigned' })}
              title="Без ответственного"
            >
              Неназначенные
            </button>
            <button
              className={`quick-btn ${filters.assigned === 'assigned' ? 'active' : ''}`}
              onClick={() => dispatchFilters({ type: 'setAssigned', value: 'assigned' })}
            >
              Назначенные
            </button>
            <button
              className={`quick-btn ${filters.cancelled === 'cancelled' ? 'active' : ''}`}
              onClick={() => dispatchFilters({ type: 'setCancelled', value: 'cancelled' })}
            >
              Отменённые
            </button>
            <button
              className={`quick-btn ${filters.quickFilter === 'debt' ? 'active' : ''}`}
              onClick={() => dispatchFilters({ type: 'setQuickFilter', value: 'debt' })}
              title="Только с долгом"
            >
              С долгом
            </button>
            <button
              className={`quick-btn ${filters.quickFilter === 'prepay' ? 'active' : ''}`}
              onClick={() => dispatchFilters({ type: 'setQuickFilter', value: 'prepay' })}
              title="Только с предоплатой"
            >
              С предоплатой
            </button>
            <button
              className="quick-btn"
              onClick={() => {
                dispatchFilters({ type: 'resetFilters' });
              }}
            >
              Сбросить
            </button>
          </div>
          <input
            type="text"
            placeholder="Поиск по заказам..."
            value={filters.searchInput}
            onChange={(e) => dispatchFilters({ type: 'setSearchInput', value: e.target.value })}
          />
          <select value={filters.source} onChange={(e) => dispatchFilters({ type: 'setSource', value: e.target.value as any })}>
            <option value="all">Все источники</option>
            <option value="crm">CRM</option>
            <option value="website">Онлайн</option>
            <option value="telegram">Telegram</option>
          </select>
          <select value={filters.cancelled} onChange={(e) => dispatchFilters({ type: 'setCancelled', value: e.target.value as any })}>
            <option value="all">Все</option>
            <option value="cancelled">Отменённые</option>
            <option value="not_cancelled">Не отменённые</option>
          </select>
          <select value={filters.assigned} onChange={(e) => dispatchFilters({ type: 'setAssigned', value: e.target.value as any })}>
            <option value="all">Все</option>
            <option value="assigned">Назначенные</option>
            <option value="not_assigned">Неназначенные</option>
          </select>
          <select value={filters.sortBy} onChange={(e) => dispatchFilters({ type: 'setSortBy', value: e.target.value as any })}>
            <option value="created_at">По дате</option>
            <option value="number">По номеру</option>
            <option value="totalAmount">По сумме</option>
          </select>
          <button onClick={() => dispatchFilters({ type: 'toggleSortDirection' })}>
            {filters.sortDirection === 'asc' ? '↑' : '↓'}
          </button>
        </div>

        <div className="pool-stats">
          <div className="pool-stat">
            <span>Назначенные</span>
            <strong>{poolStats.assigned}</strong>
          </div>
          <div className="pool-stat">
            <span>Отменённые</span>
            <strong>{poolStats.cancelled}</strong>
          </div>
          <div className="pool-stat">
            <span>С долгом</span>
            <strong>{poolStats.withDebt}</strong>
          </div>
          <div className="pool-stat">
            <span>С предоплатой</span>
            <strong>{poolStats.withPrepay}</strong>
          </div>
        </div>

        <div className="order-list">
          {filteredOrders.length === 0 ? (
            <p>Нет заказов в пуле, соответствующих фильтрам.</p>
          ) : (
            <table className="order-list-table order-list-table--compact">
              <thead>
                <tr>
                  <th>Номер</th>
                  <th>Дата</th>
                  <th>Клиент</th>
                  <th>Телефон</th>
                  <th>Источник</th>
                  <th>Ответственный</th>
                  <th>Статус</th>
                  <th>Оплата</th>
                  <th className="numeric">Предоплата</th>
                  <th className="numeric">Долг</th>
                  <th className="numeric">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map(order => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    isSelected={selectedOrder?.id === order.id}
                    onSelect={setSelectedOrder}
                    getSourceLabel={getSourceLabel}
                    getAssigneeLabel={getAssigneeLabel}
                    getPaymentMethodLabel={getPaymentMethodLabel}
                    getOrderPrepayment={getOrderPrepayment}
                    getOrderDebt={getOrderDebt}
                    getOrderTotal={getOrderTotal}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
        {hasMoreOrders && (
          <div className="order-list-load-more">
            <button
              className="load-more-btn"
              onClick={() => dispatchFilters({ type: 'increaseVisible', step: 100 })}
            >
              Показать ещё
            </button>
          </div>
        )}
      </div>

      <div className="order-pool-detail">
        {selectedOrder ? (
          <>
            <OrderHeader
              order={selectedOrder}
              onShowFilesModal={() => setShowFilesModal(true)}
              onShowPrepaymentModal={() => setShowPrepaymentModal(true)}
            />
            <div className="order-detail-responsible">
              <label>
                Ответственный:
                <select
                  value={selectedOrder.userId ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') return;
                    const uid = Number(v);
                    if (uid === selectedOrder.userId) return;
                    handleReassignTo(selectedOrder.number!, uid);
                  }}
                >
                  <option value="">— Не назначен</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </label>
              {!selectedOrder.userId && Number(selectedOrder.status) === 0 && (
                <button type="button" className="btn-assign-me" onClick={() => handleAssignToMe(selectedOrder.number!)}>
                  Назначить мне
                </button>
              )}
              {selectedOrder.userId && Number(selectedOrder.userId) !== currentUserId && (
                <button type="button" className="btn-take-self" onClick={() => handleAssignToMe(selectedOrder.number!)}>
                  Забрать себе
                </button>
              )}
            </div>
            <div className="order-detail-actions">
              <button onClick={() => setShowPrepaymentModal(true)}>💳 Внести предоплату</button>
              {getOrderDebt(selectedOrder) > 0 && (
                <button className="btn-close-debt" onClick={() => handleIssueOrder(selectedOrder.id)}>
                  ✅ Выдать заказ
                </button>
              )}
              {selectedOrder.source && (selectedOrder.source === 'website' || selectedOrder.source === 'telegram') && (
                <button onClick={() => handleCancelOnline(selectedOrder.id)}>Отменить онлайн</button>
              )}
            </div>
            <OrderContent order={selectedOrder} onLoadOrders={loadOrders} />
            <OrderTotal
              items={selectedItems.map(item => ({
                id: item.id,
                type: item.type,
                price: item.price,
                quantity: item.quantity ?? 1,
              }))}
              discount={(() => {
                const st = selectedItems.reduce((s, it) => s + parseNumberFlexible(it.price) * parseNumberFlexible(it.quantity ?? 1), 0);
                const pct = selectedOrder.discount_percent ?? 0;
                return Math.round(st * (pct / 100) * 100) / 100;
              })()}
              taxRate={0}
              prepaymentAmount={selectedOrder.prepaymentAmount}
              prepaymentStatus={selectedOrder.prepaymentStatus}
              paymentMethod={selectedOrder.paymentMethod}
            />
          </>
        ) : (
          <p className="text-center text-gray-500">Выберите заказ из списка для просмотра деталей.</p>
        )}
      </div>

      {showFilesModal && selectedOrder && (
        <FilesModal
          isOpen={showFilesModal}
          onClose={() => setShowFilesModal(false)}
          orderId={selectedOrder.id}
          orderNumber={selectedOrder.number || ''}
        />
      )}
      {showPrepaymentModal && selectedOrder && (
        <PrepaymentModal
          isOpen={showPrepaymentModal}
          onClose={() => setShowPrepaymentModal(false)}
          orderId={selectedOrder.id}
          orderNumber={selectedOrder.number || ''}
          currentAmount={selectedOrder.prepaymentAmount}
          currentPaymentMethod={selectedOrder.paymentMethod}
          currentEmail={selectedOrder.customerEmail || ''}
          totalOrderAmount={getOrderTotal(selectedOrder)}
          onPrepaymentCreated={handlePrepaymentCreated}
        />
      )}
      {showPrepaymentDetailsModal && selectedOrder && (
        <PrepaymentDetailsModal
          isOpen={showPrepaymentDetailsModal}
          onClose={() => setShowPrepaymentDetailsModal(false)}
          order={selectedOrder}
          onPrepaymentUpdate={loadOrders}
          onOpenPrepaymentModal={() => setShowPrepaymentModal(true)}
        />
      )}
    </div>
  );
};


