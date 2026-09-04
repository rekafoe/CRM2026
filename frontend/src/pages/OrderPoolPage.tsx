import React, { useState, useEffect, useCallback, useMemo, useReducer, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Order, OrderActivityEvent } from '../types';
import {
  api,
  getOrders,
  getOrderPoolSync,
  reassignOrderByNumber,
  unassignOrderByNumber,
  cancelOnlineOrder,
  deleteOrder,
  getUsers,
  getDepartments,
  createPrepaymentLink,
  issueOrder,
  getOperatorsToday,
  updateOrderItem,
  getOrderActivity,
  updateOrderNotes,
  getAssignableUsers,
  getCurrentUser,
  type Department,
  type AssignableUser,
} from '../api';
import { useOrderStatuses } from '../hooks/useOrderStatuses';
import { isPaidPrepaymentStatus, parseNumberFlexible } from '../utils/numberInput';
import { isAwaitingOnlinePayment } from '../utils/poolPaymentStatus';
import { getOrderAmounts } from '../utils/orderTotal';
import { mergeSelectedOrderFromList } from '../utils/orderNotes';
import { OrderContent } from '../components/optimized/OrderContent';
import { OrderStatusTimeline } from '../components/order/OrderStatusTimeline';
import { OrderTotal } from '../components/order/OrderTotal';
import { FilesModal } from '../components/FilesModal';
import { PrepaymentModal } from '../components/PrepaymentModal';
import { PrepaymentDetailsModal } from '../components/PrepaymentDetailsModal';
import { SendPaymentLinkModal } from '../components/SendPaymentLinkModal';
import { Button } from '../components/common/Button';
import { useToastNotifications } from '../components/Toast';
import { useLogger } from '../utils/logger';
import { useReasonPrompt } from '../components/common/useReasonPrompt';
import { useReasonPresets } from '../components/common/useReasonPresets';
import {
  OrderPoolFilters,
  OrderPoolList,
  OrderPoolDetailHeader,
  OrderPoolPaymentSummary,
  getEffectiveResponsibleUserId,
  initialOrderPoolFilters,
  orderPoolFiltersReducer,
  ORDER_POOL_SEARCH_LIMIT,
} from '../components/orderPool';
import '../styles/order-pool.css';

const ORDER_POOL_LAST_SEEN_KEY = 'orderPoolLastSeenAt';

interface OrderPoolPageProps {
  currentUserId: number;
  currentUserName: string;
  /** Физическое удаление отменённого заказа из БД */
  isAdmin: boolean;
}

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
  const [showSendPaymentLinkModal, setShowSendPaymentLinkModal] = useState(false);
  const [issuingOrderId, setIssuingOrderId] = useState<number | null>(null);
  const [allUsers, setAllUsers] = useState<Array<{ id: number; name: string }>>([]);
  const [operatorsToday, setOperatorsToday] = useState<Array<{ id: number; name: string }>>([]);
  const [assignableOnShift, setAssignableOnShift] = useState<AssignableUser[]>([]);
  const [assignableAll, setAssignableAll] = useState<AssignableUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [poolDepartmentId, setPoolDepartmentId] = useState<number | ''>('');
  const [myDepartmentId, setMyDepartmentId] = useState<number | null>(null);
  const poolDepartmentIdRef = useRef<number | ''>('');
  const [orderActivity, setOrderActivity] = useState<OrderActivityEvent[]>([]);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const notesDirtyRef = useRef(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const { statuses: orderStatuses } = useOrderStatuses();
  const [filters, dispatchFilters] = useReducer(orderPoolFiltersReducer, initialOrderPoolFilters);
  const orderIdsRef = useRef<Set<number>>(new Set());
  const searchRequestSeqRef = useRef(0);
  const fullLoadsInFlightRef = useRef(0);
  const activityRequestSeqRef = useRef(0);
  const activityOrderIdRef = useRef<number | null>(null);

  poolDepartmentIdRef.current = poolDepartmentId;
  const searchInputRef = useRef(filters.searchInput);
  const searchTermRef = useRef(filters.searchTerm);
  searchInputRef.current = filters.searchInput;
  searchTermRef.current = filters.searchTerm;

  const getOrderTotal = useCallback((order: Order) => {
    return typeof order.totalAmount === 'number' && Number.isFinite(order.totalAmount)
      ? order.totalAmount
      : 0;
  }, []);

  const getOrderPrepayment = useCallback((order: Order) => {
    return parseNumberFlexible(order.prepaymentAmount ?? 0);
  }, []);

  const getOrderDebt = useCallback(
    (order: Order) => {
      const total = getOrderTotal(order);
      const prepay = getOrderPrepayment(order);
      const paidPortion = isPaidPrepaymentStatus(order.prepaymentStatus) ? prepay : 0;
      return Math.max(0, total - paidPortion);
    },
    [getOrderTotal, getOrderPrepayment],
  );

  const updateOrderInList = useCallback((orderId: number, patch: Partial<Order>) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...patch } : o)));
    setSelectedOrder((prev) => (prev?.id === orderId ? (prev ? { ...prev, ...patch } : null) : prev));
  }, []);

  const loadOrders = useCallback(
    async (options: { activeOnly?: boolean; query?: string; soft?: boolean } = {}) => {
      const requestSeq = ++searchRequestSeqRef.current;
      const query = options.query?.trim();
      const isSearch = Boolean(query);
      const useSoftLoading = isSearch || options.soft === true;
      const canSearch = query && (/^(#|ORD-|site-ord-|tg-ord-)?\d+$/i.test(query) || query.length >= 3);
      if (query && !canSearch) {
        setOrders([]);
        setError(null);
        setSearchLoading(false);
        setLoading(false);
        return;
      }
      try {
        if (useSoftLoading) {
          setSearchLoading(true);
        } else {
          fullLoadsInFlightRef.current += 1;
          setLoading(true);
        }
        const deptId = poolDepartmentIdRef.current;
        const deptParam =
          deptId === '' ? undefined : { department_id: deptId };
        const res = canSearch
          ? await api.get<Order[]>('/orders/search', {
              params: { all: '1', light: '1', query, limit: String(ORDER_POOL_SEARCH_LIMIT), ...deptParam },
            })
          : await getOrders({
              all: true,
              poolActiveOnly: options.activeOnly ?? true,
              light: true,
              limit: 150,
              ...deptParam,
            });
        if (requestSeq !== searchRequestSeqRef.current) return;
        const list = res.data as Order[];
        orderIdsRef.current = new Set(list.map((o) => o.id));
        setOrders(list);
        setError(null);
        setSelectedOrder((prev) => mergeSelectedOrderFromList(prev, list));
      } catch (err) {
        if (requestSeq !== searchRequestSeqRef.current) return;
        logger.error('Failed to load orders for pool', err);
        setError('Не удалось загрузить заказы.');
      } finally {
        if (useSoftLoading) {
          if (requestSeq === searchRequestSeqRef.current) {
            setSearchLoading(false);
          }
        } else {
          fullLoadsInFlightRef.current = Math.max(0, fullLoadsInFlightRef.current - 1);
          if (fullLoadsInFlightRef.current === 0) {
            setLoading(false);
          }
        }
      }
    },
    [logger],
  );

  const isPoolSearchActive = useCallback(
    () => Boolean(searchInputRef.current.trim() || searchTermRef.current.trim()),
    [],
  );

  const reloadPoolList = useCallback(
    (soft = true) => {
      const query = searchTermRef.current.trim();
      return loadOrders(query ? { query, soft } : { activeOnly: true, soft });
    },
    [loadOrders],
  );

  const refreshOrdersInBackground = useCallback(async () => {
    if (isPoolSearchActive()) return;
    const requestSeq = searchRequestSeqRef.current;
    try {
      const deptId = poolDepartmentIdRef.current;
      const deptParam =
        deptId === '' ? undefined : { department_id: deptId };
      const res = await getOrders({ all: true, poolActiveOnly: true, light: true, limit: 150, ...deptParam });
      if (requestSeq !== searchRequestSeqRef.current || isPoolSearchActive()) return;
      const list = res.data as Order[];
      const prevIds = orderIdsRef.current;
      const newCount = list.filter((o) => !prevIds.has(o.id)).length;
      orderIdsRef.current = new Set(list.map((o) => o.id));
      setOrders(list);
      setSelectedOrder((prev) => mergeSelectedOrderFromList(prev, list));
      if (newCount > 0) {
        toast.info(`Обновлён пул заказов: ${newCount} новых`);
      }
    } catch (err) {
      logger.error('Background refresh orders failed', err);
    }
  }, [isPoolSearchActive, logger, toast]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadOrders();
      if (!cancelled) setIsInitialized(true);
    })();
    getCurrentUser()
      .then((res) => {
        const raw = res.data?.department_id;
        if (raw != null && Number(raw) > 0) {
          setMyDepartmentId(Number(raw));
        }
      })
      .catch(() => {
        /* точка в селекте без пометки «моя» */
      });
    getUsers()
      .then((res) => setAllUsers(res.data))
      .catch((err) => logger.error('Failed to load users', err));
    getDepartments()
      .then((res) => setDepartments(res.data ?? []))
      .catch(() => setDepartments([]));
    return () => {
      cancelled = true;
    };
  }, [loadOrders, logger]);

  useEffect(() => {
    if (!isInitialized) return;
    void reloadPoolList(true);
  }, [poolDepartmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  useEffect(() => {
    getOperatorsToday(today)
      .then((res) => setOperatorsToday(res.data ?? []))
      .catch(() => setOperatorsToday([]));
    getAssignableUsers({ date: today })
      .then((res) => {
        setAssignableOnShift(res.data?.onShift ?? []);
        setAssignableAll(res.data?.all ?? []);
      })
      .catch(() => {
        setAssignableOnShift([]);
        setAssignableAll([]);
      });
  }, [today]);

  const handleExecutorChange = useCallback(
    async (orderId: number, itemId: number, executor_user_id: number | null) => {
      try {
        setOrders((prev) =>
          prev.map((o) => {
            if (o.id !== orderId || !Array.isArray(o.items)) return o;
            return {
              ...o,
              items: o.items.map((it) =>
                it.id === itemId ? { ...it, executor_user_id } : it,
              ),
            };
          }),
        );
        await updateOrderItem(orderId, itemId, { executor_user_id });
        void reloadPoolList(true);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Не удалось обновить исполнителя';
        toast.error('Ошибка', message);
        void reloadPoolList(true);
      }
    },
    [reloadPoolList, toast],
  );

  const loadSelectedOrderActivity = useCallback(
    async (orderId: number, fallbackNotes = '') => {
      const requestSeq = ++activityRequestSeqRef.current;
      activityOrderIdRef.current = orderId;
      try {
        setActivityLoading(true);
        const res = await getOrderActivity(orderId);
        if (requestSeq !== activityRequestSeqRef.current) return;
        setOrderActivity(Array.isArray(res.data?.events) ? res.data.events : []);
        setNotesDraft((prev) => {
          if (notesDirtyRef.current && activityOrderIdRef.current === orderId) return prev;
          return typeof res.data?.notes === 'string' ? res.data.notes : '';
        });
      } catch (err) {
        if (requestSeq !== activityRequestSeqRef.current) return;
        logger.error('Failed to load order activity', err);
        setOrderActivity([]);
        setNotesDraft((prev) => {
          if (notesDirtyRef.current && activityOrderIdRef.current === orderId) return prev;
          return fallbackNotes;
        });
      } finally {
        if (requestSeq === activityRequestSeqRef.current) {
          setActivityLoading(false);
        }
      }
    },
    [logger],
  );

  useEffect(() => {
    if (!selectedOrder?.id) {
      activityRequestSeqRef.current += 1;
      activityOrderIdRef.current = null;
      notesDirtyRef.current = false;
      setOrderActivity([]);
      setNotesDraft('');
      return;
    }
    const orderId = selectedOrder.id;
    const fallbackNotes = selectedOrder.notes ?? '';
    notesDirtyRef.current = false;
    setNotesDraft(fallbackNotes);
    if (activityLoading && activityOrderIdRef.current === orderId) return;
    void loadSelectedOrderActivity(orderId, fallbackNotes);
  }, [selectedOrder?.id]);

  useEffect(() => {
    getOrderPoolSync()
      .then(({ data }) => {
        const at = data?.lastWebsiteOrderAt ?? Date.now();
        try {
          localStorage.setItem(ORDER_POOL_LAST_SEEN_KEY, String(at));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
  }, []);

  const poolSyncRef = useRef<number>(0);
  useEffect(() => {
    if (!isInitialized) return;
    const pollMs = 8000;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;

    const schedule = () => {
      if (cancelled) return;
      timer = setTimeout(runPoll, pollMs);
    };

    const runPoll = async () => {
      if (cancelled || inFlight) {
        schedule();
        return;
      }
      inFlight = true;
      try {
        const { data } = await getOrderPoolSync();
        const at = data?.lastWebsiteOrderAt ?? 0;
        if (at > 0) {
          if (poolSyncRef.current === 0) {
            poolSyncRef.current = at;
          } else if (at !== poolSyncRef.current) {
            poolSyncRef.current = at;
            refreshOrdersInBackground();
          }
        }
      } catch {
        /* ignore poll errors */
      } finally {
        inFlight = false;
        schedule();
      }
    };

    void runPoll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
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
  }, [
    filters.source,
    filters.cancelled,
    filters.assigned,
    filters.searchTerm,
    filters.quickFilter,
    filters.sortBy,
    filters.sortDirection,
  ]);

  const filteredOrders = useMemo(() => {
    const hasSearch = Boolean(filters.searchTerm?.trim());
    if (hasSearch) {
      return orders;
    }

    // Пул: бэкенд уже отдаёт activeOnly; не режем по жёстким 0/1
    // (на части БД «Ожидает»/«Оформлен» имеют другие id).
    let filtered = [...orders];

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
    } else if (filters.quickFilter === 'awaiting_payment') {
      filtered = filtered.filter((o) => isAwaitingOnlinePayment(o));
    }

    filtered.sort((a, b) => {
      let valA: string | number;
      let valB: string | number;

      if (filters.sortBy === 'created_at') {
        valA = new Date(a.created_at).getTime();
        valB = new Date(b.created_at).getTime();
      } else if (filters.sortBy === 'number') {
        valA = a.number || '';
        valB = b.number || '';
      } else {
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
    [filteredOrders, filters.visibleCount],
  );
  const hasMoreOrders = visibleOrders.length < filteredOrders.length;

  const filterCounts = useMemo(() => {
    let base = [...orders];
    if (filters.source !== 'all') {
      base = base.filter((o) => o.source === filters.source);
    }
    if (filters.searchTerm.trim()) {
      const q = filters.searchTerm.trim().toLowerCase();
      base = base.filter(
        (o) =>
          (o.number || '').toLowerCase().includes(q) ||
          (o.customerName || '').toLowerCase().includes(q) ||
          (o.customerPhone || '').toLowerCase().includes(q),
      );
    }
    return {
      notAssigned: base.filter((o) => getEffectiveResponsibleUserId(o) == null && o.is_cancelled !== 1).length,
      assigned: base.filter((o) => getEffectiveResponsibleUserId(o) != null && o.is_cancelled !== 1).length,
      cancelled: base.filter((o) => o.is_cancelled === 1).length,
      debt: base.filter((o) => getOrderDebt(o) > 0 && o.is_cancelled !== 1).length,
      prepay: base.filter((o) => getOrderPrepayment(o) > 0 && o.is_cancelled !== 1).length,
      awaitingPayment: base.filter((o) => isAwaitingOnlinePayment(o) && o.is_cancelled !== 1).length,
    };
  }, [orders, filters.source, filters.searchTerm, getOrderDebt, getOrderPrepayment]);

  const handleCopyPhone = useCallback(
    (phone: string) => {
      void navigator.clipboard.writeText(phone).then(
        () => toast.success('Телефон скопирован', phone),
        () => toast.error('Не удалось скопировать'),
      );
    },
    [toast],
  );

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
            x.id === o.id ? { ...x, userId: currentUserId, responsible_user_id: currentUserId } : x,
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
    [currentUserId, orders, toast, logger],
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
    [allUsers, orders, toast, logger, updateOrderInList],
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
            userId: null as unknown as number,
            responsible_user_id: null as unknown as number,
            is_cancelled: 0,
          });
        }
      } catch (err) {
        logger.error('Failed to return order to pool', err);
        toast.error('Ошибка возврата в пул', (err as Error).message);
      }
    },
    [orders, toast, logger, updateOrderInList],
  );

  const issuingRef = useRef(false);
  const handleIssueOrder = useCallback(
    async (orderId: number) => {
      if (issuingRef.current) return;
      issuingRef.current = true;
      setIssuingOrderId(orderId);
      try {
        const d = new Date();
        const issueDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        await issueOrder(orderId, issueDate);
        toast.success('Заказ выдан', 'Долг закрыт, заказ переведён в «Выдан»');
        const order = orders.find((o) => o.id === orderId);
        const total = order ? getOrderAmounts(order).total : 0;
        updateOrderInList(orderId, {
          status: 7 as Order['status'],
          prepaymentAmount: total,
          prepaymentStatus: 'paid',
          paymentMethod: 'offline',
        });
      } catch (err: unknown) {
        logger.error('Issue order failed', err);
        const message = err instanceof Error ? err.message : 'Не удалось выдать заказ';
        toast.error('Ошибка', message);
      } finally {
        issuingRef.current = false;
        setIssuingOrderId(null);
      }
    },
    [orders, toast, logger, updateOrderInList],
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
          status: Number(data?.status ?? 0) as Order['status'],
          userId: null as unknown as number,
          responsible_user_id: null as unknown as number,
        });
      } catch (err) {
        logger.error('Failed to cancel online order', err);
        toast.error('Ошибка отмены', (err as Error).message);
      }
    },
    [toast, logger, updateOrderInList, requestReason, getPresets],
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
    [toast, logger, requestReason, getPresets],
  );

  const handlePrepaymentCreated = useCallback(
    async (
      amount: number,
      _email: string,
      paymentMethod: 'online' | 'offline' | 'telegram',
      assignToMe?: boolean,
    ) => {
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
      } catch (err: unknown) {
        logger.error('Prepayment failed', err);
        const message = err instanceof Error ? err.message : 'Не удалось обновить предоплату';
        toast.error('Ошибка', message);
        throw err;
      }
    },
    [selectedOrder, currentUserId, toast, logger, updateOrderInList],
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
      } catch (err: unknown) {
        logger.error('Remove prepayment failed', err);
        const message = err instanceof Error ? err.message : 'Не удалось удалить предоплату';
        toast.error('Ошибка', message);
      }
    },
    [toast, logger, updateOrderInList],
  );

  const handleSaveNotes = useCallback(async () => {
    if (!selectedOrder) return;
    try {
      setNotesSaving(true);
      await updateOrderNotes(selectedOrder.id, notesDraft.trim() ? notesDraft : null);
      notesDirtyRef.current = false;
      updateOrderInList(selectedOrder.id, { notes: notesDraft.trim() ? notesDraft : '' });
      await loadSelectedOrderActivity(selectedOrder.id, notesDraft.trim() ? notesDraft : '');
      toast.success('Сохранено', 'Примечания обновлены');
    } catch (err: unknown) {
      logger.error('Failed to save notes', err);
      const message = err instanceof Error ? err.message : 'Не удалось сохранить примечания';
      toast.error('Ошибка', message);
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

  const selectedDebt = selectedOrder ? getOrderDebt(selectedOrder) : 0;
  const selectedPrepay = selectedOrder ? getOrderPrepayment(selectedOrder) : 0;
  const selectedTotal = selectedOrder ? getOrderTotal(selectedOrder) : 0;

  return (
    <div className="order-pool-page">
      <div className="order-pool-sidebar">
        <button type="button" onClick={() => navigate('/')} className="back-button">
          ← Назад
        </button>
        <h2>
          Пул заказов
          <span className="order-pool-sidebar__count">{filteredOrders.length}</span>
        </h2>

        <OrderPoolFilters
          filters={filters}
          dispatchFilters={dispatchFilters}
          searchLoading={searchLoading}
          counts={filterCounts}
        />

        {departments.length > 0 ? (
          <label className="order-pool-department-filter">
            Точка
            <select
              value={poolDepartmentId === '' ? '' : String(poolDepartmentId)}
              onChange={(e) => {
                const v = e.target.value;
                setPoolDepartmentId(v === '' ? '' : Number(v));
              }}
            >
              <option value="">Все точки</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {myDepartmentId != null && d.id === myDepartmentId ? `${d.name} (моя)` : d.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <OrderPoolList
          orders={visibleOrders}
          selectedOrderId={selectedOrder?.id}
          currentUserId={currentUserId}
          onSelect={setSelectedOrder}
          onTakeOrder={(order) => {
            if (order.number) void handleAssignToMe(order.number);
          }}
          onCopyPhone={handleCopyPhone}
          searchLoading={searchLoading}
          getOrderPrepayment={getOrderPrepayment}
          getOrderDebt={getOrderDebt}
          getOrderTotal={getOrderTotal}
        />

        {hasMoreOrders && (
          <div className="order-list-load-more">
            <Button
              type="button"
              variant="secondary"
              className="load-more-btn"
              onClick={() => dispatchFilters({ type: 'increaseVisible', step: 100 })}
            >
              Показать ещё
            </Button>
          </div>
        )}
      </div>

      <div className="order-pool-detail">
        {selectedOrder ? (
          <>
            <OrderPoolDetailHeader
              order={selectedOrder}
              currentUserId={currentUserId}
              allUsers={allUsers}
              assignableOnShift={assignableOnShift}
              assignableAll={assignableAll}
              departments={departments}
              assignableDate={today}
              onResponsibleChange={(userId) => {
                if (userId == null) {
                  handleReturnToPool(selectedOrder.number!);
                } else {
                  handleReassignTo(selectedOrder.number!, userId);
                }
              }}
              onTransferred={(updated) => {
                updateOrderInList(updated.id, updated);
                setSelectedOrder(updated);
                toast.success('Готово', 'Заказ передан');
                void reloadPoolList(true);
              }}
              onTransferError={(msg) => toast.error('Ошибка', msg)}
              onAssignToMe={() => handleAssignToMe(selectedOrder.number!)}
              onShowFiles={() => setShowFilesModal(true)}
              onShowPrepayment={() => setShowPrepaymentModal(true)}
              onSendPaymentLink={() => setShowSendPaymentLinkModal(true)}
              onRemovePrepayment={() => handleRemovePrepayment(selectedOrder.id)}
              onIssueOrder={() => handleIssueOrder(selectedOrder.id)}
              onCancelOrder={() => handleCancelOnline(selectedOrder.id)}
              onPermanentDelete={() => handlePermanentDelete(selectedOrder.id)}
              onCopyPhone={handleCopyPhone}
              showRemovePrepayment={selectedPrepay > 0}
              showIssueOrder={
                (selectedDebt > 0 ||
                  (selectedPrepay >= selectedTotal && selectedTotal > 0)) &&
                Number(selectedOrder.status) !== 7
              }
              showCancelOrder={
                (Number(selectedOrder.status) === 0 || Number(selectedOrder.status) === 1) &&
                selectedOrder.is_cancelled !== 1
              }
              showPermanentDelete={isAdmin && selectedOrder.is_cancelled === 1}
              issuing={issuingOrderId === selectedOrder.id}
            />

            <OrderPoolPaymentSummary
              order={selectedOrder}
              prepay={selectedPrepay}
              debt={selectedDebt}
              onCopyPaymentUrl={() => {
                void navigator.clipboard.writeText(selectedOrder.paymentUrl || '').then(
                  () => toast.success('Ссылка скопирована'),
                  () => toast.error('Не удалось скопировать'),
                );
              }}
            />

            {orderStatuses.length > 0 && (
              <details className="order-pool-collapsible">
                <summary className="order-pool-collapsible__summary">Статусы</summary>
                <OrderStatusTimeline
                  statuses={orderStatuses}
                  currentStatusId={Number(selectedOrder.status)}
                  createdAt={selectedOrder.created_at ?? (selectedOrder as { createdAt?: string }).createdAt}
                  readyAt={(selectedOrder as { readyAt?: string | null }).readyAt ?? null}
                  hasItems={(selectedOrder.items?.length ?? 0) > 0}
                />
              </details>
            )}

            <OrderContent
              order={selectedOrder}
              onLoadOrders={() => {
                void reloadPoolList(true);
              }}
              readOnly
              operatorsToday={operatorsToday.length > 0 ? operatorsToday : allUsers}
              assignableOnShift={assignableOnShift.length > 0 ? assignableOnShift : undefined}
              assignableAll={assignableAll.length > 0 ? assignableAll : undefined}
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
              showPaymentBreakdown={false}
            />

            <div className="order-activity-panel">
              <div className="order-activity-panel__header">
                <h3>Примечания</h3>
                <Button
                  type="button"
                  variant="success"
                  size="sm"
                  onClick={() => void handleSaveNotes()}
                  disabled={notesSaving}
                  loading={notesSaving}
                >
                  {notesSaving ? 'Сохранение...' : 'Сохранить'}
                </Button>
              </div>
              <textarea
                className="order-activity-panel__notes"
                value={notesDraft}
                onChange={(e) => {
                  notesDirtyRef.current = true;
                  setNotesDraft(e.target.value);
                }}
                placeholder="Добавьте примечание по заказу..."
                rows={3}
              />

              <details className="order-pool-collapsible order-pool-collapsible--nested">
                <summary className="order-pool-collapsible__summary">История изменений</summary>
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
                        <div className="order-activity-event__meta">{event.user_name || 'Система'}</div>
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
              </details>
            </div>
          </>
        ) : (
          <div className="order-pool-detail-empty">
            <p className="order-pool-detail-empty__title">Выберите заказ</p>
            <p className="order-pool-detail-empty__hint">
              Слева список — откройте заказ, чтобы взять в работу, проверить оплату и позиции.
            </p>
          </div>
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
          onPrepaymentUpdate={() => {
            void reloadPoolList(true);
          }}
          onOpenPrepaymentModal={() => setShowPrepaymentModal(true)}
        />
      )}
      {showSendPaymentLinkModal && selectedOrder && (
        <SendPaymentLinkModal
          isOpen={showSendPaymentLinkModal}
          onClose={() => setShowSendPaymentLinkModal(false)}
          order={selectedOrder}
          debtAmount={getOrderDebt(selectedOrder)}
          onUpdated={(updated) => {
            updateOrderInList(updated.id, updated);
            void reloadPoolList(true);
          }}
          onToast={(type, title, message) => {
            if (type === 'success') toast.success(title, message);
            else toast.error(title, message);
          }}
        />
      )}
      {ReasonPromptModalElement}
    </div>
  );
};
