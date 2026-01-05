import React, { useState, useMemo } from 'react';
import { Modal, Button } from '../../../components/common';
import { PricingService } from '../../../types/pricing';

interface AddServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableServices: PricingService[];
  assignedServiceIds: Set<number>;
  serviceAction: { id: number; mode: 'add' | 'remove' } | null;
  onAddService: (serviceId: number) => void;
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

export const AddServiceModal: React.FC<AddServiceModalProps> = React.memo(({
  isOpen,
  onClose,
  availableServices,
  assignedServiceIds,
  serviceAction,
  onAddService,
}) => {
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>('all');

  const availableTypes = useMemo(() => {
    const types = availableServices.map((svc) => svc.type).filter(Boolean);
    return Array.from(new Set(types)).sort();
  }, [availableServices]);

  const filteredAvailable = useMemo(() => {
    return availableServices.filter((svc) => {
      const matchesSearch = serviceSearch
        ? `${svc.name} ${svc.type}`.toLowerCase().includes(serviceSearch.toLowerCase())
        : true;
      const matchesType = serviceTypeFilter === 'all' || svc.type === serviceTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [availableServices, serviceSearch, serviceTypeFilter]);

  const availableToAdd = useMemo(() => {
    const list = filteredAvailable.filter((svc) => !assignedServiceIds.has(svc.id));
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredAvailable, assignedServiceIds]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Добавить услугу"
      size="lg"
    >
      <div className="service-modal">
        <div className="service-filters">
          <input
            className="form-input service-search"
            placeholder="Поиск по названию…"
            value={serviceSearch}
            onChange={(e) => setServiceSearch(e.target.value)}
          />
          <select
            className="form-select service-filter"
            value={serviceTypeFilter}
            onChange={(e) => setServiceTypeFilter(e.target.value)}
          >
            <option value="all">Все типы</option>
            {availableTypes.map((type) => (
              <option key={type} value={type}>{getServiceTypeLabel(type)}</option>
            ))}
          </select>
        </div>

        {availableToAdd.length > 0 ? (
          <div className="product-services-table-wrapper service-modal__list">
            <table className="product-services-table">
              <thead>
                <tr>
                  <th>Услуга</th>
                  <th>Тип</th>
                  <th>Цена</th>
                  <th>Ед.</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {availableToAdd.map((svc) => {
                  const adding = serviceAction?.id === svc.id && serviceAction.mode === 'add';
                  return (
                    <tr key={svc.id}>
                      <td>
                        <div className="service-cell">
                          <span className="service-icon">{getServiceIcon(svc.type)}</span>
                          <div>
                            <div className="service-title">{svc.name}</div>
                            <div className="service-sub">{getServiceTypeLabel(svc.type)}</div>
                          </div>
                        </div>
                      </td>
                      <td>{getServiceTypeLabel(svc.type)}</td>
                      <td>{svc.rate.toFixed(2)} BYN</td>
                      <td>{svc.unit || '—'}</td>
                      <td className="product-services-actions">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => onAddService(svc.id)}
                          disabled={adding}
                        >
                          {adding ? 'Добавление…' : 'Добавить'}
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
            <p>Нет услуг, подходящих под фильтр. Измените условия поиска.</p>
          </div>
        )}

        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>Закрыть</Button>
        </div>
      </div>
    </Modal>
  );
});

AddServiceModal.displayName = 'AddServiceModal';

