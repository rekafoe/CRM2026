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
                  <span className="text-sm text-muted">Проходов</span>
                  <input
                    type="number"
                    className="form-control form-control--compact"
                    min={1}
                    max={5}
                    value={row.passes}
                    onChange={(e) =>
                      updateLayer(layer, {
                        passes: Math.max(1, Math.min(5, Number(e.target.value) || 1)),
                      })
                    }
                  />
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
