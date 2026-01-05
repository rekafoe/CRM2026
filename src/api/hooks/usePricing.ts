import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../client';
import { ENDPOINTS } from '../endpoints';
import { CalculatePriceRequest, CalculatePriceResponse } from '../api/types';

// Query keys
export const pricingKeys = {
  all: ['pricing'] as const,
  basePrices: () => [...pricingKeys.all, 'base-prices'] as const,
  multipliers: () => [...pricingKeys.all, 'multipliers'] as const,
  volumeDiscounts: () => [...pricingKeys.all, 'volume-discounts'] as const,
  loyaltyDiscounts: () => [...pricingKeys.all, 'loyalty-discounts'] as const,
};

// Получение базовых цен
export const useBasePrices = () => {
  return useQuery({
    queryKey: pricingKeys.basePrices(),
    queryFn: async () => {
      const response = await api.get(ENDPOINTS.CALCULATOR.BASE_PRICES);
      return response.data;
    },
    staleTime: 30 * 60 * 1000, // 30 минут
  });
};

// Получение множителей ценообразования
export const usePricingMultipliers = () => {
  return useQuery({
    queryKey: pricingKeys.multipliers(),
    queryFn: async () => {
      const response = await api.get(ENDPOINTS.CALCULATOR.MULTIPLIERS);
      return response.data;
    },
    staleTime: 30 * 60 * 1000, // 30 минут
  });
};

// Получение объемных скидок
export const useVolumeDiscounts = () => {
  return useQuery({
    queryKey: pricingKeys.volumeDiscounts(),
    queryFn: async () => {
      const response = await api.get(ENDPOINTS.CALCULATOR.VOLUME_DISCOUNTS);
      return response.data;
    },
    staleTime: 30 * 60 * 1000, // 30 минут
  });
};

// Получение скидок по лояльности
export const useLoyaltyDiscounts = () => {
  return useQuery({
    queryKey: pricingKeys.loyaltyDiscounts(),
    queryFn: async () => {
      const response = await api.get(ENDPOINTS.CALCULATOR.LOYALTY_DISCOUNTS);
      return response.data;
    },
    staleTime: 30 * 60 * 1000, // 30 минут
  });
};

// Расчет цены
export const useCalculatePrice = () => {
  return useMutation({
    mutationFn: async (data: CalculatePriceRequest) => {
      const response = await api.post<CalculatePriceResponse>(ENDPOINTS.CALCULATOR.CALCULATE, data);
      return response.data;
    },
  });
};
