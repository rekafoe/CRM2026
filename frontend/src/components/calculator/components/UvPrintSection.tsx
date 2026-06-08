import React, { useMemo } from 'react';
import { AppIcon } from '../../ui/AppIcon';
import {
  getLayerLabel,
  type UvPrintLayerKey,
  type UvPrintState,
  type UvPrintTemplateConfig,
} from '../utils/uvPrintConfig';

interface UvPrintSectionProps {
  templateConfig?: UvPrintTemplateConfig;
  uvPrint: UvPrintState;
  onUvPrintChange: (next: UvPrintState) => void;
  customWidth: string;
  customHeight: string;
  onCustomWidthChange: (v: string) => void;
  onCustomHeightChange: (v: string) => void;
  showPresetSizes?: boolean;
  presetSizeId?: string | number;
  presetSizes?: Array<{ id: string | number; label: string; width_mm: number; height_mm: number }>;
  onPresetSizeChange?: (id: string) => void;
  useCustomDimensions?: boolean;
  onUseCustomDimensionsChange?: (custom: boolean) => void;
  validationErrors?: Record<string, string>;
}

const ALL_LAYERS: UvPrintLayerKey[] = ['color', 'white', 'varnish'];
const MIN_PASSES = 1;
const MAX_PASSES = 5;

function clampPasses(value: number): number {
  return Math.max(MIN_PASSES, Math.min(MAX_PASSES, Math.floor(value) || MIN_PASSES));
}

export const UvPrintSection: React.FC<UvPrintSectionProps> = ({
  templateConfig,
  uvPrint,
  onUvPrintChange,
  customWidth,
  customHeight,
  onCustomWidthChange,
  onCustomHeightChange,
  showPresetSizes = false,
  presetSizeId,
  presetSizes = [],
  onPresetSizeChange,
  useCustomDimensions = true,
  onUseCustomDimensionsChange,
  validationErrors = {},
}) => {
  const allowedLayers = useMemo(
    () => templateConfig?.layers ?? ALL_LAYERS,
    [templateConfig?.layers],
  );

  const updateLayer = (layer: UvPrintLayerKey, patch: Partial<{ enabled: boolean; passes: number }>) => {
    const current = uvPrint[layer] ?? { enabled: false, passes: 1 };
    onUvPrintChange({
      ...uvPrint,
      [layer]: { ...current, ...patch },
    });
  };

  return (
    <div className="form-section compact uv-print-section">
      <h3><AppIcon name="printer" size="xs" /> УФ-печать</h3>

      {showPresetSizes && presetSizes.length > 0 && onUseCustomDimensionsChange && (
        <div className="param-group param-group--narrow mb-3">
          <label>Размер</label>
          <select
            className="form-control"
            value={useCustomDimensions ? 'custom' : String(presetSizeId ?? '')}
            onChange={(e) => {
              if (e.target.value === 'custom') {
                onUseCustomDimensionsChange(true);
              } else {
                onUseCustomDimensionsChange(false);
                onPresetSizeChange?.(e.target.value);
              }
            }}
          >
            {presetSizes.map((s) => (
              <option key={String(s.id)} value={String(s.id)}>
                {s.label} ({s.width_mm}×{s.height_mm} мм)
              </option>
            ))}
            <option value="custom">Произвольный размер</option>
          </select>
        </div>
      )}

      {(useCustomDimensions || !showPresetSizes) && (
        <div className="param-group mb-3">
          <label>
            Размер изделия (мм) <span className="text-danger">*</span>
          </label>
          <div className="custom-format-inputs">
            <input
              type="number"
              className="form-control"
              placeholder="Ширина"
              min={1}
              value={customWidth}
              onChange={(e) => onCustomWidthChange(e.target.value)}
            />
            <span>×</span>
            <input
              type="number"
              className="form-control"
              placeholder="Высота"
              min={1}
              value={customHeight}
              onChange={(e) => onCustomHeightChange(e.target.value)}
            />
          </div>
          {validationErrors.trim_size && (
            <div className="validation-error text-sm mt-1">{validationErrors.trim_size}</div>
          )}
        </div>
      )}

      <div className="uv-print-layers">
        {allowedLayers.map((layer) => {
          const row = uvPrint[layer] ?? { enabled: layer === 'color', passes: 1 };
          return (
            <div key={layer} className="uv-print-layer-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(e) => updateLayer(layer, { enabled: e.target.checked })}
                />
                {getLayerLabel(layer)}
              </label>
              {row.enabled && (
                <div className="uv-print-layer-passes">
                  <span className="uv-print-layer-passes__label">Проходов</span>
                  <div className="quantity-controls uv-print-passes-controls">
                    <button
                      type="button"
                      className="quantity-btn quantity-btn-minus"
                      aria-label={`Меньше проходов: ${getLayerLabel(layer)}`}
                      disabled={row.passes <= MIN_PASSES}
                      onClick={() =>
                        updateLayer(layer, { passes: clampPasses(row.passes - 1) })
                      }
                    >
                      −
                    </button>
                    <input
                      type="number"
                      className="quantity-input uv-print-passes-input"
                      min={MIN_PASSES}
                      max={MAX_PASSES}
                      value={row.passes}
                      onChange={(e) => {
                        const raw = e.target.value;
                        updateLayer(layer, {
                          passes: raw === '' ? MIN_PASSES : clampPasses(Number(raw)),
                        });
                      }}
                    />
                    <button
                      type="button"
                      className="quantity-btn quantity-btn-plus"
                      aria-label={`Больше проходов: ${getLayerLabel(layer)}`}
                      disabled={row.passes >= MAX_PASSES}
                      onClick={() =>
                        updateLayer(layer, { passes: clampPasses(row.passes + 1) })
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {validationErrors.uv_print && (
        <div className="validation-error text-sm mt-2">{validationErrors.uv_print}</div>
      )}
    </div>
  );
};
