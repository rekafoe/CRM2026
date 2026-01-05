import { api } from './client';
import { 
  CreateMaterialReservationRequest, 
  UpdateMaterialReservationRequest, 
  MaterialReservation, 
  MaterialAvailabilityResponse 
} from './types';

export const materialReservationApi = {
  // Создать резервирование
  createReservation: async (data: CreateMaterialReservationRequest): Promise<MaterialReservation> => {
    const response = await api.post('/material-reservations', data);
    return response.data.data;
  },

  // Получить все резервирования
  getAllReservations: async (): Promise<MaterialReservation[]> => {
    const response = await api.get('/material-reservations');
    return response.data.data;
  },

  // Получить резервирования по материалу
  getReservationsByMaterial: async (materialId: number): Promise<MaterialReservation[]> => {
    const response = await api.get(`/material-reservations/material/${materialId}`);
    return response.data.data;
  },

  // Получить доступное количество материала
  getAvailableQuantity: async (materialId: number): Promise<MaterialAvailabilityResponse> => {
    const response = await api.get(`/material-reservations/available/${materialId}`);
    return response.data.data;
  },

  // Обновить резервирование
  updateReservation: async (id: number, data: UpdateMaterialReservationRequest): Promise<MaterialReservation> => {
    const response = await api.put(`/material-reservations/${id}`, data);
    return response.data.data;
  },

  // Отменить резервирование
  cancelReservation: async (id: number, reason?: string): Promise<void> => {
    await api.post(`/material-reservations/${id}/cancel`, { reason });
  },

  // Выполнить резервирование (списать со склада)
  fulfillReservation: async (id: number): Promise<void> => {
    await api.post(`/material-reservations/${id}/fulfill`);
  },

  // Очистить истекшие резервирования
  cleanupExpiredReservations: async (): Promise<{ expired_count: number }> => {
    const response = await api.post('/material-reservations/cleanup/expired');
    return response.data.data;
  }
};

