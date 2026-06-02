import React, { useState, useEffect, useCallback, useMemo, useReducer, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Order, OrderActivityEvent } from '../types';
import { api, getOrders, getOrderPoolSync, reassignOrderByNumber, unassignOrderByNumber, cancelOnlineOrder, deleteOrder, getUsers, createPrepaymentLink, issueOrder, getOperatorsToday, updateOrderItem, getOrderActivity, updateOrderNotes } from '../api';
import { useOrderStatuses } from '../hooks/useOrderStatuses';

const ORDER_POOL_LAST_SEEN_KEY = 'orderPoolLastSeenAt';

/** Ответственный в пуле: приоритет responsible_user_id, иначе legacy userId */
function getEffectiveResponsibleUserId(order: Order): number | null {
  const raw = order.responsible_user_id ?? order.userId;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
import { parseNumberFlexible } from '../utils/numberInput';
import { getOrderAmounts } from '../utils/orderTotal';
import { StatusBadge } from '../components/common/StatusBadge';
import { OrderHeader } from '../components/optimized/OrderHeader';
import { OrderContent } from '../components/optimized/OrderContent';
import { OrderStatusTimeline } from '../components/order/OrderStatusTimeline';
import { OrderTotal } from '../components/order/OrderTotal';
import { FilesModal } from '../components/FilesModal';
import { PrepaymentModal } from '../components/PrepaymentModal';
import { PrepaymentDetailsModal } from '../components/PrepaymentDetailsModal';
import { MoneyAmount } from '../components/ui';
import { useToastNotifications } from '../components/Toast';
import { useLogger } from '../utils/logger';
import { useReasonPrompt } from '../components/common/useReasonPrompt';
import { useReasonPresets } from '../components/common/useReasonPresets';
import '../styles/order-pool.css';

interface OrderPoolPageProps {
  currentUserId: number;
  currentUserName: string;
  /** Физическое удаление отменённого заказа из БД */
  isAdmin: boolean;
}

type FilterState = {
  source: 'all' | 'crm' | 'website' | 'telegram' | 'mini_app';
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
  source: 'website',
  cancelled: 'not_cancelled',
  assigned: 'not_assigned',
  searchInput: '',
  searchTerm: '',
  quickFilter: null,
  sortBy: 'created_at',
  sortDirection: 'desc',
  visibleCount: 100,
};

function getSourceLabel(source?: string): string {
  switch (source) {
    case 'website': return 'Онлайн';
    case 'telegram': return 'Telegram';
    case 'crm': return 'CRM';
    case 'mini_app': return 'Mini App';
    default: return 'Неизвестно';
  }
}

function getPaymentMethodLabel(method?: string | null): string {
  if (!method) return '—';
  if (method === 'online') return 'Онлайн';
  if (method === 'offline') return 'Оффлайн';
  if (method === 'telegram') return 'Telegram';
  return method;
}

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
      return {
        ...state,
        source: initialFilters.source,
        cancelled: initialFilters.cancelled,
        assigned: initialFilters.assigned,
        searchInput: '',
        searchTerm: '',
        quickFilter: null,
      };
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
      className={`${isSelected ? 'selected' : ''} ${getEffectiveResponsibleUserId(order) ? 'assigned' : ''}`}
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
        {getEffectiveResponsibleUserId(order) ? (
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
              <MoneyAmount value={getOrderPrepayment(order)} />
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
          <MoneyAmount value={getOrderDebt(order)} />
        </div>
      </td>
      <td className="numeric">
        <div className="order-total"><MoneyAmount value={getOrderTotal(order)} /></div>
      </td>
    </tr>
  )
);

export const OrderPoolPage: React.FC<OrderPoolPageProps> = ({ currentUserId, currentUserName, isAdmin }) => {
  const navigate = useNavigate();
  const toast = useToastNotifications();
  const logger = useLogger('OrderPoolPage');
  const { requestReason, ReasonPromptModalElement } = useReasonPrompt();
  const { getPresets } = useReasonPresets();

  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showFilesModal, setShowFilesModal] = useState(false);
  const [showPrepaymentModal, setShowPrepaymentModal] = useState(false);
  const [showPrepaymentDetailsModal, setShowPrepaymentDetailsModal] = useState(false);
  const [issuingOrderId, setIssuingOrderId] = useState<number | null>(null);
  const [allUsers, setAllUsers] = useState<Array<{ id: number; name: string }>>([]);
  const [operatorsToday, setOperatorsToday] = useState<Array<{ id: number; name: string }>>([]);
  const [orderActivity, setOrderActivity] = useState<OrderActivityEvent[]>([]);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const { statuses: orderStatuses } = useOrderStatuses();
  const [filters, dispatchFilters] = useReducer(filtersReducer, initialFilters);
  const orderIdsRef = useRef<Set<number>>(new Set());
  const searchRequestSeqRef = useRef(0);
  const activityRequestSeqRef = useRef(0);
  const activityOrderIdRef = useRef<number | null>(null);
  const selectedItems = selectedOrder?.items ?? [];
  const userNameById = useMemo(() => {
    const map = new Map<number, string>();
    allUsers.forEach((u) => map.set(Number(u.id), u.name));
    return map;
  }, [allUsers]);

  const getOrderTotal = useCallback((order: Order) => {
    return typeof order.totalAmount === 'number' && Number.isFinite(order.totalAmount)
      ? order.totalAmount
      : 0;
  }, []);

  const getOrderPrepayment = useCallback((order: Order) => {
    return parseNumberFlexible(order.prepaymentAmount ?? 0);
  }, []);

  const getOrderDebt = useCallback((order: Order) => {
    return typeof order.debt === 'number' && Number.isFinite(order.debt)
      ? order.debt
      : Math.max(0, getOrderTotal(order) - getOrderPrepayment(order));
  }, [getOrderTotal, getOrderPrepayment]);

  const getAssigneeLabel = useCallback(
    (order: Order) => {
      const userId = getEffectiveResponsibleUserId(order);
      if (!userId) return '—';
      return userNameById.get(userId) || `ID ${userId}`;
    },
    [userNameById]
  );

  const updateOrderInList = useCallback((orderId: number, patch: Partial<Order>) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...patch } : o)));
    setSelectedOrder((prev) =>
      prev?.id === orderId ? (prev ? { ...prev, ...patch } : null) : prev
    );
  }, []);

  const loadOrders = useCallback(async (options: { activeOnly?: boolean; query?: string; soft?: boolean } = {}) => {
    const requestSeq = ++searchRequestSeqRef.current;
    const query = options.query?.trim();
    const isSearch = Boolean(query);
    const useSoftLoading = isSearch || options.soft === true;
    const canSearch = query && (/^(#|ORD-|site-ord-|tg-ord-)?\d+$/i.test(query) || query.length >= 3);
    if (query && !canSearch) {
      setOrders([]);
      setError(null);
      setSearchLoading(false);
      return;
    }
    try {
      if (useSoftLoading) {
        setSearchLoading(true);
      } else {
        setLoading(true);
      }
      const res = canSearch
        ? await api.get<Order[]>('/orders/search', { params: { all: '1', light: '1', query, limit: '100' } })
        : await getOrders({ all: true, poolActiveOnly: options.activeOnly ?? true });
      if (requestSeq !== searchRequestSeqRef.current) return;
      const list = res.data as Order[];
      orderIdsRef.current = new Set(list.map((o) => o.id));
      setOrders(list);
      setError(null);
      setSelectedOrder((prev) => {
        if (!prev) return prev;
        const next = list.find((o) => o.id === prev!.id);
        return next ?? prev;
      });
    } catch (err) {
      if (requestSeq !== searchRequestSeqRef.current) return;
      logger.error('Failed to load orders for pool', err);
      setError('Не удалось загрузить заказы.');
    } finally {
      if (requestSeq !== searchRequestSeqRef.current) return;
      if (useSoftLoading) {
        setSearchLoading(false);
      } else {
        setLoading(false);
      }
    }
  }, [logger]);

  /** Фоновое обновление списка (без индикатора загрузки) — вызывается при изменении маркера «заказ с сайта» */
  const refreshOrdersInBackground = useCallback(async () => {
    try {
      const res = await getOrders({ all: true, poolActiveOnly: true });
      const list = res.data as Order[];
      const prevIds = orderIdsRef.current;
      const newCount = list.filter((o) => !prevIds.has(o.id)).length;
      orderIdsRef.current = new Set(list.map((o) => o.id));
      setOrders(list);
      setSelectedOrder((prev) => {
        if (!prev) return prev;
        const next = list.find((o) => o.id === prev!.id);
        return next ?? prev;
      });
      if (newCount > 0) {
        toast.info(`Обновлён пул заказов: ${newCount} новых`);
      }
    } catch (err) {
      logger.error('Background refresh orders failed', err);
    }
  }, [logger, toast]);

  useEffect(() => {
    if (isInitialized) return;
    loadOrders().then(() => setIsInitialized(true));
    getUsers().then(res => setAllUsers(res.data)).catch(err => logger.error('Failed to load users', err));
    // статусы загружаются через useOrderStatuses (кэшируются на сессию)
  }, [isInitialized, loadOrders, logger]);

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  useEffect(() => {
    getOperatorsToday(today).then(res => setOperatorsToday(res.data ?? [])).catch(() => setOperatorsToday([]));
  }, [today]);

  const handleExecutorChange = useCallback(
    async (orderId: number, itemId: number, executor_user_id: number | null) => {
      try {
        await updateOrderItem(orderId, itemId, { executor_user_id });
        loadOrders();
      } catch (err: any) {
        toast.error('Ошибка', err?.message ?? 'Не удалось обновить исполнителя');
      }
    },
    [loadOrders, toast]
  );

  const loadSelectedOrderActivity = useCallback(async (orderId: number, fallbackNotes = '') => {
    const requestSeq = ++activityRequestSeqRef.current;
    activityOrderIdRef.current = orderId;
    try {
      setActivityLoading(true);
      const res = await getOrderActivity(orderId);
      if (requestSeq !== activityRequestSeqRef.current) return;
      setOrderActivity(Array.isArray(res.data?.events) ? res.data.events : []);
      setNotesDraft(typeof res.data?.notes === 'string' ? res.data.notes : '');
    } catch (err) {
      if (requestSeq !== activityRequestSeqRef.current) return;
      logger.error('Failed to load order activity', err);
      setOrderActivity([]);
      setNotesDraft(fallbackNotes);
    } finally {
      if (requestSeq === activityRequestSeqRef.current) {
        setActivityLoading(false);
      }
    }
  }, [logger]);

  useEffect(() => {
    if (!selectedOrder?.id) {
      activityRequestSeqRef.current += 1;
      activityOrderIdRef.current = null;
      setOrderActivity([]);
      setNotesDraft('');
      return;
    }
    const orderId = selectedOrder.id;
    const fallbackNotes = selectedOrder.notes ?? '';
    if (activityLoading && activityOrderIdRef.current === orderId) return;
    void loadSelectedOrderActivity(orderId, fallbackNotes);
  }, [selectedOrder?.id]);


  /** При открытии страницы пула — помечаем как просмотренное (убираем бейдж "new" на главной) */
  useEffect(() => {
    getOrderPoolSync()
      .then(({ data }) => {
        const at = data?.lastWebsiteOrderAt ?? Date.now();
        try {
          localStorage.setItem(ORDER_POOL_LAST_SEEN_KEY, String(at));
        } catch {}
      })
      .catch(() => {});
  }, []);

  /** Опрос маркера «заказ с сайта»: при обращении к orderpool API с printcore.by бэкенд обновляет lastWebsiteOrderAt — принудительно обновляем список */
  const poolSyncRef = useRef<number>(0);
  useEffect(() => {
    if (!isInitialized) return;
    const pollMs = 5000;
    const tid = setInterval(async () => {
      try {
        const { data } = await getOrderPoolSync();
        const at = data?.lastWebsiteOrderAt ?? 0;
        if (at <= 0) return;
        if (poolSyncRef.current === 0) {
          poolSyncRef.current = at;
          return;
        }
        if (at !== poolSyncRef.current) {
          poolSyncRef.current = at;
          refreshOrdersInBackground();
        }
      } catch {
        // игнорируем ошибки опроса
      }
    }, pollMs);
    return () => clearInterval(tid);
  }, [isInitialized, refreshOrdersInBackground]);

  useEffect(() => {
    const t = setTimeout(() => dispatchFilters({ type: 'setSearchTerm', value: filters.searchInput.trim() }), 600);
    return () => clearTimeout(t);
  }, [filters.searchInput]);

  useEffect(() => {
    if (!isInitialized) return;
    const query = filters.searchTerm.trim();
    loadOrders(query ? { query } : { activeOnly: true, soft: true });
  }, [filters.searchTerm, isInitialized, loadOrders]);

  useEffect(() => {
    dispatchFilters({ type: 'resetVisible' });
  }, [filters.source, filters.cancelled, filters.assigned, filters.searchTerm, filters.quickFilter, filters.sortBy, filters.sortDirection]);

  const filteredOrders = useMemo(() => {
    const hasSearch = Boolean(filters.searchTerm?.trim());
    // Без поиска: только ожидающие (0) и оформленные с долгом (1). С поиском — по всем заказам, только поиск.
    let filtered: Order[];
    if (hasSearch) {
      // В режиме поиска backend уже вернул ограниченный релевантный результат.
      // Не фильтруем и не сортируем его повторно на клиенте.
      return orders;
    } else {
      filtered = orders.filter((o) => {
        const s = Number(o.status);
        // Показываем ожидающие (0), первый статус / оформленные (1) — в т.ч. неназначенные онлайн-заказы
        if (s === 0) return true;
        if (s === 1) return true;
        return false;
      });
      if (filters.source !== 'all') {
        filtered = filtered.filter((o) => o.source === filters.source);
      }
      if (filters.cancelled !== 'all') {
        filtered = filtered.filter((o) => (o.is_cancelled === 1) === (filters.cancelled === 'cancelled'));
      }
      if (filters.assigned !== 'all') {
        filtered = filtered.filter(
          (o) => (getEffectiveResponsibleUserId(o) != null) === (filters.assigned === 'assigned'),
        );
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
  ]);

  const visibleOrders = useMemo(
    () => filteredOrders.slice(0, filters.visibleCount),
    [filteredOrders, filters.visibleCount]
  );
  const hasMoreOrders = visibleOrders.length < filteredOrders.length;

  const handleAssignToMe = useCallback(
    async (orderNumber: string) => {
      const ord = orders.find((o) => o.number === orderNumber);
      if (ord && Number(ord.status) !== 0 && Number(ord.status) !== 1) {
        toast.error('Нельзя переназначить', 'Переназначить можно только заказ со статусом «Ожидает» (0 или 1).');
        return;
      }
      try {
        await reassignOrderByNumber(orderNumber, currentUserId);
        toast.success('Заказ назначен вам!', `Заказ ${orderNumber} успешно назначен.`);
        setOrders((prev) => {
          const o = prev.find((x) => x.number === orderNumber);
          if (!o) return prev;
          return prev.map((x) =>
            x.id === o.id
              ? { ...x, userId: currentUserId, responsible_user_id: currentUserId }
              : x,
          );
        });
        setSelectedOrder((prev) => {
          if (!prev || prev.number !== orderNumber) return prev;
          return { ...prev, userId: currentUserId, responsible_user_id: currentUserId };
        });
      } catch (err) {
        logger.error('Failed to assign order', err);
        toast.error('Ошибка назначения', (err as Error).message);
      }
    },
    [currentUserId, orders, toast, logger]
  );

  const handleReassignTo = useCallback(
    async (orderNumber: string, userId: number) => {
      const ord = orders.find((o) => o.number === orderNumber);
      if (ord && Number(ord.status) !== 0 && Number(ord.status) !== 1) {
        toast.error('Нельзя переназначить', 'Переназначить можно только заказ со статусом «Ожидает» (0 или 1).');
        return;
      }
      try {
        await reassignOrderByNumber(orderNumber, userId);
        const name = allUsers.find((u) => u.id === userId)?.name ?? 'оператору';
        toast.success('Заказ переназначен', `Заказ ${orderNumber} назначен ${name}.`);
        const o = orders.find((x) => x.number === orderNumber);
        if (o) updateOrderInList(o.id, { userId, responsible_user_id: userId });
      } catch (err) {
        logger.error('Failed to reassign order', err);
        toast.error('Ошибка переназначения', (err as Error).message);
      }
    },
    [allUsers, orders, toast, logger, updateOrderInList]
  );

  const handleReturnToPool = useCallback(
    async (orderNumber: string) => {
      const ord = orders.find((o) => o.number === orderNumber);
      if (ord && Number(ord.status) !== 0 && Number(ord.status) !== 1) {
        toast.error('Нельзя вернуть в пул', 'Вернуть в пул можно только заказ со статусом «Ожидает» (0 или 1).');
        return;
      }
      try {
        await unassignOrderByNumber(orderNumber);
        toast.success('Заказ возвращён в пул', `Заказ ${orderNumber} теперь без ответственного.`);
        const o = orders.find((x) => x.number === orderNumber);
        if (o) {
          updateOrderInList(o.id, {
            userId: null as any,
            responsible_user_id: null as any,
            is_cancelled: 0,
          });
        }
      } catch (err) {
        logger.error('Failed to return order to pool', err);
        toast.error('Ошибка возврата в пул', (err as Error).message);
      }
    },
    [orders, toast, logger, updateOrderInList]
  );


  const issuingRef = useRef(false);
  const handleIssueOrder = useCallback(
    async (orderId: number) => {
      if (issuingRef.current) return;
      issuingRef.current = true;
      setIssuingOrderId(orderId);
      try {
        const d = new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        await issueOrder(orderId, today);
        toast.success('Заказ выдан', 'Долг закрыт, заказ переведён в «Выдан»');
        const order = orders.find((o) => o.id === orderId);
        const total = order ? getOrderAmounts(order).total : 0;
        updateOrderInList(orderId, {
          status: 7 as any,
          prepaymentAmount: total,
          prepaymentStatus: 'paid',
          paymentMethod: 'offline',
        });
      } catch (err: any) {
        logger.error('Issue order failed', err);
        toast.error('Ошибка', err?.message ?? 'Не удалось выдать заказ');
      } finally {
        issuingRef.current = false;
        setIssuingOrderId(null);
      }
    },
    [orders, toast, logger, updateOrderInList]
  );

  const handleCancelOnline = useCallback(
    async (orderId: number) => {
      try {
        const reason = await requestReason({
          title: 'Причина отмены онлайн-заказа',
          placeholder: 'Укажите причину отмены онлайн-заказа',
          presets: getPresets('online_cancel'),
          confirmText: 'Отменить заказ',
          rememberKey: 'order_online_cancel_reason',
        });
        if (!reason) return;
        const { data } = await cancelOnlineOrder(orderId, reason);
        toast.success('Заказ отменён', 'Заказ переведён в статус «Отменён».');
        updateOrderInList(orderId, {
          is_cancelled: 1,
          status: Number(data?.status ?? 0) as any,
          userId: null as any,
          responsible_user_id: null as any,
        });
      } catch (err) {
        logger.error('Failed to cancel online order', err);
        toast.error('Ошибка отмены', (err as Error).message);
      }
    },
    [toast, logger, updateOrderInList, requestReason, getPresets]
  );

  const handlePermanentDelete = useCallback(
    async (orderId: number) => {
      try {
        const reason = await requestReason({
          title: 'Удаление отменённого заказа из базы',
          placeholder: 'Причина окончательного удаления записи (доступно только администратору)',
          presets: getPresets('delete'),
          confirmText: 'Удалить из базы',
          rememberKey: 'order_permanent_delete_reason',
        });
        if (!reason) return;
        await deleteOrder(orderId, reason);
        toast.success('Удалено', 'Запись заказа удалена из базы');
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
        setSelectedOrder((prev) => (prev?.id === orderId ? null : prev));
      } catch (err: unknown) {
        const ax = err as { response?: { data?: { error?: string } }; message?: string };
        const msg = ax?.response?.data?.error ?? ax?.message ?? 'Не удалось удалить заказ';
        logger.error('Failed to permanently delete order', err);
        toast.error('Ошибка', msg);
      }
    },
    [toast, logger, requestReason, getPresets]
  );

  const handlePrepaymentCreated = useCallback(
    async (amount: number, _email: string, paymentMethod: 'online' | 'offline' | 'telegram', assignToMe?: boolean) => {
      if (!selectedOrder) return;
      try {
        const method = paymentMethod === 'telegram' ? 'online' : paymentMethod;
        const { data } = await createPrepaymentLink(selectedOrder.id, amount, method, assignToMe);
        toast.success('Успешно', 'Предоплата обновлена');
        const patch: Partial<Order> = {
          prepaymentAmount: amount,
          paymentMethod: method,
          prepaymentStatus: method === 'online' ? 'pending' : 'paid',
          prepaymentUpdatedAt: (data as Order)?.prepaymentUpdatedAt ?? undefined,
        };
        if (assignToMe) {
          patch.userId = currentUserId;
          patch.responsible_user_id = currentUserId;
        }
        updateOrderInList(selectedOrder.id, patch);
      } catch (err: any) {
        logger.error('Prepayment failed', err);
        toast.error('Ошибка', err?.message ?? 'Не удалось обновить предоплату');
        throw err;
      }
    },
    [selectedOrder, currentUserId, toast, logger, updateOrderInList]
  );

  const handleRemovePrepayment = useCallback(
    async (orderId: number) => {
      if (!window.confirm('Удалить предоплату по заказу?')) return;
      try {
        await createPrepaymentLink(orderId, 0, 'offline');
        toast.success('Успешно', 'Предоплата удалена');
        updateOrderInList(orderId, {
          prepaymentAmount: 0,
          prepaymentStatus: undefined,
          paymentMethod: undefined,
        });
      } catch (err: any) {
        logger.error('Remove prepayment failed', err);
        toast.error('Ошибка', err?.message ?? 'Не удалось удалить предоплату');
      }
    },
    [toast, logger, updateOrderInList]
  );

  const handleSaveNotes = useCallback(async () => {
    if (!selectedOrder) return;
    try {
      setNotesSaving(true);
      await updateOrderNotes(selectedOrder.id, notesDraft.trim() ? notesDraft : null);
      updateOrderInList(selectedOrder.id, { notes: notesDraft.trim() ? notesDraft : '' });
      await loadSelectedOrderActivity(selectedOrder.id, notesDraft.trim() ? notesDraft : '');
      toast.success('Сохранено', 'Примечания обновлены');
    } catch (err: any) {
      logger.error('Failed to save notes', err);
      toast.error('Ошибка', err?.message ?? 'Не удалось сохранить примечания');
    } finally {
      setNotesSaving(false);
    }
  }, [selectedOrder, notesDraft, updateOrderInList, loadSelectedOrderActivity, toast, logger]);

  const formatActivityDate = useCallback((value?: string) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('ru-RU');
  }, []);

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
          <div className="filters-row">
            <div className={`order-pool-search ${searchLoading ? 'order-pool-search--loading' : ''}`}>
              <span className="order-pool-search__icon" aria-hidden="true">⌕</span>
              <input
                type="text"
                placeholder="Поиск по номеру, клиенту, телефону..."
                value={filters.searchInput}
                onChange={(e) => dispatchFilters({ type: 'setSearchInput', value: e.target.value })}
              />
              {searchLoading && (
                <span className="order-pool-search__loader" aria-label="Идёт поиск">
                  <span />
                  <span />
                  <span />
                </span>
              )}
            </div>
            <select value={filters.source} onChange={(e) => dispatchFilters({ type: 'setSource', value: e.target.value as FilterState['source'] })} aria-label="Источник заказа">
              <option value="website">Онлайн (сайт)</option>
              <option value="all">Все источники</option>
              <option value="crm">CRM</option>
              <option value="telegram">Telegram</option>
              <option value="mini_app">Mini App</option>
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
            <button onClick={() => dispatchFilters({ type: 'toggleSortDirection' })} title="Направление сортировки">
              {filters.sortDirection === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>

        <div className={`order-list ${searchLoading ? 'order-list--searching' : ''}`}>
          {searchLoading && (
            <div className="order-pool-search-hint" role="status">
              <span className="order-pool-search-hint__pulse" />
              Обновляем результаты поиска
            </div>
          )}
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
                  value={getEffectiveResponsibleUserId(selectedOrder) ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    const current = getEffectiveResponsibleUserId(selectedOrder);
                    if (v === '') {
                      if (current != null) {
                        handleReturnToPool(selectedOrder.number!);
                      }
                      return;
                    }
                    const uid = Number(v);
                    if (uid === current) return;
                    handleReassignTo(selectedOrder.number!, uid);
                  }}
                  disabled={Number(selectedOrder.status) !== 0 && Number(selectedOrder.status) !== 1}
                  title={(Number(selectedOrder.status) !== 0 && Number(selectedOrder.status) !== 1) ? 'Переназначить можно только при статусе «Ожидает» (0 или 1)' : undefined}
                >
                  <option value="">— Не назначен</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </label>
              {(Number(selectedOrder.status) === 0 || Number(selectedOrder.status) === 1) &&
                getEffectiveResponsibleUserId(selectedOrder) !== currentUserId && (
                <button
                  type="button"
                  className="btn-assign-responsible"
                  onClick={() => handleAssignToMe(selectedOrder.number!)}
                  title="Назначить себя ответственным по заказу"
                >
                  Назначить ответственного
                </button>
              )}
            </div>
            <div className="order-detail-actions">
              <button onClick={() => setShowPrepaymentModal(true)}>💳 Внести предоплату</button>
              {getOrderPrepayment(selectedOrder) > 0 && (
                <button
                  type="button"
                  className="btn-remove-prepayment"
                  onClick={() => handleRemovePrepayment(selectedOrder.id)}
                  title="Удалить предоплату по заказу"
                >
                  🗑️ Удалить предоплату
                </button>
              )}
              {(getOrderDebt(selectedOrder) > 0 || (getOrderPrepayment(selectedOrder) >= getOrderTotal(selectedOrder) && getOrderTotal(selectedOrder) > 0)) && Number(selectedOrder.status) !== 7 && (
                <button
                  className="btn-close-debt"
                  onClick={() => handleIssueOrder(selectedOrder.id)}
                  disabled={issuingOrderId === selectedOrder.id}
                >
                  {issuingOrderId === selectedOrder.id ? '⏳ Выдача...' : '✅ Выдать заказ'}
                </button>
              )}
              {(Number(selectedOrder.status) === 0 || Number(selectedOrder.status) === 1) &&
                selectedOrder.is_cancelled !== 1 && (
                <button type="button" onClick={() => handleCancelOnline(selectedOrder.id)}>
                  Отменить заказ
                </button>
              )}
              {isAdmin && selectedOrder.is_cancelled === 1 && (
                <button
                  type="button"
                  className="btn-order-permanent-delete"
                  onClick={() => handlePermanentDelete(selectedOrder.id)}
                >
                  Удалить из базы
                </button>
              )}
            </div>
            {(() => {
              const created = selectedOrder.created_at ?? (selectedOrder as any).createdAt;
              const firstItem = (selectedOrder.items ?? [])[0];
              const priceType = (firstItem?.params as any)?.priceType ?? (firstItem?.params as any)?.price_type ?? 'standard';
              const readyLabels: Record<string, string> = {
                urgent: 'В течение 3 часов',
                promo: '48 часов',
                special: '4–5 дней',
                standard: '24 часа',
              };
              const readyLabel = readyLabels[String(priceType).toLowerCase()] ?? readyLabels.standard;
              // TODO: реализовать систему уведомлений клиенту (email/SMS о готовности заказа) — см. docs/customer-notifications-setup.md
              return (
                <div className="order-detail-readiness">
                  <span className="order-detail-readiness-label">Срок готовности:</span>
                  <span className="order-detail-readiness-value">{readyLabel}</span>
                  {created && priceType !== 'standard' && (
                    <span className="order-detail-readiness-hint">
                      с момента оформления {new Date(created).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  )}
                </div>
              );
            })()}
            {orderStatuses.length > 0 && (
              <OrderStatusTimeline
                statuses={orderStatuses}
                currentStatusId={Number(selectedOrder.status)}
                createdAt={selectedOrder.created_at ?? (selectedOrder as any).createdAt}
                readyAt={(selectedOrder as any).readyAt ?? null}
                hasItems={(selectedOrder.items?.length ?? 0) > 0}
              />
            )}
            <OrderContent
              order={selectedOrder}
              onLoadOrders={loadOrders}
              readOnly
              operatorsToday={operatorsToday.length > 0 ? operatorsToday : allUsers}
              onExecutorChange={handleExecutorChange}
            />
            <OrderTotal
              {...(() => {
                const a = getOrderAmounts(selectedOrder);
                return {
                  subtotal: a.subtotal,
                  discountAmount: a.discountAmount,
                  total: a.total,
                  debt: a.debt,
                };
              })()}
              taxRate={0}
              prepaymentAmount={selectedOrder.prepaymentAmount}
              prepaymentStatus={selectedOrder.prepaymentStatus}
              paymentMethod={selectedOrder.paymentMethod}
            />
            <div className="order-activity-panel">
              <div className="order-activity-panel__header">
                <h3>Примечания и история</h3>
                <button
                  type="button"
                  className="order-activity-panel__save-btn"
                  onClick={() => void handleSaveNotes()}
                  disabled={notesSaving}
                >
                  {notesSaving ? 'Сохранение...' : 'Сохранить примечания'}
                </button>
              </div>
              <textarea
                className="order-activity-panel__notes"
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Добавьте примечание по заказу..."
                rows={3}
              />

              <div className="order-activity-panel__timeline">
                {activityLoading ? (
                  <div className="order-activity-panel__empty">Загрузка истории...</div>
                ) : orderActivity.length === 0 ? (
                  <div className="order-activity-panel__empty">История пока пустая</div>
                ) : (
                  orderActivity.map((event) => (
                    <div key={event.id} className="order-activity-event">
                      <div className="order-activity-event__top">
                        <span className="order-activity-event__title">{event.message}</span>
                        <span className="order-activity-event__date">{formatActivityDate(event.created_at)}</span>
                      </div>
                      <div className="order-activity-event__meta">
                        {event.user_name || 'Система'}
                      </div>
                      {event.comment && (
                        <div className="order-activity-event__comment">{event.comment}</div>
                      )}
                      {event.old_value != null && event.new_value != null && (
                        <div className="order-activity-event__change">
                          <span>{event.old_value}</span>
                          <span className="arrow">→</span>
                          <span>{event.new_value}</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
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
          items={selectedOrder.items ?? []}
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
          context="pool"
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
      {ReasonPromptModalElement}
    </div>
  );
};


