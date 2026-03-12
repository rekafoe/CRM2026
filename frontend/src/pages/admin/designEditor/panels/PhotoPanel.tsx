import React from 'react';
import { AppIcon } from '../../../../components/ui/AppIcon';
import { Button } from '../../../../components/common';

interface PhotoPanelProps {
  onAddImage: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  sortBy: 'name' | 'date';
  onSortChange: (value: 'name' | 'date') => void;
  autofill: boolean;
  onAutofillChange: (value: boolean) => void;
  hideUsed: boolean;
  onHideUsedChange: (value: boolean) => void;
  onClose: () => void;
}

export const PhotoPanel: React.FC<PhotoPanelProps> = ({
  onAddImage,
  onDrop,
  onDragOver,
  sortBy,
  onSortChange,
  autofill,
  onAutofillChange,
  hideUsed,
  onHideUsedChange,
  onClose,
}) => (
  <div className="design-editor-panel-photo">
    <div className="design-editor-panel-header">
      <h3 className="design-editor-panel-title">Фото</h3>
      <button type="button" className="design-editor-panel-close" onClick={onClose} aria-label="Закрыть">
        <AppIcon name="x" size="sm" />
      </button>
    </div>
    <div className="design-editor-panel-actions">
      <Button variant="primary" onClick={onAddImage} className="design-editor-btn-add-image">
        <AppIcon name="plus" size="xs" /> Добавить изображение
      </Button>
      <button type="button" className="design-editor-btn-icon" title="Сетка/галерея" aria-label="Сетка">
        <AppIcon name="image" size="xs" />
      </button>
    </div>
    <div className="design-editor-panel-filters">
      <select className="design-editor-panel-select" value={sortBy} onChange={(e) => onSortChange(e.target.value as 'name' | 'date')}>
        <option value="name">По названию</option>
        <option value="date">По дате</option>
      </select>
      <button type="button" className="design-editor-panel-filter-btn" title="Фильтр" aria-label="Фильтр">
        <AppIcon name="filter" size="xs" />
      </button>
      <label className="design-editor-panel-toggle">
        <span className="design-editor-panel-toggle-label">Автозаполнение</span>
        <input type="checkbox" checked={autofill} onChange={(e) => onAutofillChange(e.target.checked)} />
        <span className="design-editor-panel-toggle-slider" />
      </label>
    </div>
    <label className="design-editor-panel-toggle design-editor-panel-toggle--block">
      <input type="checkbox" checked={hideUsed} onChange={(e) => onHideUsedChange(e.target.checked)} />
      <span className="design-editor-panel-toggle-slider" />
      <span className="design-editor-panel-toggle-label">Скрыть используемые изображения</span>
    </label>
    <div
      className="design-editor-panel-upload"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragOver}
      onClick={onAddImage}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onAddImage()}
      aria-label="Нажмите или перенесите изображение для загрузки"
    >
      <AppIcon name="download" size="xl" className="design-editor-panel-upload-icon" />
      <span className="design-editor-panel-upload-text">Нажмите или перенесите изображение для загрузки</span>
    </div>
  </div>
);
