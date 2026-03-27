import React from 'react';
import { AppIcon } from '../../../components/ui/AppIcon';
import { ProductTypesCard } from './ProductTypesCard';
import type { SimplifiedConfig } from '../hooks/useProductTemplate';
import type { UseSimplifiedTypesResult } from '../hooks/useSimplifiedTypes';
import type { ServiceRow } from './SimplifiedTemplateSection';
import type { ProductWithDetails } from '../../../services/products';

interface SimplifiedTemplateSidebarProps {
  product: ProductWithDetails | null;
  icon: string;
  name: string;
  summaryStats: Array<{ label: string; value: string | number }>;
  value: SimplifiedConfig;
  onChange: (next: SimplifiedConfig) => void;
  calcOptionsExpanded: boolean;
  onToggleCalcOptions: () => void;
  types: UseSimplifiedTypesResult;
  onSelectType: (typeId: any) => void;
  services: ServiceRow[];
  allMaterials: any[];
}

export const SimplifiedTemplateSidebar: React.FC<SimplifiedTemplateSidebarProps> = ({
  product,
  icon,
  name,
  summaryStats,
  value,
  onChange,
  calcOptionsExpanded,
  onToggleCalcOptions,
  types,
  onSelectType,
  services,
  allMaterials,
}) => {
  return (
    <aside className="product-template__sidebar">
      <div className="template-summary-card">
        <div className="template-summary-card__icon">
          {product?.image_url ? (
            <img
              src={product.image_url}
              alt={name || product?.name || 'Изображение продукта'}
              className="template-summary-card__image"
            />
          ) : (
            icon || product?.icon || <AppIcon name="package" size="md" />
          )}
        </div>
        <div className="template-summary-card__name">{name || product?.name || 'Без названия'}</div>
        <ul className="template-summary-card__list">
          {summaryStats.map((item) => (
            <li key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </li>
          ))}
        </ul>
        <div className="template-summary-card__meta">
          Создан: {product?.created_at ? new Date(product.created_at).toLocaleDateString() : '—'}
        </div>
        <div
          className="template-summary-card__calc-header"
          onClick={onToggleCalcOptions}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onToggleCalcOptions()}
        >
          <div>
            <span className="simplified-label-with-hint">
              <strong>Опции калькулятора</strong>
              <span className="simplified-label-hint" title="Чекбоксы, доступные при расчёте.">?</span>
            </span>
          </div>
          <span className="template-summary-card__calc-toggle">{calcOptionsExpanded ? 'Свернуть' : 'Развернуть'}</span>
        </div>
        {calcOptionsExpanded && (
          <div className="template-summary-card__calc-content">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={value.use_layout !== false}
                onChange={(e) => onChange({ ...value, use_layout: e.target.checked })}
              />
              Раскладка на лист
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={!!value.cutting}
                onChange={(e) => onChange({ ...value, cutting: e.target.checked })}
              />
              Резка стопой
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={value.duplex_as_single_x2 === true}
                onChange={(e) => onChange({ ...value, duplex_as_single_x2: e.target.checked })}
              />
              Дуплекс как 2×односторонняя
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={value.include_material_cost !== false}
                onChange={(e) => onChange({ ...value, include_material_cost: e.target.checked })}
              />
              Учитывать стоимость материалов
            </label>
          </div>
        )}
      </div>

      <ProductTypesCard
        value={value}
        onChange={onChange}
        selectedTypeId={types.selectedTypeId}
        onSelectType={onSelectType}
        onAddType={types.addType}
        setDefaultType={types.setDefaultType}
        removeType={types.removeType}
        services={services}
        allMaterials={allMaterials}
      />
    </aside>
  );
};

