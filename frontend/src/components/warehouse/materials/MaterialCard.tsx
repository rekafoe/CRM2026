import React from 'react';
import { Material } from '../../../types/shared';
import { materialPriceSecondaryLabel } from '../../../utils/materialPriceLabels';
import { WarehouseButton } from '../common/WarehouseButton';
import { StatusBadge } from '../../common/StatusBadge';
import { AppIcon } from '../../ui/AppIcon';
import { BynSymbol } from '../../ui/BynSymbol';

interface MaterialCardProps {
  material: Material;
  isSelected: boolean;
  onSelect: (id: number) => void;
  onEdit: (material: Material) => void;
  onDelete: (material: Material) => void;
  onReserve: (material: Material) => void;
  viewMode: 'grid' | 'cards';
}

export const MaterialCard: React.FC<MaterialCardProps> = ({
  material,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onReserve,
  viewMode,
}) => {
  const getStockStatus = (quantity: number, minStock: number) => {
    if (quantity <= 0) return { status: 'Нет в наличии', type: 'error' as const };
    if (quantity <= minStock) return { status: 'Низкий запас', type: 'warning' as const };
    return { status: 'В наличии', type: 'success' as const };
  };

  const stockInfo = getStockStatus(material.quantity || 0, material.min_stock_level || 10);
  const availableQuantity = (material.quantity || 0) - (material.reserved_quantity || 0);


  return (
    <div className={`material-card ${isSelected ? 'selected' : ''}`}>
      <div className="material-card-header flex min-w-0 items-start justify-between gap-2 mb-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onSelect(material.id)}
            className="material-checkbox shrink-0"
            aria-label={`Выбрать ${material.name}`}
          />
          <div className="material-info min-w-0">
            <h3 className="material-name">{material.name}</h3>
            <p className="material-description">{material.description || 'Без описания'}</p>
          </div>
        </div>
        <StatusBadge status={stockInfo.status} className="material-card-status shrink-0" />
      </div>

      <div className="material-card-body mb-3">
        <div className="material-details flex flex-col gap-2">
          <div className="detail-item flex justify-between items-center">
            <span className="detail-label text-xs text-text-secondary">Категория:</span>
            <span className="detail-value text-sm font-medium">{(material as any).category_name || 'Без категории'}</span>
          </div>
          <div className="detail-item flex justify-between items-center">
            <span className="detail-label text-xs text-text-secondary">Поставщик:</span>
            <span className="detail-value text-sm">{(material as any).supplier_name || 'Не указан'}</span>
          </div>
          <div className="detail-item flex justify-between items-center">
            <span className="detail-label text-xs text-text-secondary">Доступно:</span>
            <span className="detail-value text-sm font-bold">{availableQuantity}</span>
          </div>
          <div className="detail-item flex justify-between items-center">
            <span className="detail-label text-xs text-text-secondary">Всего:</span>
            <span className="detail-value text-sm">{material.quantity || 0}</span>
          </div>
        </div>

        <div className="material-price mt-3 p-3 bg-tertiary rounded">
          <div className="price-main text-xl font-bold text-primary">
            {material.sheet_price_single || material.price || 0} <BynSymbol />
          </div>
          <div className="price-label text-sm text-text-secondary">{materialPriceSecondaryLabel(material.unit)}</div>
        </div>
      </div>

      <div className="material-actions flex gap-1 justify-end">
        <WarehouseButton
          variant="primary"
          size="sm"
          icon={<AppIcon name="pencil" size="xs" />}
          onClick={() => onEdit(material)}
          className="icon-only"
          title="Редактировать"
        />
        <WarehouseButton
          variant="warning"
          size="sm"
          icon={<AppIcon name="box" size="xs" />}
          onClick={() => onReserve(material)}
          className="icon-only"
          title="Резерв / списание"
        />
        <WarehouseButton
          variant="danger"
          size="sm"
          icon={<AppIcon name="trash" size="xs" />}
          onClick={() => onDelete(material)}
          className="icon-only"
          title="Удалить"
        />
      </div>
    </div>
  );
};
