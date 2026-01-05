import { useState, useEffect, useRef, useCallback } from 'react';
import { Order, OrderFile } from '../../../types';
import { getOrders, getOrderStatuses, getCurrentUser, getUsers, getLowStock, listOrderFiles } from '../../../api';
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

export const useOptimizedAppData = (
  contextDate: string,
  contextUserId: number | null,
  selectedId: number | null
) => {
  const toast = useToastNotifications();
  const logger = useLogger('OptimizedApp');
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [statuses, setStatuses] = useState<Array<{ id: number; name: string; color?: string; sort_order: number }>>([]);
  const [files, setFiles] = useState<OrderFile[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: number; name: string; role: string } | null>(null);
  const [allUsers, setAllUsers] = useState<Array<{ id: number; name: string }>>([]);
  
  const prevValuesRef = useRef<{ 
    currentUser: { id: number; name: string; role: string } | null; 
    contextUserId: number | null; 
    contextDate: string | null 
  }>({ currentUser: null, contextUserId: null, contextDate: null });
  
  const loadingRef = useRef(false);
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Загрузка начальных данных
  useEffect(() => {
    getOrderStatuses().then(r => setStatuses(r.data));
    getCurrentUser().then(r => setCurrentUser(r.data)).catch(() => setCurrentUser(null));
    getUsers().then(r => setAllUsers(r.data)).catch(() => setAllUsers([]));
    if (typeof window !== 'undefined' && localStorage.getItem(APP_CONFIG.storage.role) === 'admin') {
      getLowStock().then(r => setLowStock(r.data as any[]));
    }
  }, []);

  // Загрузка заказов
  useEffect(() => {
    if (!currentUser) return;
    
    const targetDate = contextDate.slice(0, 10);
    const uid = contextUserId ?? currentUser?.id ?? null;
    
    const prevValues = prevValuesRef.current;
    const hasChanged = 
      prevValues.currentUser?.id !== currentUser.id ||
      prevValues.contextUserId !== contextUserId ||
      prevValues.contextDate !== contextDate;
    
    if (!hasChanged) {
      return;
    }
    
    // Проверяем, не загружается ли уже
    if (loadingRef.current) {
      return;
    }
    
    prevValuesRef.current = { 
      currentUser: currentUser, 
      contextUserId: contextUserId, 
      contextDate: contextDate 
    };
    
    loadingRef.current = true;
    let cancelled = false;
    
    getOrders().then((res) => {
      if (cancelled) return;
      
      const filtered = res.data
        .filter(o => {
          if (!o.created_at) return false;
          const orderDate = new Date(o.created_at).toISOString().slice(0, 10);
          return orderDate === targetDate;
        })
        .filter(o => uid == null ? true : ((o as any).userId == null || (o as any).userId === uid));
      
      const uniqueOrders = filtered.filter((order, index, self) => 
        index === self.findIndex(o => o.id === order.id)
      );
      
      setOrders(prevOrders => {
        // Проверяем, действительно ли изменились заказы
        if (prevOrders.length === uniqueOrders.length && 
            prevOrders.every((o, i) => o.id === uniqueOrders[i]?.id)) {
          return prevOrders;
        }
        return uniqueOrders;
      });
    }).catch((error) => {
      if (cancelled) return;
      logger.error('Failed to load orders', error);
      toast.error('Ошибка загрузки заказов', error.message);
    }).finally(() => {
      if (!cancelled) {
        loadingRef.current = false;
      }
    });
    
    return () => {
      cancelled = true;
      loadingRef.current = false;
    };
  }, [currentUser?.id, contextUserId, contextDate]);

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
    // Очищаем предыдущий таймаут дебаунса
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
    
    const executeLoad = () => {
      const targetDate = (date || contextDate).slice(0, 10);
      const uid = contextUserId ?? currentUser?.id ?? null;
      
      getOrders().then((res) => {
        const filtered = res.data
          .filter(o => {
            if (!o.created_at) return false;
            const orderDate = extractDate(o.created_at);
            return orderDate === targetDate;
          })
          .filter(o => uid == null ? true : ((o as any).userId == null || (o as any).userId === uid));
        
        const uniqueOrders = filtered.filter((order, index, self) => 
          index === self.findIndex(o => o.id === order.id)
        );
        
        setOrders(prevOrders => {
          // Если принудительное обновление, всегда обновляем
          if (force) {
            return uniqueOrders;
          }
          
          // Проверяем, действительно ли изменились заказы
          // Сравниваем не только ID, но и количество items
          if (prevOrders.length === uniqueOrders.length && 
              prevOrders.every((o, i) => {
                const newOrder = uniqueOrders[i];
                if (!newOrder) return false;
                // Сравниваем ID и количество items
                return o.id === newOrder.id && 
                       (o.items?.length || 0) === (newOrder.items?.length || 0);
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
    
    // Если принудительное обновление, выполняем сразу
    if (force) {
      executeLoad();
    } else {
      // Дебаунс для частых вызовов (300ms)
      loadTimeoutRef.current = setTimeout(executeLoad, 300);
    }
  }, [contextDate, contextUserId, currentUser?.id, logger, toast]);

  return {
    orders,
    setOrders,
    statuses,
    files,
    lowStock,
    currentUser,
    setCurrentUser,
    allUsers,
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

