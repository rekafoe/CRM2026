import React, { useMemo } from 'react';
import { Button, Alert, StatusBadge } from '../../../components/common';
import { ProductServiceLink } from '../../../services/products';
import { PricingService } from '../../../types/pricing';

interface ServicesTabProps {
  productServicesLinks: ProductServiceLink[];
  availableServices: PricingService[];
  servicesLoading: boolean;
  servicesError: string | null;
  serviceAction: { id: number; mode: 'add' | 'remove' } | null;
  onAddService: (serviceId: number) => void;
  onRemoveService: (serviceId: number) => void;
  onOpenAddModal: () => void;
}

const getServiceIcon = (type: string) => {
  switch (type) {
    case 'print':
      return '🖨️';
    case 'postprint':
      return '✂️';
    case 'other':
      return '⚙️';
    default:
      return '📋';
  }
};

const getServiceTypeLabel = (type: string) => {
  switch (type) {
    case 'print':
      return 'Печать';
    case 'postprint':
      return 'Послепечатные';
    case 'other':
      return 'Прочее';
    case 'generic':
      return 'Общие';
    default:
      return type;
  }
};

export const ServicesTab: React.FC<ServicesTabProps> = React.memo(({
  productServicesLinks,
  availableServices,
  servicesLoading,
  servicesError,
  serviceAction,
  onAddService,
  onRemoveService,
  onOpenAddModal,
}) => {
  const assignedServiceIds = useMemo(
    () => new Set(productServicesLinks.map((svc) => svc.service_id)),
    [productServicesLinks]
  );

  const availableToAdd = useMemo(() => {
    const list = availableServices.filter((svc) => !assignedServiceIds.has(svc.id));
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [availableServices, assignedServiceIds]);

  return (
    <div className="product-tab-panel">
      <div className="product-tab-header">
        <div>
          <h4>Подключенные услуги</h4>
          <p>Назначьте услуги, чтобы использовать их в расчётах и шаблонах продукта.</p>
        </div>
        <Button
          variant="primary"
          onClick={onOpenAddModal}
          disabled={servicesLoading || availableToAdd.length === 0}
        >
          + Добавить услугу
        </Button>
      </div>

      {servicesError && <Alert type="error">{servicesError}</Alert>}

      {servicesLoading ? (
        <div className="product-empty">
          <p>Загружаем услуги…</p>
        </div>
      ) : productServicesLinks.length > 0 ? (
        <div className="product-services-table-wrapper">
          <table className="product-services-table">
            <thead>
              <tr>
                <th>Услуга</th>
                <th>Тип</th>
                <th>Цена</th>
                <th>Ед.</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {productServicesLinks.map((svc) => {
                const removing = serviceAction?.id === svc.service_id && serviceAction.mode === 'remove';
                return (
                  <tr key={svc.service_id}>
                    <td>
                      <div className="service-cell">
                        <span className="service-icon">{getServiceIcon(svc.service_type)}</span>
                        <div>
                          <div className="service-title">{svc.service_name}</div>
                          {svc.default_quantity !== undefined && (
                            <div className="service-sub">Кол-во по умолчанию: {svc.default_quantity}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>{getServiceTypeLabel(svc.service_type)}</td>
                    <td>{svc.price_per_unit.toFixed(2)} BYN</td>
                    <td>{svc.unit || '—'}</td>
                    <td>
                      <StatusBadge
                        status={svc.is_active ? 'Активна' : 'Неактивна'}
                        color={svc.is_active ? 'success' : 'error'}
                        size="sm"
                      />
                    </td>
                    <td className="product-services-actions">
                      <Button
                        variant="error"
                        size="sm"
                        onClick={() => onRemoveService(svc.service_id)}
                        disabled={removing}
                      >
                        {removing ? 'Удаление…' : 'Удалить'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="product-empty">
          <p>Услуги ещё не назначены. Добавьте первую услугу, чтобы использовать её в шаблоне продукта.</p>
          <Button
            variant="primary"
            onClick={onOpenAddModal}
            disabled={availableToAdd.length === 0}
          >
            Добавить услугу
          </Button>
        </div>
      )}
    </div>
  );
});

ServicesTab.displayName = 'ServicesTab';

