import React from 'react';

export interface ParamsSectionSpecs {
  productType: string;
  format: string;
  quantity: number;
  sides: 1 | 2;
  size_id?: string;
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

  const selectedSizeId = specs.size_id || (simplifiedSizes?.length ? simplifiedSizes[0].id : '');
  const selectedSize = simplifiedSizes?.find((s: any) => s.id === selectedSizeId);
  const minQtyForSize = selectedSize
    ? ((selectedSize as any).min_qty ?? (selectedSize as any).print_prices?.[0]?.tiers?.[0]?.min_qty ?? 1)
    : 1;

  // 🆕 Устанавливаем первый размер и мин. количество для упрощённых продуктов
  React.useEffect(() => {
    if (isSimplifiedProduct && simplifiedSizes.length > 0) {
      const isValidSizeId = specs.size_id && simplifiedSizes.some((s: any) => s.id === specs.size_id);
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
      <h3>⚙️ Параметры</h3>
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
                  const size = simplifiedSizes.find((s: any) => s.id === id) as any;
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

        {/* Страницы (для буклетов) */}
        {hasField('pages') && (
        <div className="param-group">
          <label>
            {getLabel('pages', 'Страницы')}
            {isRequired('pages') && <span style={{ color: 'var(--danger, #c53030)' }}> *</span>}
          </label>
          <select
            value={specs.pages ?? 4}
            onChange={(e) => updateSpecs({ pages: parseInt(e.target.value, 10) })}
            className="form-control"
            required={isRequired('pages')}
          >
            {getEnum('pages').map((p: number) => (
              <option key={p} value={p}>{p} стр.</option>
            ))}
          </select>
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


