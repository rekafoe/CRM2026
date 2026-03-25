import React from 'react';
import { AppIcon } from '../../../components/ui/AppIcon';
import { Button } from '../../../components/common';
import { TEXT_FONTS } from './constants';
import type { SelectedObjProps } from './types';
import type { EditorMode } from './DesignEditorCanvas';

interface DesignEditorToolbarProps {
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  onAddText: () => void;
  selectedObj: SelectedObjProps | null;
  currentPage: number;
  pageCount: number;
  onPagePrev: () => void;
  onPageNext: () => void;
  showGuides: boolean;
  onGuidesToggle: () => void;
  onSave: () => void;
  saving: boolean;
  hasOrderContext: boolean;
  onExportPdf: () => void;
  exportingPdf: boolean;
  onClose: () => void;
  // History
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  // Edit
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;
  // Zoom
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  // Text formatting
  onFontChange: (fontFamily: string) => void;
  onFontSizeChange: (size: number) => void;
  onTextColorChange: (color: string) => void;
  onFontWeightToggle: () => void;
  onFontStyleToggle: () => void;
  onUnderlineToggle: () => void;
  onTextAlignChange: (align: string) => void;
  /** Скрыть блок форматирования текста (плавающая панель над текстом) */
  suppressTextFormat?: boolean;
}

export const DesignEditorToolbar: React.FC<DesignEditorToolbarProps> = ({
  mode,
  onModeChange,
  onAddText,
  selectedObj,
  currentPage,
  pageCount,
  onPagePrev,
  onPageNext,
  showGuides,
  onGuidesToggle,
  onSave,
  saving,
  hasOrderContext,
  onExportPdf,
  exportingPdf,
  onClose,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onDeleteSelected,
  onDuplicateSelected,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onFontChange,
  onFontSizeChange,
  onTextColorChange,
  onFontWeightToggle,
  onFontStyleToggle,
  onUnderlineToggle,
  onTextAlignChange,
  suppressTextFormat = false,
}) => {
  const isText = selectedObj?.type === 'IText';
  const isBasic = mode === 'basic';

  return (
    <div className="design-editor-toolbar">
      {/* ── Режим basic: упрощённая панель ── */}
      {isBasic && (
        <>
          <span className="design-editor-toolbar-mode-badge">Режим заполнения</span>
          <span title="Открыть полный редактор">
            <Button variant="secondary" onClick={() => onModeChange('advanced')}>
              <AppIcon name="edit" size="xs" /> Расширенный режим
            </Button>
          </span>
          <div className="design-editor-toolbar-divider" />
        </>
      )}

      {/* ── История (только в advanced) ── */}
      {!isBasic && <div className="design-editor-toolbar-group">
        <button
          type="button"
          className="design-editor-toolbar-icon-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Отменить (Ctrl+Z)"
        >
          <AppIcon name="arrow-left" size="xs" />
        </button>
        <button
          type="button"
          className="design-editor-toolbar-icon-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="Повторить (Ctrl+Y)"
          style={{ transform: 'scaleX(-1)' }}
        >
          <AppIcon name="arrow-left" size="xs" />
        </button>
        <button
          type="button"
          className="design-editor-toolbar-icon-btn"
          onClick={onDuplicateSelected}
          title="Дублировать (Ctrl+D)"
        >
          <AppIcon name="copy" size="xs" />
        </button>
        <button
          type="button"
          className="design-editor-toolbar-icon-btn"
          onClick={onDeleteSelected}
          title="Удалить выбранное (Delete)"
        >
          <AppIcon name="x" size="xs" />
        </button>
      </div>}

      {!isBasic && <div className="design-editor-toolbar-divider" />}

      {/* ── Текст (только в advanced) ── */}
      {!isBasic && (
      <Button variant="secondary" onClick={onAddText}>
        <AppIcon name="edit" size="xs" /> Текст
      </Button>
      )}

      {/* ── Форматирование текста ── */}
      {isText && !suppressTextFormat && (
        <div className="design-editor-toolbar-group design-editor-text-format">
          <select
            className="design-editor-font-select"
            value={selectedObj.fontFamily ?? 'Arial'}
            onChange={(e) => onFontChange(e.target.value)}
            title="Шрифт"
          >
            {TEXT_FONTS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            className="design-editor-font-size"
            min={6}
            max={200}
            value={selectedObj.fontSize ?? 24}
            onChange={(e) => onFontSizeChange(parseInt(e.target.value, 10) || 24)}
            title="Размер шрифта"
          />
          <input
            type="color"
            className="design-editor-color-input"
            value={selectedObj.fill && selectedObj.fill !== 'transparent' ? selectedObj.fill : '#000000'}
            onChange={(e) => onTextColorChange(e.target.value)}
            title="Цвет текста"
          />
          <button
            type="button"
            className={`design-editor-toolbar-icon-btn design-editor-fmt-btn${selectedObj.fontWeight === 'bold' ? ' is-active' : ''}`}
            onClick={onFontWeightToggle}
            title="Жирный"
          >
            <strong>Ж</strong>
          </button>
          <button
            type="button"
            className={`design-editor-toolbar-icon-btn design-editor-fmt-btn${selectedObj.fontStyle === 'italic' ? ' is-active' : ''}`}
            onClick={onFontStyleToggle}
            title="Курсив"
          >
            <em>К</em>
          </button>
          <button
            type="button"
            className={`design-editor-toolbar-icon-btn design-editor-fmt-btn${selectedObj.underline ? ' is-active' : ''}`}
            onClick={onUnderlineToggle}
            title="Подчёркнутый"
          >
            <span style={{ textDecoration: 'underline' }}>Ч</span>
          </button>
          <div className="design-editor-toolbar-group design-editor-align-group">
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                type="button"
                className={`design-editor-toolbar-icon-btn${selectedObj.textAlign === align ? ' is-active' : ''}`}
                onClick={() => onTextAlignChange(align)}
                title={align === 'left' ? 'По левому краю' : align === 'center' ? 'По центру' : 'По правому краю'}
              >
                {align === 'left' ? '⬅' : align === 'center' ? '↔' : '➡'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="design-editor-toolbar-divider" />

      {/* ── Страницы ── */}
      {pageCount > 1 && (
        <div className="design-editor-pages">
          <span className="design-editor-pages-label">Стр.</span>
          <button
            type="button"
            className="design-editor-page-btn"
            onClick={onPagePrev}
            disabled={currentPage === 0}
            title="Предыдущая страница"
          >
            <AppIcon name="arrow-left" size="xs" />
          </button>
          <span className="design-editor-page-num">
            {currentPage + 1} / {pageCount}
          </span>
          <button
            type="button"
            className="design-editor-page-btn"
            onClick={onPageNext}
            disabled={currentPage >= pageCount - 1}
            title="Следующая страница"
            style={{ transform: 'scaleX(-1)' }}
          >
            <AppIcon name="arrow-left" size="xs" />
          </button>
        </div>
      )}

      {/* ── Зум (только в advanced) ── */}
      {!isBasic && <div className="design-editor-toolbar-group design-editor-zoom-group">
        <button
          type="button"
          className="design-editor-toolbar-icon-btn"
          onClick={onZoomOut}
          title="Уменьшить"
        >
          −
        </button>
        <button
          type="button"
          className="design-editor-zoom-label"
          onClick={onZoomReset}
          title="Сбросить масштаб"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          className="design-editor-toolbar-icon-btn"
          onClick={onZoomIn}
          title="Увеличить"
        >
          +
        </button>
      </div>}

      {!isBasic && <div className="design-editor-toolbar-divider" />}

      {/* ── Виды / экспорт ── */}
      <span title="Линия обрезки и безопасная зона">
        <Button variant={showGuides ? 'primary' : 'secondary'} onClick={onGuidesToggle}>
          <AppIcon name="scissors" size="xs" /> Зоны
        </Button>
      </span>

      <Button variant="secondary" onClick={onSave} disabled={saving}>
        <AppIcon name="save" size="xs" />
        {hasOrderContext ? (saving ? 'Сохранение…' : 'В заказ') : 'Сохранить'}
      </Button>

      <span title="Скачать все страницы в PDF">
        <Button variant="secondary" onClick={onExportPdf} disabled={exportingPdf}>
          <AppIcon name="document" size="xs" />
          {exportingPdf ? 'Экспорт…' : 'PDF'}
        </Button>
      </span>

      <Button variant="secondary" onClick={onClose}>
        Закрыть
      </Button>
    </div>
  );
};
