import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';
import { ENDPOINTS } from '../endpoints';
import { Order, CreateOrderRequest, UpdateOrderRequest, OrderFilters } from '../types';

// Query keys
export const orderKeys = {
  all: ['orders'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (filters: OrderFilters) => [...orderKeys.lists(), filters] as const,
  details: () => [...orderKeys.all, 'detail'] as const,
  detail: (id: number) => [...orderKeys.details(), id] as const,
};

// Получение списка заказов
export const useOrders = (filters: OrderFilters = {}) => {
  return useQuery({
    queryKey: orderKeys.list(filters),
    queryFn: async () => {
      const response = await api.get<Order[]>(ENDPOINTS.ORDERS.LIST, filters);
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 минут
  });
};

// Получение заказа по ID
export const useOrder = (id: number) => {
  return useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: async () => {
      const response = await api.get<Order>(ENDPOINTS.ORDERS.GET(id));
      return response.data;
    },
    enabled: !!id,
  });
};

// Создание заказа
export const useCreateOrder = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: CreateOrderRequest) => {
      const response = await api.post<Order>(ENDPOINTS.ORDERS.CREATE, data);
      return response.data;
    },
    onSuccess: () => {
      // Инвалидируем кэш заказов
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
    },
  });
};

// Обновление заказа
export const useUpdateOrder = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateOrderRequest }) => {
      const response = await api.put<Order>(ENDPOINTS.ORDERS.UPDATE(id), data);
      return response.data;
    },
    onSuccess: (data, variables) => {
      // Обновляем кэш
      queryClient.setQueryData(orderKeys.detail(variables.id), data);
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
    },
  });
};

// Удаление заказа
export const useDeleteOrder = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(ENDPOINTS.ORDERS.DELETE(id));
    },
    onSuccess: (_, id) => {
      // Удаляем из кэша
      queryClient.removeQueries({ queryKey: orderKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
    },
  });
};

// Обновление статуса заказа
export const useUpdateOrderStatus = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const response = await api.patch<Order>(ENDPOINTS.ORDERS.UPDATE(id), { status });
      return response.data;
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(orderKeys.detail(variables.id), data);
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
    },
  });
};
