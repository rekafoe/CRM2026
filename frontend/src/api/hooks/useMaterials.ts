import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';
import { ENDPOINTS } from '../endpoints';
import { Material, CreateMaterialRequest, UpdateMaterialRequest, MaterialFilters } from '../types';

// Query keys
export const materialKeys = {
  all: ['materials'] as const,
  lists: () => [...materialKeys.all, 'list'] as const,
  list: (filters: MaterialFilters) => [...materialKeys.lists(), filters] as const,
  details: () => [...materialKeys.all, 'detail'] as const,
  detail: (id: number) => [...materialKeys.details(), id] as const,
  categories: () => [...materialKeys.all, 'categories'] as const,
  lowStock: () => [...materialKeys.all, 'low-stock'] as const,
};

// Получение списка материалов
export const useMaterials = (filters: MaterialFilters = {}) => {
  return useQuery({
    queryKey: materialKeys.list(filters),
    queryFn: async () => {
      const response = await api.get<Material[]>(ENDPOINTS.MATERIALS.LIST, filters);
      // Дедупликация по id - оставляем только первое вхождение каждого id
      const uniqueMaterials = response.data.reduce((acc, material) => {
        if (!acc.find(m => m.id === material.id)) {
          acc.push(material);
        }
        return acc;
      }, [] as Material[]);
      return uniqueMaterials;
    },
    staleTime: 10 * 60 * 1000, // 10 минут
  });
};

// Получение материала по ID
export const useMaterial = (id: number) => {
  return useQuery({
    queryKey: materialKeys.detail(id),
    queryFn: async () => {
      const response = await api.get<Material>(ENDPOINTS.MATERIALS.GET(id));
      return response.data;
    },
    enabled: !!id,
  });
};

// Получение категорий материалов
export const useMaterialCategories = () => {
  return useQuery({
    queryKey: materialKeys.categories(),
    queryFn: async () => {
      const response = await api.get<string[]>(ENDPOINTS.MATERIALS.CATEGORIES);
      return response.data;
    },
    staleTime: 30 * 60 * 1000, // 30 минут
  });
};

// Получение материалов с низким запасом
export const useLowStockMaterials = () => {
  return useQuery({
    queryKey: materialKeys.lowStock(),
    queryFn: async () => {
      const response = await api.get<Material[]>(ENDPOINTS.MATERIALS.LOW_STOCK);
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 минут
  });
};

// Создание материала
export const useCreateMaterial = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: CreateMaterialRequest) => {
      const response = await api.post<Material>(ENDPOINTS.MATERIALS.CREATE, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: materialKeys.lists() });
      queryClient.invalidateQueries({ queryKey: materialKeys.categories() });
      queryClient.invalidateQueries({ queryKey: materialKeys.lowStock() });
    },
  });
};

// Обновление материала
export const useUpdateMaterial = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateMaterialRequest }) => {
      const response = await api.put<Material>(ENDPOINTS.MATERIALS.UPDATE(id), data);
      return response.data;
    },
    onSuccess: (data, variables) => {
      // Обновляем данные материала
      queryClient.setQueryData(materialKeys.detail(variables.id), data);
      // Принудительно обновляем список материалов
      queryClient.invalidateQueries({ queryKey: materialKeys.lists() });
      queryClient.invalidateQueries({ queryKey: materialKeys.lowStock() });
      // Принудительно обновляем все запросы материалов
      queryClient.invalidateQueries({ queryKey: materialKeys.all });
    },
  });
};

// Удаление материала
export const useDeleteMaterial = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(ENDPOINTS.MATERIALS.DELETE(id));
    },
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: materialKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: materialKeys.lists() });
    },
  });
};
