import React from 'react';
import { Material } from '../../../types/shared';
import { materialPriceSecondaryLabel, materialSellPriceSecondaryLabel } from '../../../utils/materialPriceLabels';
import { formatRollStockLabel, isRollMaterial } from '../../../utils/materialRollLabels';
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
  const categoryLabel = (material as any).category_name || 'Без категории';
  const typeLabel = (material as any).material_type_name || 'Без типа';
  const kindLabelMap: Record<string, string> = {
    sheet: 'Листовой',
    roll: 'Рулонный',
    consumable: 'Расходка',
    area: 'Площадной',
  };
  const kindLabel = kindLabelMap[String((material as any).material_kind || '')] || '—';
  const hasPurchasePrice = material.purchase_price != null && Number.isFinite(Number(material.purchase_price));
  const sellPrice = material.sheet_price_single ?? material.price;
  const supplierLabel = (material as any).supplier_name || 'Не указан';

  return (
    <div className={`material-card ${isSelected ? 'selected' : ''}`}>
      <div className="material-card-header">
        <label className="material-card-select">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onSelect(material.id)}
            className="material-checkbox"
            aria-label={`Выбрать ${material.name}`}
          />
        </label>
        <div className="material-info">
          <h3 className="material-name">{material.name}</h3>
          {material.description ? (
            <p className="material-description">{material.description}</p>
          ) : null}
        </div>
        <StatusBadge
          status={stockInfo.status}
          color={stockInfo.type}
          className="material-card-status"
        />
      </div>

      <div className="material-card-body">
        <dl className="material-details">
          <div className="detail-item">
            <dt className="detail-label">Категория</dt>
            <dd className="detail-value">{categoryLabel}</dd>
          </div>
          <div className="detail-item">
            <dt className="detail-label">Тип</dt>
            <dd className="detail-value">{typeLabel}</dd>
          </div>
          <div className="detail-item">
            <dt className="detail-label">Класс</dt>
            <dd className="detail-value">{kindLabel}</dd>
          </div>
          <div className="detail-item">
            <dt className="detail-label">Поставщик</dt>
            <dd className="detail-value" title={supplierLabel}>{supplierLabel}</dd>
          </div>
          <div className="detail-item detail-item--stock">
            <dt className="detail-label">Доступно</dt>
            <dd className="detail-value detail-value--strong">{stockAvailableLabel}</dd>
          </div>
          <div className="detail-item detail-item--stock">
            <dt className="detail-label">{isRoll ? 'Намотка' : 'Всего'}</dt>
            <dd className="detail-value">{stockTotalLabel}</dd>
          </div>
        </dl>

        <div className="material-price">
          <div className="price-main">
            {hasPurchasePrice ? (
              <>
                {Number(material.purchase_price)} <BynSymbol />
              </>
            ) : (
              '—'
            )}
          </div>
          <div className="price-label">
            {hasPurchasePrice
              ? materialPriceSecondaryLabel(material.unit)
              : 'закуп не указана'}
          </div>
          {sellPrice != null && Number.isFinite(Number(sellPrice)) && (
            <div className="price-label price-label--sell">
              {Number(sellPrice)} <BynSymbol /> · {materialSellPriceSecondaryLabel(material.unit)}
            </div>
          )}
        </div>
      </div>

      <div className="material-actions">
        <WarehouseButton
          variant="primary"
          size="sm"
          icon={<AppIcon name="pencil" size="sm" />}
          onClick={() => onEdit(material)}
          className="icon-only"
          title="Редактировать"
        />
        <WarehouseButton
          variant="warning"
          size="sm"
          icon={<AppIcon name="reserve" size="sm" />}
          onClick={() => onReserve(material)}
          className="icon-only"
          title="Резерв / списание"
        />
        <WarehouseButton
          variant="danger"
          size="sm"
          icon={<AppIcon name="trash" size="sm" />}
          onClick={() => onDelete(material)}
          className="icon-only"
          title="Удалить"
        />
      </div>
    </div>
  );
};
