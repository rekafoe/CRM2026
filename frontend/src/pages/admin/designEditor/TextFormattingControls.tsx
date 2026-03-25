import React from 'react';
import { AppIcon } from '../../../components/ui/AppIcon';
import { TEXT_FONTS } from './constants';
import type { SelectedObjProps } from './types';
import { TEXT_PRESET_STYLE, textPresetIdFromSelection } from './textFormattingPresets';
import './TextFloatingToolbar.css';
import './TextFormattingControls.css';

export interface TextFormattingHandlers {
  onFontChange: (fontFamily: string) => void;
  onFontSizeChange: (size: number) => void;
  onTextColorChange: (color: string) => void;
  onFontVariantChange: (fontWeight: string, fontStyle: string) => void;
  onFontWeightToggle: () => void;
  onFontStyleToggle: () => void;
  onUnderlineToggle: () => void;
  onTextAlignChange: (align: string) => void;
  onLineHeightChange: (lineHeight: number) => void;
  onDuplicate: () => void;
  onBringForward: () => void;
  onDelete: () => void;
}

interface TextFormattingControlsProps extends TextFormattingHandlers {
  selectedObj: SelectedObjProps;
  variant: 'floating' | 'panel';
  /** Позиция только для variant=floating */
  floatingStyle?: React.CSSProperties;
  onFloatingMouseDown?: (e: React.SyntheticEvent) => void;
  /** Выравнивание: в панели по умолчанию с «по ширине» */
  alignOptions?: ('left' | 'center' | 'right' | 'justify')[];
}

export const TextFormattingControls: React.FC<TextFormattingControlsProps> = ({
  selectedObj,
  variant,
  floatingStyle,
  onFloatingMouseDown,
  alignOptions,
  onFontChange,
  onFontSizeChange,
  onTextColorChange,
  onFontVariantChange,
  onFontWeightToggle,
  onFontStyleToggle,
  onUnderlineToggle,
  onTextAlignChange,
  onLineHeightChange,
  onDuplicate,
  onBringForward,
  onDelete,
}) => {
  const size = Math.round(selectedObj.fontSize ?? 24);
  const fill =
    selectedObj.fill && selectedObj.fill !== 'transparent' ? selectedObj.fill : '#000000';
  const lineHeight = selectedObj.lineHeight ?? 1.16;
  const lineHeightSnap = [1, 1.15, 1.16, 1.35, 1.5, 2].reduce(
    (best, cur) => (Math.abs(cur - lineHeight) < Math.abs(best - lineHeight) ? cur : best),
    1,
  );
  const preset = textPresetIdFromSelection(selectedObj);
  const isBold = selectedObj.fontWeight === 'bold';
  const isItalic = selectedObj.fontStyle === 'italic';

  const aligns =
    alignOptions ??
    (variant === 'panel' ? (['left', 'center', 'right', 'justify'] as const) : (['left', 'center', 'right'] as const));

  const bumpSize = (d: number) => {
    const next = Math.min(200, Math.max(6, size + d));
    onFontSizeChange(next);
  };

  const alignTitle = (align: string) =>
    align === 'left'
      ? 'По левому краю'
      : align === 'center'
        ? 'По центру'
        : align === 'right'
          ? 'По правому краю'
          : 'По ширине';

  const alignGlyph = (align: string) =>
    align === 'left' ? '⬅' : align === 'center' ? '↔' : align === 'right' ? '➡' : '⇔';

  const controls = (
    <>
      <select
        className="text-floating-toolbar__select text-floating-toolbar__select--font"
        value={selectedObj.fontFamily ?? TEXT_FONTS[0].value}
        onChange={(e) => onFontChange(e.target.value)}
        title="Шрифт"
      >
        {TEXT_FONTS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      <select
        className="text-floating-toolbar__select text-floating-toolbar__select--narrow"
        value={preset}
        onChange={(e) => {
          const p = TEXT_PRESET_STYLE.find((x) => x.id === e.target.value);
          if (p) onFontVariantChange(p.fontWeight, p.fontStyle);
        }}
        title="Начертание"
      >
        {TEXT_PRESET_STYLE.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>

      <div className="text-floating-toolbar__size">
        <input
          type="number"
          className="text-floating-toolbar__size-input"
          min={6}
          max={200}
          value={size}
          onChange={(e) => onFontSizeChange(parseInt(e.target.value, 10) || size)}
          title="Размер шрифта"
        />
        <div className="text-floating-toolbar__size-step">
          <button type="button" className="text-floating-toolbar__step" onClick={() => bumpSize(1)} title="Крупнее">
            +
          </button>
          <button type="button" className="text-floating-toolbar__step" onClick={() => bumpSize(-1)} title="Мельче">
            −
          </button>
        </div>
      </div>

      <button
        type="button"
        className={`text-floating-toolbar__icon-btn${isBold ? ' is-active' : ''}`}
        onClick={onFontWeightToggle}
        title="Жирный"
      >
        <strong>Ж</strong>
      </button>
      <button
        type="button"
        className={`text-floating-toolbar__icon-btn${isItalic ? ' is-active' : ''}`}
        onClick={onFontStyleToggle}
        title="Курсив"
      >
        <em>К</em>
      </button>
      <button
        type="button"
        className={`text-floating-toolbar__icon-btn${selectedObj.underline ? ' is-active' : ''}`}
        onClick={onUnderlineToggle}
        title="Подчёркнутый"
      >
        <span className="text-floating-toolbar__ul">Ч</span>
      </button>

      <label className="text-floating-toolbar__color" title="Цвет">
        <input type="color" value={fill} onChange={(e) => onTextColorChange(e.target.value)} />
        <span className="text-floating-toolbar__color-swatch" style={{ background: fill }} />
      </label>

      <select
        className="text-floating-toolbar__select text-floating-toolbar__select--tight"
        value={String(lineHeightSnap)}
        onChange={(e) => onLineHeightChange(parseFloat(e.target.value))}
        title="Межстрочный интервал"
      >
        <option value="1">1</option>
        <option value="1.15">1,15</option>
        <option value="1.16">1,16</option>
        <option value="1.35">1,35</option>
        <option value="1.5">1,5</option>
        <option value="2">2</option>
      </select>

      <div className="text-floating-toolbar__align">
        {aligns.map((align) => (
          <button
            key={align}
            type="button"
            className={`text-floating-toolbar__icon-btn${selectedObj.textAlign === align ? ' is-active' : ''}`}
            onClick={() => onTextAlignChange(align)}
            title={alignTitle(align)}
          >
            {alignGlyph(align)}
          </button>
        ))}
      </div>

      <button type="button" className="text-floating-toolbar__fx" disabled title="Скоро">
        <span className="text-floating-toolbar__wand" aria-hidden>
          ✦
        </span>
        Эффекты
      </button>

      <span className="text-floating-toolbar__sep" aria-hidden />

      <button type="button" className="text-floating-toolbar__icon-btn" onClick={onDuplicate} title="Дублировать">
        <AppIcon name="copy" size="xs" />
      </button>
      <button type="button" className="text-floating-toolbar__icon-btn" onClick={onBringForward} title="Слой вверх">
        <AppIcon name="layers" size="xs" />
      </button>
      <button
        type="button"
        className="text-floating-toolbar__icon-btn text-floating-toolbar__icon-btn--danger"
        onClick={onDelete}
        title="Удалить"
      >
        <AppIcon name="trash" size="xs" />
      </button>
    </>
  );

  if (variant === 'floating') {
    return (
      <div
        className="text-floating-toolbar"
        style={floatingStyle}
        role="toolbar"
        aria-label="Форматирование текста"
        onMouseDown={onFloatingMouseDown}
      >
        {controls}
      </div>
    );
  }

  return (
    <div className="text-panel-format" role="group" aria-label="Форматирование текста">
      <div className="text-panel-format__row text-panel-format__row--2col">
        <div className="text-panel-format__field">
          <span className="text-panel-format__label">Шрифт</span>
          <select
            className="text-panel-format__select"
            value={selectedObj.fontFamily ?? TEXT_FONTS[0].value}
            onChange={(e) => onFontChange(e.target.value)}
          >
            {TEXT_FONTS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div className="text-panel-format__field">
          <span className="text-panel-format__label">Начертание</span>
          <select
            className="text-panel-format__select"
            value={preset}
            onChange={(e) => {
              const p = TEXT_PRESET_STYLE.find((x) => x.id === e.target.value);
              if (p) onFontVariantChange(p.fontWeight, p.fontStyle);
            }}
          >
            {TEXT_PRESET_STYLE.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="text-panel-format__row">
        <span className="text-panel-format__label">Размер</span>
        <div className="text-panel-format__size">
          <input
            type="number"
            className="text-panel-format__size-input"
            min={6}
            max={200}
            value={size}
            onChange={(e) => onFontSizeChange(parseInt(e.target.value, 10) || size)}
          />
          <div className="text-panel-format__size-step">
            <button type="button" className="text-panel-format__step" onClick={() => bumpSize(1)}>
              +
            </button>
            <button type="button" className="text-panel-format__step" onClick={() => bumpSize(-1)}>
              −
            </button>
          </div>
        </div>
      </div>

      <div className="text-panel-format__row">
        <span className="text-panel-format__label">Стиль</span>
        <div className="text-panel-format__btn-row">
          <button
            type="button"
            className={`text-panel-format__fmt${isBold ? ' is-active' : ''}`}
            onClick={onFontWeightToggle}
            title="Жирный"
          >
            <strong>Ж</strong>
          </button>
          <button
            type="button"
            className={`text-panel-format__fmt${isItalic ? ' is-active' : ''}`}
            onClick={onFontStyleToggle}
            title="Курсив"
          >
            <em>К</em>
          </button>
          <button
            type="button"
            className={`text-panel-format__fmt${selectedObj.underline ? ' is-active' : ''}`}
            onClick={onUnderlineToggle}
            title="Подчёркнутый"
          >
            <span style={{ textDecoration: 'underline' }}>Ч</span>
          </button>
        </div>
      </div>

      <div className="text-panel-format__row text-panel-format__row--2col">
        <div className="text-panel-format__field">
          <span className="text-panel-format__label">Цвет</span>
          <div className="text-panel-format__color-row">
            <input
              type="color"
              className="text-panel-format__color"
              value={fill}
              onChange={(e) => onTextColorChange(e.target.value)}
            />
            <span className="text-panel-format__color-hex">{fill}</span>
          </div>
        </div>
        <div className="text-panel-format__field">
          <span className="text-panel-format__label">Интервал</span>
          <select
            className="text-panel-format__select"
            value={String(lineHeightSnap)}
            onChange={(e) => onLineHeightChange(parseFloat(e.target.value))}
          >
            <option value="1">1</option>
            <option value="1.15">1,15</option>
            <option value="1.16">1,16</option>
            <option value="1.35">1,35</option>
            <option value="1.5">1,5</option>
            <option value="2">2</option>
          </select>
        </div>
      </div>

      <div className="text-panel-format__row">
        <span className="text-panel-format__label">Выравнивание</span>
        <div className="text-panel-format__btn-row">
          {aligns.map((align) => (
            <button
              key={align}
              type="button"
              className={`text-panel-format__fmt${selectedObj.textAlign === align ? ' is-active' : ''}`}
              onClick={() => onTextAlignChange(align)}
              title={alignTitle(align)}
            >
              {alignGlyph(align)}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className="text-panel-format__fx" disabled>
        ✦ Эффекты (скоро)
      </button>

      <div className="text-panel-format__row">
        <span className="text-panel-format__label">Объект</span>
        <div className="text-panel-format__btn-row text-panel-format__btn-row--actions">
          <button type="button" className="text-panel-format__action" onClick={onDuplicate} title="Дублировать">
            <AppIcon name="copy" size="xs" /> Дублировать
          </button>
          <button type="button" className="text-panel-format__action" onClick={onBringForward} title="Слой вверх">
            <AppIcon name="layers" size="xs" /> Слой вверх
          </button>
          <button
            type="button"
            className="text-panel-format__action text-panel-format__action--danger"
            onClick={onDelete}
            title="Удалить"
          >
            <AppIcon name="trash" size="xs" /> Удалить
          </button>
        </div>
      </div>
    </div>
  );
};
