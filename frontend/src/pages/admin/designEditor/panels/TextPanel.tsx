import React from 'react';
import { AppIcon } from '../../../../components/ui/AppIcon';
import { Button } from '../../../../components/common';
import { TEXT_FONTS } from '../constants';
import type { CanvasText } from '../types';

interface TextPanelProps {
  onAddText: () => void;
  selectedText: CanvasText | null;
  onTextChange: (text: string) => void;
  onFontChange: (fontFamily: string) => void;
  onFontSizeChange: (fontSize: number) => void;
  onClose: () => void;
}

export const TextPanel: React.FC<TextPanelProps> = ({
  onAddText,
  selectedText,
  onTextChange,
  onFontChange,
  onFontSizeChange,
  onClose,
}) => (
  <div className="design-editor-panel-content">
    <div className="design-editor-panel-header">
      <h3 className="design-editor-panel-title">Текст</h3>
      <button type="button" className="design-editor-panel-close" onClick={onClose} aria-label="Закрыть">
        <AppIcon name="x" size="sm" />
      </button>
    </div>
    <Button variant="primary" onClick={onAddText} className="design-editor-panel-add-text">
      <AppIcon name="plus" size="xs" /> Добавить текст
    </Button>
    {selectedText && (
      <div className="design-editor-text-edit design-editor-panel-text-edit">
        <input
          type="text"
          value={selectedText.text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Текст"
          className="design-editor-text-input"
        />
        <select
          className="design-editor-font-select"
          value={selectedText.fontFamily ?? 'Arial'}
          onChange={(e) => onFontChange(e.target.value)}
          title="Семейство шрифта"
        >
          {TEXT_FONTS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <label className="design-editor-text-size">
          <span>Размер:</span>
          <input
            type="number"
            min={8}
            max={120}
            value={selectedText.fontSize ?? 24}
            onChange={(e) => onFontSizeChange(parseInt(e.target.value, 10) || 24)}
          />
        </label>
      </div>
    )}
  </div>
);
