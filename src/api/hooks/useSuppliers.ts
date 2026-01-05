import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';
import { ENDPOINTS } from '../endpoints';

// Query keys
export const supplierKeys = {
  all: ['suppliers'] as const,
  lists: () => [...supplierKeys.all, 'list'] as const,
  list: (filters?: any) => [...supplierKeys.lists(), filters] as const,
  details: () => [...supplierKeys.all, 'detail'] as const,
  detail: (id: number) => [...supplierKeys.details(), id] as const,
};

// Типы для поставщиков
export interface Supplier {
  id: number;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSupplierRequest {
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  is_active?: boolean;
}

export interface UpdateSupplierRequest extends Partial<CreateSupplierRequest> {}

// Получение списка поставщиков
export const useSuppliers = (filters?: any) => {
  return useQuery({
    queryKey: supplierKeys.list(filters),
    queryFn: async () => {
      const response = await api.get<Supplier[]>(ENDPOINTS.SUPPLIERS.LIST);
      return response.data;
    },
    staleTime: 10 * 60 * 1000, // 10 минут
  });
};

// Получение поставщика по ID
export const useSupplier = (id: number) => {
  return useQuery({
    queryKey: supplierKeys.detail(id),
    queryFn: async () => {
      const response = await api.get<Supplier>(ENDPOINTS.SUPPLIERS.GET(id));
      return response.data;
    },
    enabled: !!id,
  });
};

// Создание поставщика
export const useCreateSupplier = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: CreateSupplierRequest) => {
      const response = await api.post<Supplier>(ENDPOINTS.SUPPLIERS.CREATE, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: supplierKeys.lists() });
    },
  });
};

// Обновление поставщика
export const useUpdateSupplier = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateSupplierRequest }) => {
      const response = await api.put<Supplier>(ENDPOINTS.SUPPLIERS.UPDATE(id), data);
      return response.data;
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(supplierKeys.detail(variables.id), data);
      queryClient.invalidateQueries({ queryKey: supplierKeys.lists() });
    },
  });
};

// Удаление поставщика
export const useDeleteSupplier = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(ENDPOINTS.SUPPLIERS.DELETE(id));
    },
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: supplierKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: supplierKeys.lists() });
    },
  });
};
