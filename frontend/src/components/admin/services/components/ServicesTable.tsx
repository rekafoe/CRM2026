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
      <div className="flex gap-2 justify-end">
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
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Услуга</th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Тип</th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Единица</th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Цена</th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
          {actionColumnVisible && (
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Действия</th>
          )}
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {services.map((service) => (
          <Fragment key={service.id}>
            <tr className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{getServiceIcon(service.type)}</span>
                  <span className="font-medium text-gray-900">{service.name}</span>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className="text-sm text-gray-600">{getServiceTypeLabel(service.type)}</span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className="text-sm text-gray-900">{getUnitLabel(service.unit)}</span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className="font-semibold text-blue-600">{(service.rate ?? 0).toFixed(2)} BYN</span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <StatusBadge status={service.isActive ? 'Активна' : 'Неактивна'} color={service.isActive ? 'success' : 'error'} size="sm" />
              </td>
              {actionColumnVisible && (
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  {renderActionCell(service)}
                </td>
              )}
            </tr>
            {renderExpandedRow && expandedServiceId === service.id && (
              <tr>
                <td colSpan={actionColumnVisible ? 6 : 5} className="bg-gray-50 px-6 py-4">
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


