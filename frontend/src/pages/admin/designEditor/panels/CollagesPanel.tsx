import React, { useEffect, useState } from 'react';
import { AppIcon } from '../../../../components/ui/AppIcon';
import { Button } from '../../../../components/common';
import { getCollageTemplates, type CollageTemplate, type CollageLayout } from '../../../../api';

interface CollagesPanelProps {
  onClose: () => void;
  photoCount: number;
  onPhotoCountChange: (value: number) => void;
  filterSuitable: boolean;
  onFilterSuitableChange: (value: boolean) => void;
  padding: number;
  onPaddingChange: (value: number) => void;
  selectedTemplateId: number | null;
  onSelectTemplate: (id: number | null) => void;
  onApplyTemplate?: (layout: CollageLayout) => void;
}

/** Мини-превью раскладки (серые ячейки с отступом) */
const LayoutPreview: React.FC<{ layout: CollageLayout; paddingPercent: number }> = ({ layout, paddingPercent }) => {
  const margin = paddingPercent / 100 / 2;
  const scale = 1 - 2 * margin;
  return (
    <svg className="design-editor-collage-thumb-inner" viewBox="0 0 100 100" aria-hidden="true">
      <rect className="design-editor-collage-preview-bg" x="0" y="0" width="100" height="100" />
      {layout.cells.map((cell, i) => (
        <rect
          key={i}
          className="design-editor-collage-preview-cell"
          x={(margin + cell.x * scale) * 100}
          y={(margin + cell.y * scale) * 100}
          width={(cell.w * scale) * 100}
          height={(cell.h * scale) * 100}
        />
      ))}
    </svg>
  );
};

const PHOTO_COUNT_OPTIONS = [2, 3, 4, 5, 6];

export const CollagesPanel: React.FC<CollagesPanelProps> = ({
  onClose,
  photoCount,
  onPhotoCountChange,
  filterSuitable,
  onFilterSuitableChange,
  padding,
  onPaddingChange,
  selectedTemplateId,
  onSelectTemplate,
  onApplyTemplate,
}) => {
  const [templates, setTemplates] = useState<CollageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getCollageTemplates({
      photo_count: photoCount,
      only_suitable: filterSuitable,
    })
      .then((res) => {
        if (!cancelled) setTemplates(res.data ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Ошибка загрузки');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [photoCount, filterSuitable]);

  const layoutParsed = (t: CollageTemplate): CollageLayout =>
    t.layoutParsed ?? (typeof t.layout === 'string' ? (() => { try { return JSON.parse(t.layout); } catch { return { cells: [] }; } })() : { cells: [] });

  const paddingPercent = Math.min(30, Math.max(0, padding));
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? null;
  const selectedLayout = selectedTemplate ? layoutParsed(selectedTemplate) : null;
  const canApply = !!selectedLayout?.cells?.length && !!onApplyTemplate;

  return (
    <div className="design-editor-panel-collages">
      <div className="design-editor-panel-header">
        <h3 className="design-editor-panel-title">Коллажи</h3>
        <button type="button" className="design-editor-panel-close" onClick={onClose} aria-label="Закрыть">
          <AppIcon name="x" size="sm" />
        </button>
      </div>

      <div className="design-editor-panel-field">
        <label className="design-editor-panel-label">Количество фото</label>
        <select
          className="design-editor-panel-select"
          value={photoCount}
          onChange={(e) => onPhotoCountChange(Number(e.target.value))}
        >
          {PHOTO_COUNT_OPTIONS.map((n) => (
            <option key={n} value={n}>{n} фото в коллаже</option>
          ))}
        </select>
      </div>

      <label className="design-editor-panel-toggle design-editor-panel-toggle--block">
        <input
          type="checkbox"
          checked={filterSuitable}
          onChange={(e) => onFilterSuitableChange(e.target.checked)}
        />
        <span className="design-editor-panel-toggle-slider" />
        <span className="design-editor-panel-toggle-label">Оставить только подходящие</span>
      </label>

      <div className="design-editor-panel-field">
        <label className="design-editor-panel-label">Отступ, %</label>
        <div className="design-editor-collage-padding-row">
          <input
            type="range"
            min={0}
            max={30}
            value={padding}
            onChange={(e) => onPaddingChange(Number(e.target.value))}
            className="design-editor-collage-slider"
          />
          <input
            type="number"
            min={0}
            max={50}
            value={padding}
            onChange={(e) => onPaddingChange(Math.min(50, Math.max(0, Number(e.target.value) || 0)))}
            className="design-editor-collage-padding-input"
          />
        </div>
      </div>

      <Button
        type="button"
        variant="primary"
        className="design-editor-collage-apply"
        disabled={!canApply}
        onClick={() => selectedLayout && onApplyTemplate?.(selectedLayout)}
      >
        Применить раскладку
      </Button>

      {error && <p className="design-editor-panel-error">{error}</p>}
      {loading && <p className="design-editor-panel-placeholder">Загрузка шаблонов...</p>}

      {!loading && !error && (
        <div className="design-editor-collage-grid">
          {templates.map((t) => {
            const layout = layoutParsed(t);
            const isSelected = selectedTemplateId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                className={`design-editor-collage-thumb ${isSelected ? 'design-editor-collage-thumb--selected' : ''}`}
                onClick={() => onSelectTemplate(isSelected ? null : t.id)}
                title={t.name ?? `Шаблон ${t.id}`}
              >
                <LayoutPreview layout={layout} paddingPercent={paddingPercent} />
              </button>
            );
          })}
        </div>
      )}

      {!loading && !error && templates.length === 0 && (
        <p className="design-editor-panel-placeholder">Нет шаблонов для выбранного количества фото. Добавьте шаблоны в настройках.</p>
      )}
    </div>
  );
};
