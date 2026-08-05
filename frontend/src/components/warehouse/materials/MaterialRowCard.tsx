import React from 'react';
import { Material } from '../../../types/shared';
import { materialPriceSecondaryLabel, materialSellPriceSecondaryLabel } from '../../../utils/materialPriceLabels';
import { formatRollStockLabel, isRollMaterial } from '../../../utils/materialRollLabels';
import { WarehouseButton } from '../common/WarehouseButton';
import { StatusBadge } from '../../common/StatusBadge';
import { AppIcon } from '../../ui/AppIcon';
import { BynSymbol } from '../../ui/BynSymbol';

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
  const isRoll = isRollMaterial(material as any);
  const stockTotalLabel = isRoll
    ? formatRollStockLabel(material as any)
    : String(material.quantity || 0);
  const stockAvailableLabel = isRoll
    ? formatRollStockLabel({
        sheet_width: (material as any).sheet_width,
        quantity: availableQuantity,
      })
    : String(availableQuantity);
  const kindLabelMap: Record<string, string> = {
    sheet: 'Листовой',
    roll: 'Рулонный',
    consumable: 'Расходка',
    area: 'Площадной',
  };
  const kindLabel = kindLabelMap[String((material as any).material_kind || '')] || '—';
  const hasPurchasePrice = material.purchase_price != null && Number.isFinite(Number(material.purchase_price));
  const sellPrice = material.sheet_price_single ?? material.price;

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
          <div className="text-xs text-text-secondary">
            {(material as any).material_type_name || 'Без типа'} · {kindLabel}
          </div>
          {(material as any).supplier_name && (
            <div className="text-xs text-text-secondary">{(material as any).supplier_name}</div>
          )}
        </div>
      </div>

      {/* Quantity / roll winding Column */}
      <div className="row-column quantity-column">
        <div className="quantity-info">
          <div className="text-sm">
            {isRoll ? `Остаток: ${stockTotalLabel}` : `Доступно: ${stockAvailableLabel}`}
          </div>
          <div className="text-xs text-text-secondary">
            {isRoll
              ? `Доступно: ${stockAvailableLabel}`
              : `Всего: ${stockTotalLabel}`}
          </div>
        </div>
      </div>

      {/* Status Column */}
      <div className="row-column status-column">
        <StatusBadge status={stockInfo.status} color={stockInfo.type} />
      </div>

      {/* Price Column */}
      <div className="row-column price-column">
        <div className="price-info">
          <div className="font-bold">
            {hasPurchasePrice ? (
              <>
                {Number(material.purchase_price)} <BynSymbol />
              </>
            ) : (
              '—'
            )}
          </div>
          <div className="text-xs text-text-secondary">
            {hasPurchasePrice
              ? materialPriceSecondaryLabel(material.unit)
              : 'закуп не указана'}
          </div>
          {sellPrice != null && Number.isFinite(Number(sellPrice)) && (
            <div className="text-xs text-text-secondary">
              {Number(sellPrice)} <BynSymbol /> · {materialSellPriceSecondaryLabel(material.unit)}
            </div>
          )}
        </div>
      </div>

      {/* Actions Column */}
      <div className="row-column actions-column">
        <div className="material-actions flex gap-1">
          <WarehouseButton
            variant="primary"
            size="sm"
            icon={<AppIcon name="pencil" size="sm" />}
            onClick={() => onEdit(material)}
            className="action-btn"
            title="Редактировать"
          >
            Изменить
          </WarehouseButton>
          <WarehouseButton
            variant="warning"
            size="sm"
            icon={<AppIcon name="reserve" size="sm" />}
            onClick={() => onReserve(material)}
            className="action-btn"
            title="Резерв / списание"
          >
            Резерв
          </WarehouseButton>
          <WarehouseButton
            variant="danger"
            size="sm"
            icon={<AppIcon name="trash" size="sm" />}
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
