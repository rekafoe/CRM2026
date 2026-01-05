import { useState, useEffect, useCallback, useRef } from 'react';
import { Order } from '../types';
import { 
  getOrders, 
  getOrderStatuses, 
  getCurrentUser, 
  getUsers, 
  getLowStock,
  listOrderFiles 
} from '../api';
import { APP_CONFIG } from '../types';
import type { OrderFile } from '../types';

interface AppDataState {
  // Основные данные
  orders: Order[];
  selectedId: number | null;
  statuses: Array<{ id: number; name: string; color?: string; sort_order: number }>;
  files: OrderFile[];
  lowStock: any[];
  currentUser: { id: number; name: string; role: string } | null;
  allUsers: Array<{ id: number; name: string }>;
  
  // Контекст
  contextDate: string;
  contextUserId: number | null;
  currentPage: string;
  
  // Дополнительные данные
  prepayAmount: string;
}

interface AppDataActions {
  // Основные действия
  setOrders: (orders: Order[]) => void;
  setSelectedId: (id: number | null) => void;
  setContextDate: (date: string) => void;
  setContextUserId: (userId: number | null) => void;
  setCurrentPage: (page: string) => void;
  setPrepayAmount: (amount: string) => void;
  
  // Загрузка данных
  loadOrders: (date?: string) => Promise<void>;
  loadOrderFiles: (orderId: number) => Promise<void>;
  refreshData: () => Promise<void>;
  
  // Удобные методы
  selectOrder: (id: number) => void;
  clearSelection: () => void;
}

// Вспомогательная функция для извлечения даты в формате YYYY-MM-DD
const extractDate = (dateString: string | null | undefined): string | null => {
  if (!dateString) return null;
  // Если строка уже в формате YYYY-MM-DD, возвращаем как есть
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString;
  }
  // Если это ISO строка с временем, извлекаем только дату
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
};

export function useAppData(): AppDataState & AppDataActions {
  // Основные данные
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statuses, setStatuses] = useState<Array<{ id: number; name: string; color?: string; sort_order: number }>>([]);
  const [files, setFiles] = useState<OrderFile[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: number; name: string; role: string } | null>(null);
  const [allUsers, setAllUsers] = useState<Array<{ id: number; name: string }>>([]);
  
  // Контекст
  const [contextDate, setContextDate] = useState<string>(() => new Date().toISOString().slice(0,10));
  const [contextUserId, setContextUserId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState<string>('orders');
  
  // Дополнительные данные
  const [prepayAmount, setPrepayAmount] = useState<string>('');
  
  // Реф для отслеживания предыдущих значений
  const prevValuesRef = useRef<{ 
    currentUser: { id: number; name: string; role: string } | null; 
    contextUserId: number | null; 
    contextDate: string | null 
  }>({ currentUser: null, contextUserId: null, contextDate: null });

  // Загрузка заказов
  const loadOrders = useCallback(async (date?: string) => {
    const targetDate = (date || contextDate).slice(0,10);
    const uid = contextUserId ?? currentUser?.id ?? null;
    
    try {
      const res = await getOrders();
      const filtered = res.data
        .filter(o => {
          if (!o.created_at) return false;
          const orderDate = extractDate(o.created_at);
          return orderDate === targetDate;
        })
        .filter(o => uid == null ? true : ((o as any).userId == null || (o as any).userId === uid));
      
      // Убираем дубликаты по ID
      const uniqueOrders = filtered.filter((order, index, self) => 
        index === self.findIndex(o => o.id === order.id)
      );
      
      setOrders(uniqueOrders);
      if (!selectedId && uniqueOrders.length) setSelectedId(uniqueOrders[0].id);
    } catch (error) {
      console.error('Failed to load orders', error);
    }
  }, [contextDate, contextUserId, currentUser, selectedId]);

  // Загрузка файлов заказа
  const loadOrderFiles = useCallback(async (orderId: number) => {
    try {
      const res = await listOrderFiles(orderId);
      setFiles(res.data);
    } catch (error) {
      console.error('Failed to load files for order', error);
      setFiles([]);
    }
  }, []);

  // Обновление всех данных
  const refreshData = useCallback(async () => {
    try {
      // Загружаем базовые данные
      const [statusesRes, userRes, usersRes] = await Promise.all([
        getOrderStatuses(),
        getCurrentUser().catch(() => ({ data: null })),
        getUsers().catch(() => ({ data: [] }))
      ]);
      
      setStatuses(statusesRes.data);
      setCurrentUser(userRes.data);
      setAllUsers(usersRes.data);
      
      // Загружаем данные о низких остатках для админов
      if (typeof window !== 'undefined' && localStorage.getItem(APP_CONFIG.storage.role) === 'admin') {
        try {
          const lowStockRes = await getLowStock();
          setLowStock(lowStockRes.data as any[]);
        } catch (error) {
          console.error('Failed to load low stock data', error);
        }
      }
      
      // Загружаем заказы
      await loadOrders();
    } catch (error) {
      console.error('Failed to refresh data', error);
    }
  }, [loadOrders]);

  // Удобные методы
  const selectOrder = useCallback((id: number) => {
    setSelectedId(id);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setFiles([]);
  }, []);

  // Эффекты
  useEffect(() => {
    if (currentUser && !contextUserId) {
      setContextUserId(currentUser.id);
    }
  }, [currentUser, contextUserId]);

  useEffect(() => {
    if (currentUser) {
      const targetDate = contextDate.slice(0,10);
      const uid = contextUserId ?? currentUser?.id ?? null;
      
      // Проверяем, изменились ли значения
      const prevValues = prevValuesRef.current;
      const hasChanged = 
        prevValues.currentUser !== currentUser ||
        prevValues.contextUserId !== contextUserId ||
        prevValues.contextDate !== contextDate;
      
      if (!hasChanged) {
        return; // Пропускаем если значения не изменились
      }
      
      // Обновляем предыдущие значения
      prevValuesRef.current = { currentUser, contextUserId, contextDate };
      
      loadOrders();
    }
  }, [currentUser, contextUserId, contextDate, loadOrders]);

  useEffect(() => {
    if (selectedId) {
      loadOrderFiles(selectedId);
    } else {
      setFiles([]);
    }
  }, [selectedId, loadOrderFiles]);

  // Инициализация данных
  useEffect(() => {
    refreshData();
  }, []);

  return {
    // Состояния
    orders,
    selectedId,
    statuses,
    files,
    lowStock,
    currentUser,
    allUsers,
    contextDate,
    contextUserId,
    currentPage,
    prepayAmount,
    
    // Сеттеры
    setOrders,
    setSelectedId,
    setContextDate,
    setContextUserId,
    setCurrentPage,
    setPrepayAmount,
    
    // Действия
    loadOrders,
    loadOrderFiles,
    refreshData,
    selectOrder,
    clearSelection,
  };
}
