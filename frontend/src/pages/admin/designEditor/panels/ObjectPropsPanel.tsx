import React from 'react';
import { AppIcon } from '../../../../components/ui/AppIcon';
import type { SelectedObjProps } from '../types';

interface ObjectPropsPanelProps {
  selectedObj: SelectedObjProps | null;
  /** Изменить свойство активного объекта (opacity, fill, stroke, strokeWidth) */
  onSetObjProp: (key: string, value: unknown) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onFlipX: () => void;
  onFlipY: () => void;
  onClose: () => void;
}

export const ObjectPropsPanel: React.FC<ObjectPropsPanelProps> = ({
  selectedObj,
  onSetObjProp,
  onDuplicate,
  onDelete,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
  onFlipX,
  onFlipY,
  onClose,
}) => {
  const hasObj = !!selectedObj;
  const isShape = selectedObj?.type === 'rect' || selectedObj?.type === 'circle' ||
    selectedObj?.type === 'triangle' || selectedObj?.type === 'line';
  const isImage = selectedObj?.type === 'image' || selectedObj?.type === 'photoField';
  const opacity = selectedObj?.opacity ?? 1;
  const fill = (selectedObj?.fill && selectedObj.fill !== 'transparent') ? selectedObj.fill : '#3b82f6';
  const stroke = selectedObj?.stroke ?? 'transparent';
  const strokeWidth = selectedObj?.strokeWidth ?? 0;

  return (
    <div className="design-editor-panel-content">
      <div className="design-editor-panel-header">
        <h3 className="design-editor-panel-title">Объект</h3>
        <button type="button" className="design-editor-panel-close" onClick={onClose} aria-label="Закрыть">
          <AppIcon name="x" size="sm" />
        </button>
      </div>

      {!hasObj && (
        <p className="design-editor-panel-hint">Выберите объект на холсте</p>
      )}

      {hasObj && (
        <>
          {/* Прозрачность */}
          <div className="design-editor-panel-field">
            <label className="design-editor-panel-label">
              Прозрачность: {Math.round(opacity * 100)}%
            </label>
            <input
              type="range"
              className="design-editor-range"
              min={0}
              max={1}
              step={0.01}
              value={opacity}
              onChange={(e) => onSetObjProp('opacity', parseFloat(e.target.value))}
            />
          </div>

          {/* Цвет заливки фигуры */}
          {isShape && (
            <>
              <div className="design-editor-panel-field">
                <label className="design-editor-panel-label">Цвет заливки</label>
                <div className="design-editor-color-row">
                  <input
                    type="color"
                    className="design-editor-color-input design-editor-color-input--large"
                    value={fill}
                    onChange={(e) => onSetObjProp('fill', e.target.value)}
                  />
                  <span className="design-editor-color-value">{fill}</span>
                  <button
                    type="button"
                    className="design-editor-panel-hint-btn"
                    title="Убрать заливку"
                    onClick={() => onSetObjProp('fill', 'transparent')}
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="design-editor-panel-row">
                <div className="design-editor-panel-field design-editor-panel-field--grow">
                  <label className="design-editor-panel-label">Обводка</label>
                  <div className="design-editor-color-row">
                    <input
                      type="color"
                      className="design-editor-color-input design-editor-color-input--large"
                      value={stroke === 'transparent' || !stroke ? '#000000' : stroke}
                      onChange={(e) => onSetObjProp('stroke', e.target.value)}
                    />
                    <button
                      type="button"
                      className="design-editor-panel-hint-btn"
                      title="Убрать обводку"
                      onClick={() => { onSetObjProp('stroke', 'transparent'); onSetObjProp('strokeWidth', 0); }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="design-editor-panel-field design-editor-panel-field--size">
                  <label className="design-editor-panel-label">Толщина</label>
                  <input
                    type="number"
                    className="design-editor-font-size"
                    min={0}
                    max={40}
                    value={strokeWidth}
                    onChange={(e) => onSetObjProp('strokeWidth', parseInt(e.target.value, 10) || 0)}
                  />
                </div>
              </div>
            </>
          )}

          {/* Отражение */}
          {(isShape || isImage) && (
            <div className="design-editor-panel-field">
              <label className="design-editor-panel-label">Отразить</label>
              <div className="design-editor-toolbar-group">
                <button
                  type="button"
                  className={`design-editor-fmt-btn${selectedObj?.flipX ? ' is-active' : ''}`}
                  onClick={onFlipX}
                  title="По горизонтали"
                >
                  ⇔
                </button>
                <button
                  type="button"
                  className={`design-editor-fmt-btn${selectedObj?.flipY ? ' is-active' : ''}`}
                  onClick={onFlipY}
                  title="По вертикали"
                >
                  ⇕
                </button>
              </div>
            </div>
          )}

          {/* Порядок слоёв */}
          <div className="design-editor-panel-field">
            <label className="design-editor-panel-label">Порядок слоёв</label>
            <div className="design-editor-toolbar-group">
              <button type="button" className="design-editor-fmt-btn" onClick={onBringToFront} title="На передний план">▲▲</button>
              <button type="button" className="design-editor-fmt-btn" onClick={onBringForward} title="Поднять на слой">▲</button>
              <button type="button" className="design-editor-fmt-btn" onClick={onSendBackward} title="Опустить на слой">▼</button>
              <button type="button" className="design-editor-fmt-btn" onClick={onSendToBack} title="На задний план">▼▼</button>
            </div>
          </div>

          {/* Действия */}
          <div className="design-editor-panel-field">
            <label className="design-editor-panel-label">Действия</label>
            <div className="design-editor-toolbar-group">
              <button
                type="button"
                className="design-editor-fmt-btn"
                onClick={onDuplicate}
                title="Дублировать (Ctrl+D)"
              >
                <AppIcon name="copy" size="xs" /> Дубль
              </button>
              <button
                type="button"
                className="design-editor-fmt-btn design-editor-fmt-btn--danger"
                onClick={onDelete}
                title="Удалить (Delete)"
              >
                <AppIcon name="trash" size="xs" /> Удалить
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
