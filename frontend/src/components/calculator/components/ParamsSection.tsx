import React from 'react';
import { AppIcon } from '../../ui/AppIcon';

export interface ParamsSectionSpecs {
  productType: string;
  format: string;
  quantity: number;
  sides: 1 | 2;
  size_id?: number | string;
  pages?: number;
}

interface ParamsSectionProps {
  specs: ParamsSectionSpecs;
  availableFormats: string[];
  validationErrors: Record<string, string>;
  isCustomFormat: boolean;
  customFormat: { width: string; height: string };
  setIsCustomFormat: (v: boolean) => void;
  setCustomFormat: (updater: (prev: { width: string; height: string }) => { width: string; height: string }) => void;
  updateSpecs: (updates: Partial<any>, instant?: boolean) => void; // 🆕 Добавили instant параметр
  schema?: { 
    fields?: Array<{ name: string; type?: string; enum?: any[]; label?: string; required?: boolean; min?: number; max?: number; placeholder?: string }>; 
    template?: { simplified?: { sizes?: Array<{ id: string; label: string; width_mm: number; height_mm: number }> } } | null;
  } | null;
  /** Размеры текущего типа продукта (если у продукта есть типы — подставляются из модалки) */
  effectiveSizes?: Array<{ id: string; label?: string; width_mm: number; height_mm: number; min_qty?: number; max_qty?: number; print_prices?: Array<{ tiers?: Array<{ min_qty?: number }> }> }>;
  /** Штук на листе — для подсказки «следующее изменение цены» */
  itemsPerSheet?: number;
  /** Страницы из шаблона (подтип/корень): options, allowCustom, min/max/step */
  effectivePages?: {
    options?: number[];
    default?: number;
    allowCustom?: boolean;
    min?: number;
    max?: number;
    step?: number;
  };
  /** Переплёт для multi_page: услуга из шаблона + варианты из API */
  bindingServiceId?: number;
  bindingVariants?: Array<{ id: number; variantName?: string; variant_name?: string }>;
  bindingVariantId?: number;
  bindingUnitsPerItem?: number;
  onBindingVariantChange?: (variantId: number | undefined) => void;
  onBindingUnitsChange?: (units: number | undefined) => void;
}

export const ParamsSection: React.FC<ParamsSectionProps> = ({
  specs,
  availableFormats,
  validationErrors,
  isCustomFormat,
  customFormat,
  setIsCustomFormat,
  setCustomFormat,
  updateSpecs,
  schema,
  effectiveSizes: effectiveSizesProp,
  itemsPerSheet,
  effectivePages: effectivePagesProp,
  bindingServiceId,
  bindingVariants = [],
  bindingVariantId,
  bindingUnitsPerItem,
  onBindingVariantChange,
  onBindingUnitsChange,
}) => {
  const hasField = (name: string) => !!schema?.fields?.some(f => f.name === name);
  const getEnum = (name: string): any[] => schema?.fields?.find(f => f.name === name)?.enum || [];
  const getLabel = (name: string, fallback: string) => schema?.fields?.find(f => f.name === name)?.label || fallback;
  const isRequired = (name: string) => !!schema?.fields?.find(f => f.name === name)?.required;
  const getMin = (name: string) => schema?.fields?.find(f => f.name === name)?.min;
  const getMax = (name: string) => schema?.fields?.find(f => f.name === name)?.max;
  const getPlaceholder = (name: string, fb: string) => schema?.fields?.find(f => f.name === name)?.placeholder || fb;
  // Размеры: при наличии effectiveSizes (типы продукта) используем их, иначе из схемы
  const simplifiedSizes = Array.isArray(effectiveSizesProp) && effectiveSizesProp.length > 0
    ? effectiveSizesProp
    : schema?.template?.simplified?.sizes;
  const isSimplifiedProduct = simplifiedSizes && simplifiedSizes.length > 0;

  const selectedSizeId = specs.size_id ?? (simplifiedSizes?.length ? simplifiedSizes[0].id : undefined);
  const selectedSize = simplifiedSizes?.find((s: any) => String(s.id) === String(selectedSizeId));
  const minQtyForSize = selectedSize
    ? ((selectedSize as any).min_qty ?? (selectedSize as any).print_prices?.[0]?.tiers?.[0]?.min_qty ?? 1)
    : 1;

  // 🆕 Устанавливаем первый размер и мин. количество для упрощённых продуктов
  React.useEffect(() => {
    if (isSimplifiedProduct && simplifiedSizes.length > 0) {
      const isValidSizeId = specs.size_id != null && simplifiedSizes.some((s: any) => String(s.id) === String(specs.size_id));
      if (!isValidSizeId) {
        const first = simplifiedSizes[0] as any;
        const minQty = first.min_qty ?? first.print_prices?.[0]?.tiers?.[0]?.min_qty ?? 1;
        updateSpecs({ 
          size_id: first.id,
          format: `${first.width_mm}×${first.height_mm}`,
          quantity: minQty,
        }, true);
      }
    }
  }, [isSimplifiedProduct, simplifiedSizes, specs.size_id, updateSpecs]);

  return (
    <div className="form-section compact">
      <h3><AppIcon name="settings" size="xs" /> Параметры</h3>
      <div className="params-grid compact">
        {/* 🆕 Размер изделия для упрощённых продуктов (длинные названия — подсказка + обрезка) */}
        {isSimplifiedProduct && (() => {
          const sizeOptionLabel = selectedSize ? `${selectedSize.label} (${selectedSize.width_mm}×${selectedSize.height_mm} мм)` : '';
          return (
            <div className="param-group param-group--narrow param-group--size-block">
              <label>
                Размер изделия <span style={{ color: 'var(--danger, #c53030)' }}>*</span>
              </label>
              <select
                value={selectedSizeId}
                onChange={(e) => {
                  const id = e.target.value;
                  const size = simplifiedSizes.find((s: any) => String(s.id) === String(id)) as any;
                  const minQty = size?.min_qty ?? size?.print_prices?.[0]?.tiers?.[0]?.min_qty ?? 1;
                  updateSpecs({
                    size_id: id,
                    format: size ? `${size.width_mm}×${size.height_mm}` : specs.format,
                    quantity: minQty,
                  }, true);
                }}
                className="form-control"
                required
                title={sizeOptionLabel || undefined}
              >
                {simplifiedSizes.map(size => (
                  <option key={size.id} value={size.id}>
                    {size.label} ({size.width_mm}×{size.height_mm} мм)
                  </option>
                ))}
              </select>
            </div>
          );
        })()}

        {/* Формат (скрываем для упрощённых продуктов) */}
        {hasField('format') && !isSimplifiedProduct && (
        <div className="param-group param-group--narrow">
          <label>
            {getLabel('format', 'Формат')}
            {isRequired('format') && <span style={{ color: 'var(--danger, #c53030)' }}> *</span>}
          </label>
          <select
            value={isCustomFormat ? 'custom' : (specs.format || (getEnum('format').length ? getEnum('format')[0] : availableFormats[0] || ''))}
            onChange={(e) => {
              if (e.target.value === 'custom') {
                setIsCustomFormat(true);
              } else {
                setIsCustomFormat(false);
                updateSpecs({ format: e.target.value }, true); // 🆕 instant=true для select
              }
            }}
            className="form-control"
            required={isRequired('format')}
          >
            {(getEnum('format').length ? getEnum('format') : availableFormats).map((format: string) => (
              <option key={format} value={format}>{format}</option>
            ))}
            <option value="custom">Произвольный размер</option>
          </select>
          {isCustomFormat && (
            <div className="custom-format-inputs">
              <input
                type="number"
                placeholder="Ширина (мм)"
                value={customFormat.width}
                onChange={(e) => {
                  const newWidth = e.target.value;
                  setCustomFormat(prev => ({ ...prev, width: newWidth }));
                  // ✅ Обновляем specs при изменении кастомного формата
                  if (newWidth && customFormat.height) {
                    updateSpecs({
                      format: `${newWidth}×${customFormat.height}`,
                      customFormat: { width: newWidth, height: customFormat.height }
                    }, true);
                  }
                }}
                className="form-control"
              />
              <span>×</span>
              <input
                type="number"
                placeholder="Высота (мм)"
                value={customFormat.height}
                onChange={(e) => {
                  const newHeight = e.target.value;
                  setCustomFormat(prev => ({ ...prev, height: newHeight }));
                  // ✅ Обновляем specs при изменении кастомного формата
                  if (customFormat.width && newHeight) {
                    updateSpecs({
                      format: `${customFormat.width}×${newHeight}`,
                      customFormat: { width: customFormat.width, height: newHeight }
                    }, true);
                  }
                }}
                className="form-control"
              />
            </div>
          )}
        </div>
        )}

        {/* Количество */}
        <div className="param-group">
          <label>
            {getLabel('quantity', 'Количество')}
          </label>
          <div className="quantity-controls">
            {(() => {
              const minQty = isSimplifiedProduct ? minQtyForSize : (getMin('quantity') ?? 1);
              const safeQty = Number.isFinite(specs.quantity) ? specs.quantity : 0;
              return (
                <>
            <button 
              type="button"
              className="quantity-btn quantity-btn-minus"
                  onClick={() => updateSpecs({ quantity: Math.max(minQty, safeQty - 1) })}
            >
              −
            </button>
            <input
              type="number"
                  value={specs.quantity ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value;
                    updateSpecs({ quantity: raw === '' ? undefined : Number(raw) });
                  }}
                  min={minQty}
              placeholder={getPlaceholder('quantity', '')}
              className={`quantity-input ${validationErrors.quantity ? 'error' : ''}`}
              required={isRequired('quantity')}
            />
            <button 
              type="button"
              className="quantity-btn quantity-btn-plus"
                  onClick={() => updateSpecs({ quantity: Math.max(minQty, safeQty) + 1 })}
            >
              +
            </button>
                </>
              );
            })()}
          </div>
          {validationErrors.quantity && (
            <div className="text-sm text-red-600">{validationErrors.quantity}</div>
          )}
          {isSimplifiedProduct && specs.quantity != null && specs.quantity < minQtyForSize && (
            <div className="text-sm text-warning mt-1">
              Рекомендуемое количество для выбранного размера: {minQtyForSize} шт.
            </div>
          )}
          {itemsPerSheet != null && itemsPerSheet > 1 && specs.quantity != null && specs.quantity > 0 && (() => {
            const q = Number(specs.quantity);
            const currentSheets = Math.ceil(q / itemsPerSheet);
            const nextPriceChangeQty = currentSheets * itemsPerSheet + 1;
            return (
              <div className="text-sm text-muted mt-1">
                Следующее изменение цены: при {nextPriceChangeQty} шт.
              </div>
            );
          })()}
        </div>

        {/* Стороны печати */}
        {hasField('sides') && (
        <div className="param-group">
          <label>
            {getLabel('sides', 'Стороны')}
            {isRequired('sides') && <span style={{ color: 'var(--danger, #c53030)' }}> *</span>}
          </label>
          <select
            value={specs.sides}
            onChange={(e) => updateSpecs({ sides: parseInt(e.target.value) as 1 | 2 }, true)} // 🆕 instant
            className="form-control"
            required={isRequired('sides')}
          >
            {(getEnum('sides').length ? getEnum('sides') : [1,2]).map((s: number) => (
              <option key={s} value={s}>{s === 1 ? 'Односторонние' : 'Двусторонние'}</option>
            ))}
          </select>
        </div>
        )}

        {/* Страницы: пресеты из шаблона + произвольное число (если разрешено) */}
        {(() => {
          const fromTemplate = Array.isArray(effectivePagesProp?.options)
            ? effectivePagesProp!.options!.map((n) => Number(n)).filter((n) => Number.isFinite(n))
            : [];
          const fromSchema = (getEnum('pages') as number[]) || [];
          const allowedOptions = fromTemplate.length > 0 ? fromTemplate : fromSchema;
          const showPages =
            hasField('pages') ||
            allowedOptions.length > 0 ||
            effectivePagesProp?.allowCustom === true;
          if (!showPages) return null;

          const allowCustom = effectivePagesProp?.allowCustom !== false;
          const minBound =
            effectivePagesProp?.min ??
            (allowedOptions.length > 0 ? Math.min(...allowedOptions) : (getMin('pages') ?? 4));
          const maxBound =
            effectivePagesProp?.max ??
            (allowedOptions.length > 0 ? Math.max(...allowedOptions) : (getMax('pages') ?? 500));
          const stepHint = effectivePagesProp?.step;
          const current = Number(specs.pages ?? allowedOptions[0] ?? minBound ?? 4);
          const selectValue = allowedOptions.includes(current) ? current : '';

          if (allowedOptions.length === 0 && hasField('pages')) {
            const fe = getEnum('pages') as number[];
            if (fe.length > 0) {
              return (
                <div className="param-group">
                  <label>
                    {getLabel('pages', 'Страницы')}
                    {isRequired('pages') && <span style={{ color: 'var(--danger, #c53030)' }}> *</span>}
                  </label>
                  <select
                    value={specs.pages ?? fe[0]}
                    onChange={(e) => updateSpecs({ pages: parseInt(e.target.value, 10) })}
                    className="form-control"
                    required={isRequired('pages')}
                  >
                    {fe.map((p: number) => (
                      <option key={p} value={p}>
                        {p} стр.
                      </option>
                    ))}
                  </select>
                </div>
              );
            }
          }

          if (allowedOptions.length === 0 && !allowCustom) {
            return null;
          }

          return (
            <div className="param-group param-group--pages">
              <label>
                {getLabel('pages', 'Страницы')}
                {isRequired('pages') && <span style={{ color: 'var(--danger, #c53030)' }}> *</span>}
              </label>
              {allowedOptions.length > 0 && (
                <select
                  value={selectValue === '' ? String(allowedOptions[0]) : String(selectValue)}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateSpecs({ pages: parseInt(v, 10) }, true);
                  }}
                  className="form-control"
                  required={isRequired('pages') && !allowCustom}
                >
                  {allowedOptions.map((p: number) => (
                    <option key={p} value={p}>
                      {p} стр.
                    </option>
                  ))}
                  {allowCustom && !allowedOptions.includes(current) && (
                    <option value={String(current)}>{current} стр. (вручную)</option>
                  )}
                </select>
              )}
              {allowCustom && (
                <div className="param-group param-group--inline" style={{ marginTop: 8 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Другое количество (стр.)
                    {stepHint != null ? `, кратно ${stepHint}` : ''}
                    {allowedOptions.length > 0 ? `: от ${minBound} до ${maxBound}` : ''}
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    min={minBound}
                    max={maxBound}
                    step={stepHint ?? 1}
                    value={Number.isFinite(current) ? current : ''}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '') return;
                      const n = parseInt(raw, 10);
                      if (!Number.isFinite(n)) return;
                      updateSpecs({ pages: n }, true);
                    }}
                  />
                </div>
              )}
            </div>
          );
        })()}

        {bindingServiceId != null && bindingVariants.length > 0 && (
          <div className="param-group param-group--binding">
            <label>Переплёт</label>
            <select
              className="form-control"
              value={bindingVariantId != null && Number.isFinite(bindingVariantId) ? String(bindingVariantId) : ''}
              onChange={(e) => {
                const v = e.target.value;
                onBindingVariantChange?.(v === '' ? undefined : Number(v));
              }}
            >
              <option value="">— Выберите вариант —</option>
              {bindingVariants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.variantName ?? (v as any).variant_name ?? `Вариант #${v.id}`}
                </option>
              ))}
            </select>
            {onBindingUnitsChange != null && (
              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 12 }}>Единиц переплёта на изделие</label>
                <input
                  type="number"
                  min={1}
                  className="form-control"
                  value={bindingUnitsPerItem ?? 1}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    onBindingUnitsChange(Number.isFinite(n) && n > 0 ? n : 1);
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Магнитные (для визиток) */}
        {hasField('magnetic') && (
        <div className="param-group checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={(specs as any).magnetic || false}
              onChange={(e) => updateSpecs({ magnetic: e.target.checked })}
            />
            {getLabel('magnetic', 'Магнитные')}
          </label>
        </div>
        )}
      </div>
    </div>
  );
};

export default ParamsSection;


