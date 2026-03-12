import React from 'react';
import { AppIcon } from '../../../components/ui/AppIcon';
import { Button } from '../../../components/common';
import { TEXT_FONTS } from './constants';
import type { CanvasText, DesignPage } from './types';

interface DesignEditorToolbarProps {
  onAddText: () => void;
  selectedText: CanvasText | null;
  selectedTextId: string | null;
  currentPage: number;
  pages: DesignPage[];
  setPages: React.Dispatch<React.SetStateAction<DesignPage[]>>;
  pageCount: number;
  onPagePrev: () => void;
  onPageNext: () => void;
  setSelectedTextId: (id: string | null) => void;
  showGuides: boolean;
  onGuidesToggle: () => void;
  onSave: () => void;
  saving: boolean;
  hasOrderContext: boolean;
  onExportPdf: () => void;
  exportingPdf: boolean;
  pdfExportProgress: { current: number; total: number } | null;
  onClose: () => void;
}

export const DesignEditorToolbar: React.FC<DesignEditorToolbarProps> = ({
  onAddText,
  selectedText,
  selectedTextId,
  currentPage,
  pages,
  setPages,
  pageCount,
  onPagePrev,
  onPageNext,
  setSelectedTextId,
  showGuides,
  onGuidesToggle,
  onSave,
  saving,
  hasOrderContext,
  onExportPdf,
  exportingPdf,
  pdfExportProgress,
  onClose,
}: DesignEditorToolbarProps) => (
  <div className="design-editor-toolbar">
    <Button variant="secondary" onClick={onAddText}>
      <AppIcon name="edit" size="xs" /> Добавить текст
    </Button>
    {selectedText && (
      <div className="design-editor-text-edit">
        <input
          type="text"
          value={selectedText.text}
          onChange={(e) =>
            setPages((prev) => {
              const next = [...prev];
              const page = next[currentPage] ?? { images: [], texts: [] };
              next[currentPage] = {
                ...page,
                texts: page.texts.map((t) => (t.id === selectedTextId ? { ...t, text: e.target.value } : t)),
              };
              return next;
            })
          }
          placeholder="Текст"
          className="design-editor-text-input"
        />
        <select
          className="design-editor-font-select"
          value={selectedText.fontFamily ?? 'Arial'}
          onChange={(e) =>
            setPages((prev) => {
              const next = [...prev];
              const page = next[currentPage] ?? { images: [], texts: [] };
              next[currentPage] = {
                ...page,
                texts: page.texts.map((t) => (t.id === selectedTextId ? { ...t, fontFamily: e.target.value } : t)),
              };
              return next;
            })
          }
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
            onChange={(e) =>
              setPages((prev) => {
                const next = [...prev];
                const page = next[currentPage] ?? { images: [], texts: [] };
                next[currentPage] = {
                  ...page,
                  texts: page.texts.map((t) =>
                    t.id === selectedTextId ? { ...t, fontSize: parseInt(e.target.value, 10) || 24 } : t
                  ),
                };
                return next;
              })
            }
          />
        </label>
      </div>
    )}
    {pageCount > 1 && (
      <div className="design-editor-pages">
        <span className="design-editor-pages-label">Страница</span>
        <button
          type="button"
          className="design-editor-page-btn"
          onClick={onPagePrev}
          disabled={currentPage === 0}
          title="Предыдущая"
          aria-label="Предыдущая страница"
        >
          <AppIcon name="arrow-left" size="xs" />
        </button>
        <span className="design-editor-page-num">
          {currentPage + 1} / {pageCount}
        </span>
        <button
          type="button"
          className="design-editor-page-btn design-editor-page-btn--next"
          onClick={onPageNext}
          disabled={currentPage >= pageCount - 1}
          title="Следующая"
          aria-label="Следующая страница"
        >
          <span className="design-editor-page-btn-icon-next"><AppIcon name="arrow-left" size="xs" /></span>
        </button>
      </div>
    )}
    <span title="Линия обрезки и безопасная зона (важный контент внутри)">
      <Button variant={showGuides ? 'primary' : 'secondary'} onClick={onGuidesToggle}>
        <AppIcon name="scissors" size="xs" /> Зоны обрезки
      </Button>
    </span>
    <Button variant="secondary" onClick={onSave} disabled={saving}>
      <AppIcon name="save" size="xs" /> {hasOrderContext ? (saving ? 'Сохранение…' : 'Сохранить в заказ') : 'Сохранить'}
    </Button>
    <span title="Скачать весь макет (все страницы) в один PDF">
      <Button variant="secondary" onClick={onExportPdf} disabled={exportingPdf}>
        <AppIcon name="document" size="xs" />
        {exportingPdf
          ? pdfExportProgress
            ? `Экспорт PDF… ${pdfExportProgress.current}/${pdfExportProgress.total}`
            : 'Экспорт PDF…'
          : 'Экспорт в PDF'}
      </Button>
    </span>
    <Button variant="secondary" onClick={onClose}>
      Закрыть
    </Button>
  </div>
);
