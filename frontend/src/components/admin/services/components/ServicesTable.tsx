import React, { Fragment } from 'react';
import { PricingService } from '../../../../types/pricing';
import { Button, StatusBadge } from '../../../common';
import { MoneyAmount } from '../../../ui';
import { bindingRunSubtitle, bindingUnitNote, bindingUnitShortLabel } from '../utils/bindingCopy';

const defaultGetServiceIcon = (type: string) => {
  switch (type) {
    case 'print':
      return '';
    case 'postprint':
      return '';
    case 'other':
      return '';
    default:
      return '';
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
    case 'шт':
    case 'per_item':
      return 'шт';
    case 'sheet':
    case 'лист':
    case 'per_sheet':
      return 'лист';
    case 'hour':
    case 'час':
    case 'per_hour':
      return 'час';
    case 'm2':
    case 'м2':
    case 'м²':
    case 'per_m2':
      return 'кв. метры';
    case 'click':
      return 'клик';
    case 'per_cut':
      return 'за рез';
    case 'per_meter':
      return 'пог. м';
    case 'fixed':
      return 'фикс.';
    case 'per_order':
      return 'заказ';
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
  layout?: 'default' | 'binding';
  materialNameOf?: (service: PricingService) => string | null;
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
  layout = 'default',
  materialNameOf,
}) => {
  const hasExternalActions = Boolean(renderActions || onEdit || onToggleActive || onDelete);

  const renderDefaultActions = (service: PricingService) => {
    if (!hasExternalActions) return null;
    return (
      <div className="services-table__actions">
        {onEdit && (
          <Button variant="secondary" size="sm" onClick={() => onEdit(service)} title="Редактировать услугу">
             Редактировать
          </Button>
        )}
        {onToggleActive && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onToggleActive(service)}
            title={service.isActive ? 'Деактивировать' : 'Активировать'}
          >
            {service.isActive ? 'Деактивировать' : 'Активировать'}
          </Button>
        )}
        {onDelete && (
          <Button variant="error" size="sm" onClick={() => onDelete(service)}>
            Удалить
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
  const bindingLayout = layout === 'binding';
  const columnCount = (bindingLayout ? 4 : 5) + (actionColumnVisible ? 1 : 0);

  return (
    <table className="services-table">
      <thead className="services-table__head">
        <tr>
          <th>Услуга</th>
          {!bindingLayout && <th>Тип</th>}
          <th>Единица</th>
          <th>Цена</th>
          <th>Статус</th>
          {actionColumnVisible && (
            <th>Действия</th>
          )}
        </tr>
      </thead>
      <tbody className="services-table__body">
        {services.map((service) => {
          const unitSource = service.priceUnit || service.unit;
          const unitNote = bindingLayout ? bindingUnitNote(unitSource) : null;
          return (
          <Fragment key={service.id}>
            <tr>
              <td>
                <div className="services-table__service-cell">
                  {!bindingLayout && (
                    <span className="services-table__service-icon">{getServiceIcon(service.type)}</span>
                  )}
                  <span className="services-table__service-name">
                    {service.name}
                    {bindingLayout && (
                      <span className="services-table__service-sub">
                        {bindingRunSubtitle(service.minQuantity, service.maxQuantity, materialNameOf?.(service))}
                      </span>
                    )}
                  </span>
                </div>
              </td>
              {!bindingLayout && (
              <td>
                <span className="services-table__type-badge">{getServiceTypeLabel(service.type)}</span>
              </td>
              )}
              <td>
                {bindingLayout ? (
                  <span className="services-table__unit">
                    {bindingUnitShortLabel(unitSource)}
                    {unitNote && <span className="services-table__unit-note">{unitNote}</span>}
                  </span>
                ) : (
                  <span>{getUnitLabel(service.unit)}</span>
                )}
              </td>
              <td>
                <MoneyAmount className="services-table__price" value={service.rate ?? 0} />
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
                <td colSpan={columnCount}>
                  {renderExpandedRow(service)}
                </td>
              </tr>
            )}
          </Fragment>
          );
        })}
      </tbody>
    </table>
  );
};

export default ServicesTable;


