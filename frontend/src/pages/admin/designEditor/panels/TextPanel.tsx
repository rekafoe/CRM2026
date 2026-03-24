import React from 'react';
import { AppIcon } from '../../../../components/ui/AppIcon';
import { Button } from '../../../../components/common';
import { TEXT_FONTS } from '../constants';
import type { SelectedObjProps } from '../types';

interface TextPanelProps {
  onAddText: () => void;
  selectedObj: SelectedObjProps | null;
  onTextChange: (text: string) => void;
  onFontChange: (fontFamily: string) => void;
  onFontSizeChange: (fontSize: number) => void;
  onTextColorChange: (color: string) => void;
  onFontWeightToggle: () => void;
  onFontStyleToggle: () => void;
  onUnderlineToggle: () => void;
  onTextAlignChange: (align: string) => void;
  onClose: () => void;
}

export const TextPanel: React.FC<TextPanelProps> = ({
  onAddText,
  selectedObj,
  onTextChange,
  onFontChange,
  onFontSizeChange,
  onTextColorChange,
  onFontWeightToggle,
  onFontStyleToggle,
  onUnderlineToggle,
  onTextAlignChange,
  onClose,
}) => {
  const isText = selectedObj?.type === 'IText';

  return (
    <div className="design-editor-panel-content">
      <div className="design-editor-panel-header">
        <h3 className="design-editor-panel-title">Текст</h3>
        <button
          type="button"
          className="design-editor-panel-close"
          onClick={onClose}
          aria-label="Закрыть"
        >
          <AppIcon name="x" size="sm" />
        </button>
      </div>

      <Button variant="primary" onClick={onAddText} className="design-editor-panel-add-text">
        <AppIcon name="plus" size="xs" /> Добавить текст
      </Button>

      {isText && (
        <div className="design-editor-text-panel-edit">
          {/* Содержимое текста */}
          <div className="design-editor-panel-field">
            <label className="design-editor-panel-label">Текст</label>
            <textarea
              className="design-editor-text-input design-editor-text-textarea"
              value={selectedObj.text ?? ''}
              onChange={(e) => onTextChange(e.target.value)}
              rows={3}
              placeholder="Введите текст..."
            />
          </div>

          {/* Шрифт и размер */}
          <div className="design-editor-panel-row">
            <div className="design-editor-panel-field design-editor-panel-field--grow">
              <label className="design-editor-panel-label">Шрифт</label>
              <select
                className="design-editor-font-select"
                value={selectedObj.fontFamily ?? 'Arial'}
                onChange={(e) => onFontChange(e.target.value)}
              >
                {TEXT_FONTS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="design-editor-panel-field design-editor-panel-field--size">
              <label className="design-editor-panel-label">Размер</label>
              <input
                type="number"
                className="design-editor-font-size"
                min={6}
                max={200}
                value={selectedObj.fontSize ?? 24}
                onChange={(e) => onFontSizeChange(parseInt(e.target.value, 10) || 24)}
              />
            </div>
          </div>

          {/* Цвет */}
          <div className="design-editor-panel-field">
            <label className="design-editor-panel-label">Цвет текста</label>
            <div className="design-editor-color-row">
              <input
                type="color"
                className="design-editor-color-input design-editor-color-input--large"
                value={
                  selectedObj.fill && selectedObj.fill !== 'transparent'
                    ? selectedObj.fill
                    : '#000000'
                }
                onChange={(e) => onTextColorChange(e.target.value)}
              />
              <span className="design-editor-color-value">
                {selectedObj.fill && selectedObj.fill !== 'transparent'
                  ? selectedObj.fill
                  : '#000000'}
              </span>
            </div>
          </div>

          {/* Стиль текста */}
          <div className="design-editor-panel-field">
            <label className="design-editor-panel-label">Начертание</label>
            <div className="design-editor-toolbar-group">
              <button
                type="button"
                className={`design-editor-fmt-btn${selectedObj.fontWeight === 'bold' ? ' is-active' : ''}`}
                onClick={onFontWeightToggle}
                title="Жирный"
              >
                <strong>Ж</strong>
              </button>
              <button
                type="button"
                className={`design-editor-fmt-btn${selectedObj.fontStyle === 'italic' ? ' is-active' : ''}`}
                onClick={onFontStyleToggle}
                title="Курсив"
              >
                <em>К</em>
              </button>
              <button
                type="button"
                className={`design-editor-fmt-btn${selectedObj.underline ? ' is-active' : ''}`}
                onClick={onUnderlineToggle}
                title="Подчёркнутый"
              >
                <span style={{ textDecoration: 'underline' }}>Ч</span>
              </button>
            </div>
          </div>

          {/* Выравнивание */}
          <div className="design-editor-panel-field">
            <label className="design-editor-panel-label">Выравнивание</label>
            <div className="design-editor-toolbar-group">
              {(['left', 'center', 'right', 'justify'] as const).map((align) => (
                <button
                  key={align}
                  type="button"
                  className={`design-editor-fmt-btn${selectedObj.textAlign === align ? ' is-active' : ''}`}
                  onClick={() => onTextAlignChange(align)}
                  title={
                    align === 'left'
                      ? 'По левому краю'
                      : align === 'center'
                        ? 'По центру'
                        : align === 'right'
                          ? 'По правому краю'
                          : 'По ширине'
                  }
                >
                  {align === 'left' ? '⬅' : align === 'center' ? '↔' : align === 'right' ? '➡' : '⇔'}
                </button>
              ))}
            </div>
          </div>

          <p className="design-editor-panel-hint">
            Двойной клик по тексту на холсте — редактировать напрямую
          </p>
        </div>
      )}

      {!isText && (
        <p className="design-editor-panel-hint">Выберите текстовый объект на холсте</p>
      )}
    </div>
  );
};
