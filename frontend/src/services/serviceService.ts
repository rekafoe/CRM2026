// import { apiClient } from '../api/client';

// export interface ServicePrice {
//   id: number;
//   service_name: string;
//   price_per_unit: number;
//   unit: string;
//   is_active: boolean;
//   created_at: string;
//   updated_at: string;
// }

// export const getServicePrices = async (): Promise<ServicePrice[]> => {
//   try {
//     const response = await apiClient.get('/services');
//     return (response.data as any)?.data || response.data || [];
//   } catch (error) {
//     console.error('Ошибка загрузки услуг:', error);
//     throw error;
//   }
// };

// export const getServicePrice = async (serviceId: number): Promise<ServicePrice> => {
//   try {
//     const response = await apiClient.get(`/services/${serviceId}`);
//     return (response.data as any)?.data || response.data;
//   } catch (error) {
//     console.error('Ошибка загрузки услуги:', error);
//     throw error;
//   }
// };
