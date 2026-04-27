import React from 'react';
import { AppIcon } from '../../../components/ui/AppIcon';
import { ProductTypesCard } from './ProductTypesCard';
import { TemplateProductRouteKey } from './TemplateProductRouteKey';
import type { DesignEditorMode, SimplifiedConfig } from '../hooks/useProductTemplate';
import type { UseSimplifiedTypesResult } from '../hooks/useSimplifiedTypes';
import type { ServiceRow } from './SimplifiedTemplateSection';
import type { ProductWithDetails } from '../../../services/products';

const DESIGN_EDITOR_MODE_OPTIONS: Array<{
  value: DesignEditorMode;
  label: string;
  hint: string;
}> = [
  {
    value: 'none',
    label: 'Без редактора',
    hint: 'Клиент загружает готовый макет или просит разработку.',
  },
  {
    value: 'single',
    label: 'Одностраничный редактор',
    hint: 'Один canvas: открытка, постер, визитка, одиночный макет.',
  },
  {
    value: 'multipage',
    label: 'Многостраничный редактор',
    hint: 'Страницы/развороты: фотокнига, календарь, каталог.',
  },
  {
    value: 'photo_batch',
    label: 'Пакетная фотопечать',
    hint: 'Много отдельных фото одного формата: 10×15, 15×20 и т.д.',
  },
];

export interface SimplifiedTemplateSidebarProps {
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
  productAllowedPriceTypes?: string[];
  /** Явное сохранение route_key с шаблона */
  productNumericId?: number;
  onProductRouteKeySaved?: () => void;
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
  productAllowedPriceTypes,
  productNumericId,
  onProductRouteKeySaved,
}) => {
  const selectedEditorMode = value.design_editor_mode ?? 'none';
  const selectedEditorModeHint = DESIGN_EDITOR_MODE_OPTIONS.find((option) => option.value === selectedEditorMode)?.hint;
  const prepress = value.prepress ?? {};
  const updatePrepress = (patch: NonNullable<SimplifiedConfig['prepress']>) => {
    onChange({
      ...value,
      prepress: {
        ...prepress,
        ...patch,
      },
    });
  };

  return (
    <aside className="product-template__sidebar">
      {productNumericId != null && product && (
        <TemplateProductRouteKey
          productId={productNumericId}
          routeKey={(product as { route_key?: string | null }).route_key}
          onSaved={onProductRouteKeySaved}
        />
      )}
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
            <label className="template-summary-card__field">
              <span>Режим макета</span>
              <select
                className="form-input"
                value={selectedEditorMode}
                onChange={(e) =>
                  onChange({
                    ...value,
                    design_editor_mode: e.target.value as DesignEditorMode,
                  })
                }
              >
                {DESIGN_EDITOR_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {selectedEditorModeHint && (
                <small className="template-summary-card__field-hint">{selectedEditorModeHint}</small>
              )}
            </label>
            <div className="template-summary-card__field-group">
              <span className="template-summary-card__field-title">Допечатная подготовка</span>
              <label className="template-summary-card__field">
                <span>Дозаливка, мм</span>
                <input
                  className="form-input"
                  type="number"
                  min={0}
                  step={0.5}
                  value={prepress.bleedMm ?? 2}
                  onChange={(e) => updatePrepress({ bleedMm: Number(e.target.value) || 0 })}
                />
              </label>
              <label className="template-summary-card__field">
                <span>Безопасная зона, мм</span>
                <input
                  className="form-input"
                  type="number"
                  min={0}
                  step={0.5}
                  value={prepress.safeZoneMm ?? 5}
                  onChange={(e) => updatePrepress({ safeZoneMm: Number(e.target.value) || 0 })}
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={prepress.showBleed !== false}
                  onChange={(e) => updatePrepress({ showBleed: e.target.checked })}
                />
                Показывать дозаливку
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={prepress.showTrim !== false}
                  onChange={(e) => updatePrepress({ showTrim: e.target.checked })}
                />
                Показывать линию реза
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={prepress.showSafeZone !== false}
                  onChange={(e) => updatePrepress({ showSafeZone: e.target.checked })}
                />
                Показывать safe zone
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={prepress.cutMarks !== false}
                  onChange={(e) => updatePrepress({ cutMarks: e.target.checked })}
                />
                Метки реза в production export
              </label>
            </div>
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
        productAllowedPriceTypes={productAllowedPriceTypes}
      />
    </aside>
  );
};

