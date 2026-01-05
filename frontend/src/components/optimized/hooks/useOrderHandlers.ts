import { useCallback } from 'react';
import React from 'react';
import { Order } from '../../../types';
import { createOrder, deleteOrder, addOrderItem, deleteOrderItem, updateOrderStatus } from '../../../api';
import { useToastNotifications } from '../../Toast';
import { useLogger } from '../../../utils/logger';

interface UseOrderHandlersProps {
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  selectedId: number | null;
  setSelectedId: (id: number | null) => void;
  contextDate: string;
  loadOrders: (date?: string, force?: boolean) => void;
  closeCalculator: () => void;
}

export const useOrderHandlers = ({
  orders,
  setOrders,
  selectedId,
  setSelectedId,
  contextDate,
  loadOrders,
  closeCalculator,
}: UseOrderHandlersProps) => {
  const toast = useToastNotifications();
  const logger = useLogger('OptimizedApp');

  const handleCreateOrder = useCallback(async () => {
    const res = await createOrder(contextDate);
    const order = res.data;
    const uniqueOrders = orders.filter(o => o.id !== order.id);
    setOrders([order, ...uniqueOrders]);
    setSelectedId(order.id);
  }, [orders, contextDate, setOrders, setSelectedId]);

  const handleDeleteOrder = useCallback(async (orderId: number) => {
    try {
      await deleteOrder(orderId);
      setSelectedId(null);
      loadOrders();
    } catch (e: any) {
      alert('Не удалось удалить заказ. Возможно нужна авторизация.');
    }
  }, [setSelectedId, loadOrders]);

  const handleAddToOrder = useCallback(
    async (item: any) => {
      try {
        let orderId = selectedId;
        let newOrder: Order | null = null;

        if (!orderId) {
          const res = await createOrder(contextDate);
          const order = res.data;
          orderId = order.id;
          newOrder = order;
          setSelectedId(orderId);
        }

        // Добавляем товар
        const addedItem = await addOrderItem(orderId!, item);
        
        // Оптимистично обновляем локальное состояние заказа
        setOrders((prevOrders: Order[]) => {
          const orderIndex = prevOrders.findIndex(o => o.id === orderId);
          if (orderIndex === -1) {
            // Если заказа нет в списке (только что создан), добавляем его
            if (newOrder) {
              return [{ ...newOrder, items: [addedItem.data] }, ...prevOrders];
            }
            return prevOrders;
          }
          
          // Обновляем существующий заказ
          const updatedOrder = { ...prevOrders[orderIndex] };
          updatedOrder.items = [...(updatedOrder.items || []), addedItem.data];
          updatedOrder.totalAmount = (updatedOrder.totalAmount || 0) + (item.price || 0) * (item.quantity || 1);
          
          const newOrders = [...prevOrders];
          newOrders[orderIndex] = updatedOrder;
          return newOrders;
        });

        // Принудительно перезагружаем заказы для получения актуальных данных (без дебаунса)
        loadOrders(undefined, true);
        closeCalculator();

        toast.success('Товар добавлен в заказ!', 'Товар успешно добавлен в заказ');
        logger.info('Item added to order');
      } catch (error) {
        logger.error('Failed to add item to order', error);
        toast.error('Ошибка добавления товара', (error as Error).message);
        // В случае ошибки перезагружаем заказы для синхронизации
        loadOrders(undefined, true);
      }
    },
    [selectedId, contextDate, setSelectedId, setOrders, loadOrders, closeCalculator, toast, logger]
  );

  const handleReplaceOrderItem = useCallback(
    async ({ orderId, itemId, item }: { orderId: number; itemId: number; item: any }) => {
      try {
        await deleteOrderItem(orderId, itemId);
        const addedItem = await addOrderItem(orderId, item);
        
        // Оптимистично обновляем локальное состояние заказа
        setOrders((prevOrders: Order[]) => {
          const orderIndex = prevOrders.findIndex(o => o.id === orderId);
          if (orderIndex === -1) return prevOrders;
          
          const updatedOrder = { ...prevOrders[orderIndex] };
          // Удаляем старый item и добавляем новый
          updatedOrder.items = (updatedOrder.items || []).filter(i => i.id !== itemId);
          updatedOrder.items.push(addedItem.data);
          
          const newOrders = [...prevOrders];
          newOrders[orderIndex] = updatedOrder;
          return newOrders;
        });
        
        // Принудительно перезагружаем заказы
        loadOrders(undefined, true);
        closeCalculator();

        toast.success('Позиция обновлена', 'Параметры товара обновлены');
        logger.info('Order item replaced', { orderId, itemId });
      } catch (error) {
        logger.error('Failed to update order item', error);
        toast.error('Ошибка обновления позиции', (error as Error).message);
        // В случае ошибки перезагружаем заказы
        loadOrders(undefined, true);
      }
    },
    [setOrders, loadOrders, closeCalculator, toast, logger]
  );

  const handleStatusChange = useCallback(async (orderId: number, newStatus: number) => {
    try {
      // Сначала оптимистично обновляем локальное состояние
      setOrders((prev: Order[]) =>
        prev.map((order: Order) =>
          order.id === orderId ? { ...order, status: newStatus } : order
        )
      );

      // Затем отправляем запрос на бэкенд
      await updateOrderStatus(orderId, newStatus);
    } catch (err) {
      alert('Не удалось обновить статус. Возможно нужна авторизация.');
      // В случае ошибки можно перезагрузить заказы, чтобы вернуть корректное состояние
      loadOrders();
    }
  }, [setOrders, loadOrders]);

  return {
    handleCreateOrder,
    handleDeleteOrder,
    handleAddToOrder,
    handleReplaceOrderItem,
    handleStatusChange,
  };
};

