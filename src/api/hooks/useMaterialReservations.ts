import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { materialReservationApi } from '../materialReservations';
import { 
  CreateMaterialReservationRequest, 
  UpdateMaterialReservationRequest, 
  MaterialReservation 
} from '../types';

// Query Keys
export const materialReservationKeys = {
  all: ['materialReservations'] as const,
  lists: () => [...materialReservationKeys.all, 'list'] as const,
  list: (filters: Record<string, any>) => [...materialReservationKeys.lists(), { filters }] as const,
  details: () => [...materialReservationKeys.all, 'detail'] as const,
  detail: (id: number) => [...materialReservationKeys.details(), id] as const,
  byMaterial: (materialId: number) => [...materialReservationKeys.all, 'byMaterial', materialId] as const,
  availability: (materialId: number) => [...materialReservationKeys.all, 'availability', materialId] as const,
};

// Хуки для получения данных
export const useMaterialReservations = () => {
  return useQuery({
    queryKey: materialReservationKeys.lists(),
    queryFn: materialReservationApi.getAllReservations,
    staleTime: 5 * 60 * 1000, // 5 минут
  });
};

export const useMaterialReservationsByMaterial = (materialId: number) => {
  return useQuery({
    queryKey: materialReservationKeys.byMaterial(materialId),
    queryFn: () => materialReservationApi.getReservationsByMaterial(materialId),
    enabled: !!materialId,
    staleTime: 2 * 60 * 1000, // 2 минуты
  });
};

export const useMaterialAvailability = (materialId: number) => {
  return useQuery({
    queryKey: materialReservationKeys.availability(materialId),
    queryFn: () => materialReservationApi.getAvailableQuantity(materialId),
    enabled: !!materialId,
    staleTime: 1 * 60 * 1000, // 1 минута
  });
};

// Хуки для мутаций
export const useCreateMaterialReservation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateMaterialReservationRequest) => 
      materialReservationApi.createReservation(data),
    onSuccess: (data) => {
      console.log('✅ [useCreateMaterialReservation] Created reservation:', data.id);
      
      // Обновляем кэш
      queryClient.invalidateQueries({ queryKey: materialReservationKeys.lists() });
      queryClient.invalidateQueries({ queryKey: materialReservationKeys.byMaterial(data.material_id) });
      queryClient.invalidateQueries({ queryKey: materialReservationKeys.availability(data.material_id) });
      
      // Обновляем материалы
      queryClient.invalidateQueries({ queryKey: ['materials'] });
    },
    onError: (error) => {
      console.error('❌ [useCreateMaterialReservation] Error:', error);
    },
  });
};

export const useUpdateMaterialReservation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateMaterialReservationRequest }) => 
      materialReservationApi.updateReservation(id, data),
    onSuccess: (data) => {
      console.log('✅ [useUpdateMaterialReservation] Updated reservation:', data.id);
      
      // Обновляем кэш
      queryClient.invalidateQueries({ queryKey: materialReservationKeys.lists() });
      queryClient.invalidateQueries({ queryKey: materialReservationKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: materialReservationKeys.byMaterial(data.material_id) });
      queryClient.invalidateQueries({ queryKey: materialReservationKeys.availability(data.material_id) });
      
      // Обновляем материалы
      queryClient.invalidateQueries({ queryKey: ['materials'] });
    },
    onError: (error) => {
      console.error('❌ [useUpdateMaterialReservation] Error:', error);
    },
  });
};

export const useCancelMaterialReservation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) => 
      materialReservationApi.cancelReservation(id, reason),
    onSuccess: (_, variables) => {
      console.log('✅ [useCancelMaterialReservation] Cancelled reservation:', variables.id);
      
      // Обновляем кэш
      queryClient.invalidateQueries({ queryKey: materialReservationKeys.lists() });
      queryClient.invalidateQueries({ queryKey: materialReservationKeys.detail(variables.id) });
      
      // Обновляем материалы
      queryClient.invalidateQueries({ queryKey: ['materials'] });
    },
    onError: (error) => {
      console.error('❌ [useCancelMaterialReservation] Error:', error);
    },
  });
};

export const useFulfillMaterialReservation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => materialReservationApi.fulfillReservation(id),
    onSuccess: (_, id) => {
      console.log('✅ [useFulfillMaterialReservation] Fulfilled reservation:', id);
      
      // Обновляем кэш
      queryClient.invalidateQueries({ queryKey: materialReservationKeys.lists() });
      queryClient.invalidateQueries({ queryKey: materialReservationKeys.detail(id) });
      
      // Обновляем материалы
      queryClient.invalidateQueries({ queryKey: ['materials'] });
    },
    onError: (error) => {
      console.error('❌ [useFulfillMaterialReservation] Error:', error);
    },
  });
};

export const useCleanupExpiredReservations = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => materialReservationApi.cleanupExpiredReservations(),
    onSuccess: (data) => {
      console.log('✅ [useCleanupExpiredReservations] Cleaned up:', data.expired_count, 'expired reservations');
      
      // Обновляем кэш
      queryClient.invalidateQueries({ queryKey: materialReservationKeys.lists() });
      
      // Обновляем материалы
      queryClient.invalidateQueries({ queryKey: ['materials'] });
    },
    onError: (error) => {
      console.error('❌ [useCleanupExpiredReservations] Error:', error);
    },
  });
};

