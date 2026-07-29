import { useState, useEffect, useRef, useCallback } from 'react';
import { Order, OrderFile } from '../../../types';
import { getOrders, getOrderStatuses, getCurrentUser, getUsers, getLowStock, listOrderFiles, getDailyReports } from '../../../api';
import { APP_CONFIG } from '../../../types';
import { useToastNotifications } from '../../Toast';
import { useLogger } from '../../../utils/logger';

const extractDate = (dateString: string | null | undefined): string | null => {
  if (!dateString) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString;
  }
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
};

export type OrdersListTab = 'orders' | 'issued';

export const useOptimizedAppData = (
  contextDate: string,
  contextUserId: number | null,
  selectedId: number | null,
  ordersListTab: OrdersListTab = 'orders'
) => {
  const toast = useToastNotifications();
  const logger = useLogger('OptimizedApp');
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [statuses, setStatuses] = useState<Array<{ id: number; name: string; color?: string; sort_order: number }>>([]);
  const [files, setFiles] = useState<OrderFile[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: number; name: string; role: string } | null>(null);
  const [allUsers, setAllUsers] = useState<Array<{ id: number; name: string }>>([]);
  const [activeUsers, setActiveUsers] = useState<Array<{ id: number; name: string }>>([]);
  
  const prevValuesRef = useRef<{ 
    currentUser: { id: number; name: string; role: string } | null; 
    contextUserId: number | null; 
    contextDate: string | null;
    ordersListTab: OrdersListTab;
  }>({ currentUser: null, contextUserId: null, contextDate: null, ordersListTab: 'orders' });
  
  const loadingRef = useRef(false);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Загрузка начальных данных
  useEffect(() => {
    getOrderStatuses()
      .then((r) => setStatuses(Array.isArray(r.data) ? r.data : []))
      .catch(() => setStatuses([]));
    getCurrentUser().then(r => setCurrentUser(r.data)).catch(() => setCurrentUser(null));
    getUsers()
      .then((r) => setAllUsers(Array.isArray(r.data) ? r.data : []))
      .catch(() => setAllUsers([]));
    if (typeof window !== 'undefined' && localStorage.getItem(APP_CONFIG.storage.role) === 'admin') {
      getLowStock()
        .then((r) => setLowStock(Array.isArray(r.data) ? (r.data as any[]) : []))
        .catch(() => setLowStock([]));
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const targetDate = contextDate.slice(0, 10);

    getDailyReports({ from: targetDate, to: targetDate, show_all: true })
      .then((res) => {
        const byId = new Map<number, string>();
        (res.data || []).forEach((report) => {
          if (!report.user_id) return;
          const name = report.user_name || `User ${report.user_id}`;
          byId.set(report.user_id, name);
        });
        const list = Array.from(byId.entries()).map(([id, name]) => ({ id, name }));
        if (list.length === 0) {
          setActiveUsers([{ id: currentUser.id, name: currentUser.name }]);
        } else {
          setActiveUsers(list);
        }
      })
      .catch(() => {
        setActiveUsers([{ id: currentUser.id, name: currentUser.name }]);
      });
  }, [currentUser, contextDate]);

  // Загрузка заказов (Заказы / Выданные заказы) — только свои заказы; Order Pool отдельно запрашивает all
  useEffect(() => {
    if (!currentUser) return;
    
    const targetDate = contextDate.slice(0, 10);
    const uid = contextUserId ?? currentUser?.id ?? null;
    
    const prevValues = prevValuesRef.current;
    const hasChanged = 
      prevValues.currentUser?.id !== currentUser.id ||
      prevValues.contextUserId !== contextUserId ||
      prevValues.contextDate !== contextDate ||
      prevValues.ordersListTab !== ordersListTab;
    
    if (!hasChanged) {
      return;
    }
    
    if (loadingRef.current) return;
    
    prevValuesRef.current = { 
      currentUser: currentUser, 
      contextUserId: contextUserId, 
      contextDate: contextDate,
      ordersListTab 
    };
    
    loadingRef.current = true;
    let cancelled = false;
    
    const fetchOrders = ordersListTab === 'issued'
      ? getOrders({ issued_on: targetDate })
      : getOrders({ date: targetDate });
    
    fetchOrders.then((res) => {
      if (cancelled) return;
      let list = Array.isArray(res.data) ? res.data : [];
      if (ordersListTab === 'orders') {
        list = list
          .filter(o => {
            const assigned = (o as any).assigned_as_executor === true || (o as any).assigned_as_executor === 1;
            const rawDate = (o as any).created_at ?? (o as any).createdAt;
            const onDay = !rawDate || extractDate(rawDate) === targetDate;
            if (!assigned) return onDay;
            // Чужой executor-заказ другого дня: не тащим завершённые/отменённые
            if (onDay) return true;
            if ((o as any).is_cancelled === 1) return false;
            const st = Number((o as any).status);
            if (st === 7) return false;
            const name = String((o as any).status_name || '').toLowerCase();
            if (name.includes('заверш') || name.includes('выполнен') || name.includes('выдан') || name.includes('отмен')) {
              return false;
            }
            return true;
          })
          .filter(o => {
            if (uid == null) return true;
            // Свои как владелец / без владельца
            if ((o as any).userId == null || (o as any).userId === uid) return true;
            // Назначен исполнителем по позиции
            const assigned = (o as any).assigned_as_executor;
            return assigned === true || assigned === 1;
          });
        // Выданные (status 7) не скрываем — заказ создателя не пропадает, если его выдал коллега.
      }
      const uniqueOrders = list.filter((order, index, self) => 
        index === self.findIndex(o => o.id === order.id)
      );
      
      setOrders(prevOrders => {
        if (
          prevOrders.length === uniqueOrders.length &&
          prevOrders.every((o, i) => {
            const next = uniqueOrders[i];
            if (!next) return false;
            const itemsMatch =
              (o.items?.length || 0) === (next.items?.length || 0) &&
              (o.items || []).every((it, j) => {
                const nj = (next.items || [])[j];
                return (
                  it &&
                  nj &&
                  it.id === nj.id &&
                  (it.printerId ?? null) === (nj.printerId ?? null) &&
                  (it.executor_user_id ?? null) === (nj.executor_user_id ?? null)
                );
              });
            return (
              o.id === next.id &&
              itemsMatch &&
              Number(o.prepaymentAmount || 0) === Number(next.prepaymentAmount || 0) &&
              (o.prepaymentStatus || '') === (next.prepaymentStatus || '') &&
              (o.paymentMethod || '') === (next.paymentMethod || '') &&
              Boolean(o.assigned_as_executor) === Boolean(next.assigned_as_executor)
            );
          })
        ) {
          return prevOrders;
        }
        return uniqueOrders;
      });
    }).catch((error) => {
      if (cancelled) return;
      logger.error('Failed to load orders', error);
      toast.error('Ошибка загрузки заказов', error.message);
    }).finally(() => {
      if (!cancelled) loadingRef.current = false;
    });
    
    return () => {
      cancelled = true;
      loadingRef.current = false;
    };
  }, [currentUser?.id, contextUserId, contextDate, ordersListTab]);

  // Загрузка файлов заказа
  useEffect(() => {
    if (!selectedId) {
      setFiles([]);
      return;
    }
    
    let cancelled = false;
    
    listOrderFiles(selectedId).then(r => {
      if (cancelled) return;
      setFiles(r.data);
    }).catch((error) => {
      if (cancelled) return;
      logger.error('Failed to load files for order', error);
      toast.error('Ошибка загрузки файлов', 'Не удалось загрузить файлы для заказа');
      setFiles([]);
    });
    
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const loadOrders = useCallback((date?: string, force: boolean = false) => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
    
    const executeLoad = () => {
      const targetDate = (date || contextDate).slice(0, 10);
      const uid = contextUserId ?? currentUser?.id ?? null;
      const fetchOrders = ordersListTab === 'issued'
        ? getOrders({ issued_on: targetDate })
        : getOrders({ date: targetDate });
      
      fetchOrders.then((res) => {
        let list = Array.isArray(res.data) ? res.data : [];
        if (ordersListTab === 'orders') {
          list = list
            .filter(o => {
              const assigned = (o as any).assigned_as_executor === true || (o as any).assigned_as_executor === 1;
              const rawDate = (o as any).created_at ?? (o as any).createdAt;
              const onDay = !rawDate || extractDate(rawDate) === targetDate;
              if (!assigned) return onDay;
              if (onDay) return true;
              if ((o as any).is_cancelled === 1) return false;
              const st = Number((o as any).status);
              if (st === 7) return false;
              const name = String((o as any).status_name || '').toLowerCase();
              if (name.includes('заверш') || name.includes('выполнен') || name.includes('выдан') || name.includes('отмен')) {
                return false;
              }
              return true;
            })
            .filter(o => {
              if (uid == null) return true;
              if ((o as any).userId == null || (o as any).userId === uid) return true;
              const assigned = (o as any).assigned_as_executor;
              return assigned === true || assigned === 1;
            });
        }
        const uniqueOrders = list.filter((order, index, self) => 
          index === self.findIndex(o => o.id === order.id)
        );
        
        setOrders(prevOrders => {
          if (force) return uniqueOrders;
          if (prevOrders.length === uniqueOrders.length && 
              prevOrders.every((o, i) => {
                const newOrder = uniqueOrders[i];
                if (!newOrder) return false;
                const itemsMatch =
                  (o.items?.length || 0) === (newOrder.items?.length || 0) &&
                  (o.items || []).every((it, j) => {
                    const nj = (newOrder.items || [])[j];
                    return (
                      it &&
                      nj &&
                      it.id === nj.id &&
                      (it.printerId ?? null) === (nj.printerId ?? null) &&
                      (it.executor_user_id ?? null) === (nj.executor_user_id ?? null)
                    );
                  });
                return (
                  o.id === newOrder.id && 
                  itemsMatch &&
                  Number(o.prepaymentAmount || 0) === Number(newOrder.prepaymentAmount || 0) &&
                  (o.prepaymentStatus || '') === (newOrder.prepaymentStatus || '') &&
                  (o.paymentMethod || '') === (newOrder.paymentMethod || '') &&
                  Boolean(o.assigned_as_executor) === Boolean(newOrder.assigned_as_executor)
                );
              })) {
            return prevOrders;
          }
          return uniqueOrders;
        });
      }).catch((error) => {
        logger.error('Failed to load orders', error);
        toast.error('Ошибка загрузки заказов', error.message);
      });
    };
    
    if (force) {
      executeLoad();
    } else {
      loadTimeoutRef.current = setTimeout(executeLoad, 300);
    }
  }, [contextDate, contextUserId, currentUser?.id, ordersListTab, logger, toast]);

  return {
    orders,
    setOrders,
    statuses,
    files,
    lowStock,
    currentUser,
    setCurrentUser,
    allUsers,
    activeUsers,
    contextUserId,
    setContextUserId: (id: number | null) => {
      if (currentUser && !id) {
        // Устанавливаем contextUserId только если его нет
        return;
      }
    },
    loadOrders,
  };
};

