import React from 'react';
import { PricingService } from '../../../../types/pricing';
import ServicesTable from './ServicesTable';

export interface ServiceCategoryTableSectionProps {
  sectionKey: string;
  label: string;
  count: number;
  isOpen: boolean;
  onToggle: (key: string) => void;
  panelIdFor: (key: string) => string;
  services: PricingService[];
  expandedServiceId: number | null | undefined;
  renderExpandedRow: (service: PricingService) => React.ReactNode;
  getServiceIcon: (type: string) => React.ReactNode;
  getServiceTypeLabel: (type: string) => string;
  getUnitLabel: (unit: string) => string;
  renderActions: (service: PricingService) => React.ReactNode;
}

/**
 * Секция списка услуг: заголовок-кнопка + таблица (по раскрытию).
 */
export const ServiceCategoryTableSection: React.FC<ServiceCategoryTableSectionProps> = ({
  sectionKey,
  label,
  count,
  isOpen,
  onToggle,
  panelIdFor,
  services,
  expandedServiceId,
  renderExpandedRow,
  getServiceIcon,
  getServiceTypeLabel,
  getUnitLabel,
  renderActions,
}) => {
  const labelId = `${panelIdFor(sectionKey)}-label`;
  const regionId = panelIdFor(sectionKey);

  const countLabel = (() => {
    const n = count;
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return `${n} услуга`;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} услуги`;
    return `${n} услуг`;
  })();

  return (
    <div
      className={
        isOpen
          ? 'services-category-group services-category-group--open'
          : 'services-category-group'
      }
    >
      <button
        type="button"
        id={labelId}
        className="services-category-group__toggle"
        aria-expanded={isOpen}
        aria-controls={regionId}
        aria-label={`${label}, ${countLabel}. ${isOpen ? 'Свернуть' : 'Показать список'}`}
        onClick={() => onToggle(sectionKey)}
      >
        <span className="services-category-group__lead" aria-hidden>
          <span
            className={
              isOpen
                ? 'services-category-group__chevr services-category-group__chevr--open'
                : 'services-category-group__chevr'
            }
          />
        </span>
        <span className="services-category-group__text">
          <span className="services-category-group__label">{label}</span>
          <span className="services-category-group__hint">
            {isOpen ? 'Свернуть раздел' : 'Показать таблицу и действия'}
          </span>
        </span>
        <span className="services-category-group__count" title={countLabel}>
          {count}
        </span>
      </button>
      {isOpen && (
        <div
          id={regionId}
          className="services-category-group__panel"
          role="region"
          aria-labelledby={labelId}
        >
          <ServicesTable
            services={services}
            renderActions={renderActions}
            expandedServiceId={expandedServiceId}
            renderExpandedRow={renderExpandedRow}
            getServiceIcon={getServiceIcon}
            getServiceTypeLabel={getServiceTypeLabel}
            getUnitLabel={getUnitLabel}
          />
        </div>
      )}
    </div>
  );
};

export default ServiceCategoryTableSection;
