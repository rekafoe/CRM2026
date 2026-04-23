import React from 'react';
import { Material } from '../../../types/shared';
import { materialPriceSecondaryLabel } from '../../../utils/materialPriceLabels';
import { WarehouseButton } from '../common/WarehouseButton';
import { StatusBadge } from '../../common/StatusBadge';
import { AppIcon } from '../../ui/AppIcon';

interface MaterialRowCardProps {
  material: Material;
  isSelected: boolean;
  onSelect: (id: number) => void;
  onEdit: (material: Material) => void;
  onDelete: (material: Material) => void;
  onReserve: (material: Material) => void;
}

export const MaterialRowCard: React.FC<MaterialRowCardProps> = ({
  material,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onReserve,
}) => {
  const getStockStatus = (quantity: number, minStock: number) => {
    if (quantity <= 0) return { status: 'Нет в наличии', type: 'error' as const };
    if (quantity <= minStock) return { status: 'Низкий запас', type: 'warning' as const };
    return { status: 'В наличии', type: 'success' as const };
  };

  const stockInfo = getStockStatus(material.quantity || 0, material.min_stock_level || 10);
  const availableQuantity = (material.quantity || 0) - (material.reserved_quantity || 0);

  return (
    <div className={`material-row-card ${isSelected ? 'selected' : ''}`}>
      {/* Checkbox Column */}
      <div className="row-column checkbox-column">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(material.id)}
          className="material-checkbox"
        />
      </div>

      {/* Name Column */}
      <div className="row-column name-column">
        <div className="material-info">
          <div className="material-name font-bold">{material.name}</div>
          <div className="material-description text-sm text-text-secondary">
            {material.description || 'Без описания'}
          </div>
        </div>
      </div>

      {/* Category Column */}
      <div className="row-column category-column">
        <div className="category-info">
          <div className="text-sm font-medium">{(material as any).category_name || 'Без категории'}</div>
          {(material as any).supplier_name && (
            <div className="text-xs text-text-secondary">{(material as any).supplier_name}</div>
          )}
        </div>
      </div>

      {/* Quantity Column */}
      <div className="row-column quantity-column">
        <div className="quantity-info">
          <div className="text-sm">Доступно: {availableQuantity}</div>
          <div className="text-xs text-text-secondary">Всего: {material.quantity || 0}</div>
        </div>
      </div>

      {/* Status Column */}
      <div className="row-column status-column">
        <StatusBadge status={stockInfo.status} />
      </div>

      {/* Price Column */}
      <div className="row-column price-column">
        <div className="price-info">
          <div className="font-bold">{material.sheet_price_single || material.price || 0} BYN</div>
          <div className="text-xs text-text-secondary">{materialPriceSecondaryLabel(material.unit)}</div>
        </div>
      </div>

      {/* Actions Column */}
      <div className="row-column actions-column">
        <div className="material-actions flex gap-1">
          <WarehouseButton
            variant="primary"
            size="sm"
            icon={<AppIcon name="pencil" size="xs" />}
            onClick={() => onEdit(material)}
            className="action-btn"
            title="Редактировать"
          >
            Изменить
          </WarehouseButton>
          <WarehouseButton
            variant="warning"
            size="sm"
            icon={<AppIcon name="box" size="xs" />}
            onClick={() => onReserve(material)}
            className="action-btn"
            title="Резерв / списание"
          >
            Резерв
          </WarehouseButton>
          <WarehouseButton
            variant="danger"
            size="sm"
            icon={<AppIcon name="trash" size="xs" />}
            onClick={() => onDelete(material)}
            className="action-btn"
            title="Удалить"
          >
            Удалить
          </WarehouseButton>
        </div>
      </div>
    </div>
  );
};
