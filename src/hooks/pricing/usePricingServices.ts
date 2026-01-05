import { useCallback, useEffect, useState } from 'react';
import { PricingService } from '../../types/pricing';
import { getPricingServices } from '../../services/pricing';

export interface UsePricingServicesResult {
  services: PricingService[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setServices: React.Dispatch<React.SetStateAction<PricingService[]>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

export function usePricingServices(autoLoad: boolean = true): UsePricingServicesResult {
  const [services, setServices] = useState<PricingService[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await getPricingServices();
      setServices(list);
    } catch (err: any) {
      console.error('Failed to load pricing services', err);
      setError(err?.message || 'Не удалось загрузить услуги');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoLoad) {
      void reload();
    }
  }, [autoLoad, reload]);

  return {
    services,
    loading,
    error,
    reload,
    setServices,
    setError,
  };
}

export default usePricingServices;


