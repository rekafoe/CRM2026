import React from 'react';
import { Material } from '../../../types/shared';
import { WarehouseButton } from '../common/WarehouseButton';
import { StatusBadge } from '../../common/StatusBadge';

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
    <div className={`material-card card ${isSelected ? 'selected' : ''}`}>
      <div className="material-card-header flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onSelect(material.id)}
            className="material-checkbox"
          />
          <div className="material-info">
            <h3 className="material-name text-lg font-bold text-primary">
              {material.name}
            </h3>
            <p className="material-description text-sm text-text-secondary">
              {material.description || 'Без описания'}
            </p>
          </div>
        </div>
        <StatusBadge status={stockInfo.status} />
      </div>

      <div className="material-card-body mb-3">
        {/* Описание материала */}
        {material.description && (
          <div className="material-description mb-3 p-2 bg-tertiary rounded text-sm text-text-secondary">
            {material.description}
          </div>
        )}
        
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
            {material.sheet_price_single || material.price || 0} BYN
          </div>
          <div className="price-label text-sm text-text-secondary">за единицу</div>
        </div>
      </div>

      <div className="material-actions flex gap-1 justify-end">
        <WarehouseButton
          variant="primary"
          size="sm"
          icon="✏️"
          onClick={() => onEdit(material)}
          className="icon-only"
        />
        <WarehouseButton
          variant="warning"
          size="sm"
          icon="📦"
          onClick={() => onReserve(material)}
          className="icon-only"
        />
        <WarehouseButton
          variant="danger"
          size="sm"
          icon="🗑️"
          onClick={() => onDelete(material)}
          className="icon-only"
        />
      </div>
    </div>
  );
};
