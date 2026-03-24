import React from 'react';
import { AppIcon } from '../../../../components/ui/AppIcon';

interface ShapesPanelProps {
  onAddShape: (type: 'rect' | 'circle' | 'line' | 'triangle') => void;
  onClose: () => void;
}

const SHAPES: { type: 'rect' | 'circle' | 'line' | 'triangle'; label: string; preview: React.ReactNode }[] = [
  {
    type: 'rect',
    label: 'Прямоугольник',
    preview: (
      <svg width="40" height="28" viewBox="0 0 40 28">
        <rect x="2" y="2" width="36" height="24" fill="#3b82f6" rx="2" />
      </svg>
    ),
  },
  {
    type: 'circle',
    label: 'Эллипс',
    preview: (
      <svg width="40" height="28" viewBox="0 0 40 28">
        <ellipse cx="20" cy="14" rx="18" ry="12" fill="#3b82f6" />
      </svg>
    ),
  },
  {
    type: 'line',
    label: 'Линия',
    preview: (
      <svg width="40" height="28" viewBox="0 0 40 28">
        <line x1="4" y1="14" x2="36" y2="14" stroke="#1f2937" strokeWidth="3" />
      </svg>
    ),
  },
  {
    type: 'triangle',
    label: 'Треугольник',
    preview: (
      <svg width="40" height="28" viewBox="0 0 40 28">
        <polygon points="20,2 38,26 2,26" fill="#3b82f6" />
      </svg>
    ),
  },
];

export const ShapesPanel: React.FC<ShapesPanelProps> = ({ onAddShape, onClose }) => (
  <div className="design-editor-panel-content">
    <div className="design-editor-panel-header">
      <h3 className="design-editor-panel-title">Фигуры</h3>
      <button
        type="button"
        className="design-editor-panel-close"
        onClick={onClose}
        aria-label="Закрыть"
      >
        <AppIcon name="x" size="sm" />
      </button>
    </div>

    <p className="design-editor-panel-hint">Нажмите на фигуру, чтобы добавить её на холст</p>

    <div className="design-editor-shapes-grid">
      {SHAPES.map((s) => (
        <button
          key={s.type}
          type="button"
          className="design-editor-shape-btn"
          onClick={() => onAddShape(s.type)}
          title={s.label}
        >
          <span className="design-editor-shape-preview">{s.preview}</span>
          <span className="design-editor-shape-label">{s.label}</span>
        </button>
      ))}
    </div>
  </div>
);
