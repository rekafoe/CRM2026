import { useEffect, useState } from 'react';
import { api } from '../../../api';
import type { ServiceRow, BindingServiceRow } from '../components/SimplifiedTemplateSection';

interface UseTemplatePricingServicesResult {
  simplifiedServices: ServiceRow[];
  bindingServices: BindingServiceRow[];
}

export function useTemplatePricingServices(
  calculatorType: string | undefined
): UseTemplatePricingServicesResult {
  const [simplifiedServices, setSimplifiedServices] = useState<ServiceRow[]>([]);
  const [bindingServices, setBindingServices] = useState<BindingServiceRow[]>([]);

  useEffect(() => {
    if (calculatorType !== 'simplified') {
      setSimplifiedServices([]);
      setBindingServices([]);
      return;
    }

    let cancelled = false;

    Promise.all([api.get('/pricing/services'), api.get('/pricing/bindings')])
      .then(([servicesResp, bindingsResp]) => {
        if (cancelled) return;

        const servicesData = (servicesResp.data as any)?.data ?? servicesResp.data ?? [];
        const allServices = Array.isArray(servicesData) ? servicesData : [];
        const excludedTypes = new Set(['print', 'printing']);

        const filteredServices: ServiceRow[] = allServices.filter((service: any) => {
          if (!service || !service.id || !service.name) return false;
          const operationType = String(
            service.operation_type ??
              service.operationType ??
              service.type ??
              service.service_type ??
              ''
          ).toLowerCase();
          if (!operationType) return true;
          return !excludedTypes.has(operationType);
        });

        const bindingsData = (bindingsResp.data as any)?.data ?? bindingsResp.data ?? [];
        const bindings: BindingServiceRow[] = Array.isArray(bindingsData) ? bindingsData : [];

        setSimplifiedServices(filteredServices);
        setBindingServices(bindings);
      })
      .catch((error) => {
        console.error('Ошибка загрузки услуг шаблона:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [calculatorType]);

  return {
    simplifiedServices,
    bindingServices,
  };
}

