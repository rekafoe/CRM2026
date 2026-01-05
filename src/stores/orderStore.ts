import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { Order, Item } from '../types';

interface OrderState {
  // Состояние
  orders: Order[];
  currentOrder: Order | null;
  isLoading: boolean;
  error: string | null;
  
  // Действия
  setOrders: (orders: Order[]) => void;
  addOrder: (order: Order) => void;
  updateOrder: (id: number, updates: Partial<Order>) => void;
  deleteOrder: (id: number) => void;
  setCurrentOrder: (order: Order | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  
  // Действия с позициями заказа
  addOrderItem: (orderId: number, item: Item) => void;
  updateOrderItem: (orderId: number, itemId: number, updates: Partial<Item>) => void;
  deleteOrderItem: (orderId: number, itemId: number) => void;
  
  // Вычисляемые значения
  getOrderById: (id: number) => Order | undefined;
  getOrderTotal: (orderId: number) => number;
  getOrdersByStatus: (status: number | string) => Order[];
}

export const useOrderStore = create<OrderState>()(
  devtools(
    (set, get) => ({
      // Начальное состояние
      orders: [],
      currentOrder: null,
      isLoading: false,
      error: null,
      
      // Основные действия
      setOrders: (orders) => set({ orders, error: null }),
      
      addOrder: (order) => set((state) => ({
        orders: [...state.orders, order]
      })),
      
      updateOrder: (id, updates) => set((state) => ({
        orders: state.orders.map(order => 
          order.id === id ? { ...order, ...updates } : order
        ),
        currentOrder: state.currentOrder?.id === id 
          ? { ...state.currentOrder, ...updates }
          : state.currentOrder
      })),
      
      deleteOrder: (id) => set((state) => ({
        orders: state.orders.filter(order => order.id !== id),
        currentOrder: state.currentOrder?.id === id ? null : state.currentOrder
      })),
      
      setCurrentOrder: (order) => set({ currentOrder: order }),
      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),
      
      // Действия с позициями заказа
      addOrderItem: (orderId, item) => set((state) => ({
        orders: state.orders.map(order => 
          order.id === orderId 
            ? { ...order, items: [...(order.items || []), item] }
            : order
        ),
        currentOrder: state.currentOrder?.id === orderId
          ? { ...state.currentOrder, items: [...(state.currentOrder.items || []), item] }
          : state.currentOrder
      })),
      
      updateOrderItem: (orderId, itemId, updates) => set((state) => ({
        orders: state.orders.map(order => 
          order.id === orderId 
            ? {
                ...order,
                items: order.items?.map(item => 
                  item.id === itemId ? { ...item, ...updates } : item
                ) || []
              }
            : order
        ),
        currentOrder: state.currentOrder?.id === orderId
          ? {
              ...state.currentOrder,
              items: state.currentOrder.items?.map(item => 
                item.id === itemId ? { ...item, ...updates } : item
              ) || []
            }
          : state.currentOrder
      })),
      
      deleteOrderItem: (orderId, itemId) => set((state) => ({
        orders: state.orders.map(order => 
          order.id === orderId 
            ? {
                ...order,
                items: order.items?.filter(item => item.id !== itemId) || []
              }
            : order
        ),
        currentOrder: state.currentOrder?.id === orderId
          ? {
              ...state.currentOrder,
              items: state.currentOrder.items?.filter(item => item.id !== itemId) || []
            }
          : state.currentOrder
      })),
      
      // Вычисляемые значения
      getOrderById: (id) => get().orders.find(order => order.id === id),
      
      getOrderTotal: (orderId) => {
        const order = get().orders.find(order => order.id === orderId);
        if (!order?.items) return 0;
        return order.items.reduce((total, item) => total + (item.price * item.quantity), 0);
      },
      
      getOrdersByStatus: (status) => get().orders.filter(order => String(order.status) === String(status))
    }),
    {
      name: 'order-store',
    }
  )
);
