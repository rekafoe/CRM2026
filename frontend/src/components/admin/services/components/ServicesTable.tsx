import React, { Fragment } from 'react';
import { PricingService } from '../../../../types/pricing';
import { Button, StatusBadge } from '../../../common';

const defaultGetServiceIcon = (type: string) => {
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

const defaultGetServiceTypeLabel = (type: string) => {
  switch (type) {
    case 'print':
      return 'Печать';
    case 'postprint':
      return 'Послепечатные';
    case 'other':
      return 'Прочее';
    case 'generic':
      return 'Общее';
    default:
      return type;
  }
};

const defaultGetUnitLabel = (unit: string) => {
  switch (unit) {
    case 'item':
      return 'шт';
    case 'sheet':
      return 'лист';
    case 'hour':
      return 'час';
    case 'm2':
      return 'м²';
    case 'click':
      return 'клик';
    default:
      return unit;
  }
};

interface ServicesTableProps {
  services: PricingService[];
  renderActions?: (service: PricingService) => React.ReactNode;
  expandedServiceId?: number | null;
  renderExpandedRow?: (service: PricingService) => React.ReactNode;
  getServiceIcon?: (type: string) => React.ReactNode;
  getServiceTypeLabel?: (type: string) => string;
  getUnitLabel?: (unit: string) => string;
  onEdit?: (service: PricingService) => void;
  onToggleActive?: (service: PricingService) => void;
  onDelete?: (service: PricingService) => void;
  showActionsColumn?: boolean;
}

const ServicesTable: React.FC<ServicesTableProps> = ({
  services,
  renderActions,
  expandedServiceId = null,
  renderExpandedRow,
  getServiceIcon = defaultGetServiceIcon,
  getServiceTypeLabel = defaultGetServiceTypeLabel,
  getUnitLabel = defaultGetUnitLabel,
  onEdit,
  onToggleActive,
  onDelete,
  showActionsColumn = true,
}) => {
  const hasExternalActions = Boolean(renderActions || onEdit || onToggleActive || onDelete);

  const renderDefaultActions = (service: PricingService) => {
    if (!hasExternalActions) return null;
    return (
      <div className="services-table__actions">
        {onEdit && (
          <Button variant="info" size="sm" onClick={() => onEdit(service)}>
            ✏️ Редактировать
          </Button>
        )}
        {onToggleActive && (
          <Button variant="warning" size="sm" onClick={() => onToggleActive(service)}>
            {service.isActive ? '⏸️ Деактивировать' : '▶️ Активировать'}
          </Button>
        )}
        {onDelete && (
          <Button variant="error" size="sm" onClick={() => onDelete(service)}>
            🗑️
          </Button>
        )}
      </div>
    );
  };

  const renderActionCell = (service: PricingService) => {
    if (!showActionsColumn) return null;
    if (renderActions) return renderActions(service);
    return renderDefaultActions(service);
  };

  const actionColumnVisible = showActionsColumn && (renderActions || onEdit || onToggleActive || onDelete);

  return (
    <table className="services-table">
      <thead className="services-table__head">
        <tr>
          <th>Услуга</th>
          <th>Тип</th>
          <th>Единица</th>
          <th>Цена</th>
          <th>Статус</th>
          {actionColumnVisible && (
            <th>Действия</th>
          )}
        </tr>
      </thead>
      <tbody className="services-table__body">
        {services.map((service) => (
          <Fragment key={service.id}>
            <tr>
              <td>
                <div className="services-table__service-cell">
                  <span className="services-table__service-icon">{getServiceIcon(service.type)}</span>
                  <span className="services-table__service-name">{service.name}</span>
                </div>
              </td>
              <td>
                <span className="services-table__type-badge">{getServiceTypeLabel(service.type)}</span>
              </td>
              <td>
                <span>{getUnitLabel(service.unit)}</span>
              </td>
              <td>
                <span className="services-table__price">{(service.rate ?? 0).toFixed(2)} BYN</span>
              </td>
              <td>
                <StatusBadge status={service.isActive ? 'Активна' : 'Неактивна'} color={service.isActive ? 'success' : 'error'} size="sm" />
              </td>
              {actionColumnVisible && (
                <td className="services-table__actions-cell">
                  {renderActionCell(service)}
                </td>
              )}
            </tr>
            {renderExpandedRow && expandedServiceId === service.id && (
              <tr>
                <td colSpan={actionColumnVisible ? 6 : 5}>
                  {renderExpandedRow(service)}
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
};

export default ServicesTable;


