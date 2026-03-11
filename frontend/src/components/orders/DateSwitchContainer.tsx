import React, { useState, useCallback, useRef, useEffect } from 'react';
import { DateSwitcher } from './DateSwitcher';
import { AppIcon } from '../ui/AppIcon';
import { useToastNotifications } from '../Toast';
import { useLogger } from '../../utils/logger';
import { getOrders } from '../../api';
import type { Order } from '../../types';
import './DateSwitcher.css';

interface DateSwitchContainerProps {
  currentDate: string;
  contextUserId: number | null;
  currentUser: { id: number; name: string; role: string } | null;
  onDateChange: (newDate: string) => void;
  onOrdersChange: (orders: Order[]) => void;
  onSelectedIdChange: (id: number | null) => void;
  selectedId: number | null;
  isVisible: boolean;
  onClose: () => void;
}

export const DateSwitchContainer: React.FC<DateSwitchContainerProps> = ({
  currentDate,
  contextUserId,
  currentUser,
  onDateChange,
  onOrdersChange,
  onSelectedIdChange,
  selectedId,
  isVisible,
  onClose
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [userDates, setUserDates] = useState<Array<{ date: string; orderCount: number }>>([]);
  const toast = useToastNotifications();
  const logger = useLogger('DateSwitchContainer');

  // Реф для отслеживания предыдущих значений и предотвращения циклов
  const prevValuesRef = useRef<{
    currentUser: { id: number; name: string; role: string } | null; 
    contextUserId: number | null; 
    currentDate: string | null 
  }>({ currentUser: null, contextUserId: null, currentDate: null });

  const userDatesLoadedRef = useRef<boolean>(false);

  // Функция для сбора дат пользователя
  const loadUserDates = useCallback(async () => {
    if (!currentUser) return;

    // Проверяем, не загружены ли уже даты для этого пользователя
    if (userDatesLoadedRef.current) {
      logger.info('User dates already loaded, skipping');
      return;
    }

    try {
      const res = await getOrders();
      const uid = contextUserId ?? currentUser.id;
      
      // Фильтруем заказы пользователя
      // Показываем ВСЕ заказы пользователя (включая назначенные онлайн заказы)
      const userOrders = res.data.filter((order: any) => {
        // Показываем заказы, где пользователь является создателем ИЛИ назначенным исполнителем
        return order.userId === uid;
      });
      
      // Группируем по датам и считаем количество заказов
      const dateMap = new Map<string, number>();
      userOrders.forEach((order: any) => {
        if (order.created_at) {
          const orderDate = new Date(order.created_at).toISOString().split('T')[0];
          dateMap.set(orderDate, (dateMap.get(orderDate) || 0) + 1);
        }
      });
      
      // Преобразуем в массив и сортируем
      const dates = Array.from(dateMap.entries())
        .map(([date, orderCount]) => ({ date, orderCount }))
        .sort((a, b) => b.date.localeCompare(a.date));
      
      setUserDates(dates);
      userDatesLoadedRef.current = true;
      logger.info(`Loaded ${dates.length} user dates`, { userDatesCount: dates.length });
    } catch (error) {
      logger.error('Failed to load user dates', error);
    }
  }, [currentUser, contextUserId, logger]);

  // Функция загрузки заказов для конкретной даты
  const loadOrdersForDate = useCallback(async (date: string) => {
    if (!currentUser) return;

    setIsLoading(true);
    const targetDate = date.slice(0, 10);
    const uid = contextUserId ?? currentUser?.id ?? null;
    
    try {
      const res = await getOrders();
      const filtered = res.data
        .filter(o => {
          if (!o.created_at) return false;
          const orderDate = new Date(o.created_at).toISOString().slice(0, 10);
          return orderDate === targetDate;
        })
        .filter(o => {
          // Показываем заказы, где пользователь является создателем ИЛИ назначенным исполнителем
          return o.userId === uid;
        });
      
      // Убираем дубликаты по ID
      const uniqueOrders = filtered.filter((order, index, self) => 
        index === self.findIndex(o => o.id === order.id)
      );
      
      onOrdersChange(uniqueOrders);
      
      // Устанавливаем selectedId только если его нет и есть заказы
      if (!selectedId && uniqueOrders.length > 0) {
        onSelectedIdChange(uniqueOrders[0].id);
      }
      
      logger.info(`Loaded ${uniqueOrders.length} orders for date ${targetDate}`, { orderCount: uniqueOrders.length, targetDate });
    } catch (error) {
      logger.error('Failed to load orders', error);
      toast.error('Ошибка загрузки заказов', (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, contextUserId, onOrdersChange, onSelectedIdChange, selectedId]);

  // Обработчик изменения даты
  const handleDateChange = useCallback(async (newDate: string) => {
    // Проверяем, изменились ли значения
    const prevValues = prevValuesRef.current;
    const hasChanged = 
      prevValues.currentUser !== currentUser ||
      prevValues.contextUserId !== contextUserId ||
      prevValues.currentDate !== newDate;
    
    if (!hasChanged) {
      return; // Пропускаем если значения не изменились
    }
    
    // Обновляем предыдущие значения
    prevValuesRef.current = { 
      currentUser: currentUser || null, 
      contextUserId: contextUserId || null, 
      currentDate: newDate || '' 
    };

    // Обновляем дату в родительском компоненте
    onDateChange(newDate);
    
    // Загружаем заказы для новой даты
    await loadOrdersForDate(newDate);
  }, [currentUser, contextUserId, onDateChange]);

  // Загружаем даты пользователя только при открытии модального окна
  useEffect(() => {
    if (currentUser && isVisible) {
      // Вызываем функцию напрямую, не через useCallback
      const loadDates = async () => {
        if (!currentUser) return;

        // Проверяем, не загружены ли уже даты для этого пользователя
        if (userDatesLoadedRef.current) {
          logger.info('User dates already loaded, skipping');
          return;
        }

        try {
          const res = await getOrders();
          const uid = contextUserId ?? currentUser.id;
          
          // Фильтруем заказы пользователя
          // Показываем ВСЕ заказы пользователя (включая назначенные онлайн заказы)
          const userOrders = res.data.filter((order: any) => {
            // Показываем заказы, где пользователь является создателем ИЛИ назначенным исполнителем
            return order.userId === uid;
          });
          
          // Группируем по датам и считаем количество заказов
          const dateMap = new Map<string, number>();
          userOrders.forEach((order: any) => {
            if (order.created_at) {
              const orderDate = new Date(order.created_at).toISOString().split('T')[0];
              dateMap.set(orderDate, (dateMap.get(orderDate) || 0) + 1);
            }
          });
          
          // Преобразуем в массив и сортируем
          const dates = Array.from(dateMap.entries())
            .map(([date, orderCount]) => ({ date, orderCount }))
            .sort((a, b) => b.date.localeCompare(a.date));
          
          setUserDates(dates);
          userDatesLoadedRef.current = true;
          logger.info(`Loaded ${dates.length} user dates`, { userDatesCount: dates.length });
        } catch (error) {
          logger.error('Failed to load user dates', error);
        }
      };
      
      loadDates();
    }
  }, [currentUser, isVisible, contextUserId, logger]);

  // Отдельный useEffect для сброса состояния при закрытии
  useEffect(() => {
    if (!isVisible) {
      // Сбрасываем даты и флаг загрузки при закрытии модального окна
      setUserDates([]);
      userDatesLoadedRef.current = false;
    }
  }, [isVisible]);

  // Автоматическая загрузка при изменении параметров
  useEffect(() => {
    if (currentUser && isVisible) {
      // Проверяем, не загружаем ли мы уже заказы для этой даты
      const prevValues = prevValuesRef.current;
      if (prevValues.currentDate !== currentDate) {
        loadOrdersForDate(currentDate);
      }
    }
  }, [currentUser, currentDate, isVisible]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="modal-overlay date-switcher-overlay">
      <div className="modal modal-lg date-switcher-modal">
        <div className="modal-header date-switcher-header">
          <h2><AppIcon name="calendar" size="sm" /> Выбор даты</h2>
          <button
            className="btn-close"
            onClick={onClose}
            disabled={isLoading}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <div className="modal-body date-switcher-body">
          {isLoading ? (
            <div className="date-switcher-loading">
              <div className="date-switcher-loading-text">Загрузка заказов...</div>
            </div>
          ) : (
            <DateSwitcher
              currentDate={currentDate}
              onDateChange={handleDateChange}
              onClose={onClose}
              userDates={userDates}
            />
          )}
        </div>
      </div>
    </div>
  );
};
