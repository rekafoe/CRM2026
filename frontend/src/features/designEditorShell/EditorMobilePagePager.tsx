import React, { useMemo } from 'react';
import { findStripItemForPage, type StripItem } from '../../pages/admin/designEditor/spreadUtils';
import type { PageStripStatus } from '../../pages/admin/designEditor/PageStrip';
import './editorMobilePagePager.css';

const PAGER_THUMB_H = 64;

interface EditorMobilePagePagerProps {
  items: StripItem[];
  currentPage: number;
  thumbnails: Record<number, string>;
  thumbW: number;
  thumbH: number;
  pageStatuses?: Record<number, PageStripStatus>;
  canAddSpread?: boolean;
  addSpreadLabel?: string;
  /** Макет с разворотами, но на телефоне показываем постранично */
  pagesOnlyHint?: string;
  onGoTo: (pageIndex: number) => void;
  onAddSpread?: () => void;
}

export const EditorMobilePagePager: React.FC<EditorMobilePagePagerProps> = ({
  items,
  currentPage,
  thumbnails,
  thumbW,
  thumbH,
  pageStatuses,
  canAddSpread = false,
  addSpreadLabel = 'Добавить разворот',
  pagesOnlyHint,
  onGoTo,
  onAddSpread,
}) => {
  const activeIdx = findStripItemForPage(items, currentPage);
  const activeItem = activeIdx >= 0 ? items[activeIdx] : null;
  const ratio = thumbH > 0 ? thumbW / thumbH : 1;
  const singleW = Math.round(PAGER_THUMB_H * ratio);

  const prevItem = activeIdx > 0 ? items[activeIdx - 1] : null;
  const nextItem = activeIdx >= 0 && activeIdx < items.length - 1 ? items[activeIdx + 1] : null;

  const status = useMemo(() => {
    if (!activeItem || !pageStatuses) return null;
    const statuses = activeItem.pages.map((pageIndex) => pageStatuses[pageIndex]).filter(Boolean);
    if (statuses.length === 0) return null;
    const errorStatus = statuses.find((item) => item.tone === 'error');
    if (errorStatus) return errorStatus;
    const warningStatus = statuses.find((item) => item.tone === 'warning');
    if (warningStatus) return warningStatus;
    return { tone: 'ready' as const, label: 'Готово' };
  }, [activeItem, pageStatuses]);

  if (!activeItem || items.length === 0) return null;

  const thumbsW = singleW;

  return (
    <div className="editor-mobile-page-pager" aria-label="Навигация по страницам макета">
      {pagesOnlyHint ? (
        <p className="editor-mobile-page-pager__hint">{pagesOnlyHint}</p>
      ) : null}
      <div className="editor-mobile-page-pager__head">
        <strong className="editor-mobile-page-pager__title">{activeItem.label}</strong>
        <span className="editor-mobile-page-pager__counter">
          {activeIdx + 1}
          {' / '}
          {items.length}
        </span>
        {status && (
          <span className={`editor-mobile-page-pager__status editor-mobile-page-pager__status--${status.tone}`}>
            {status.label}
          </span>
        )}
      </div>

      <div className="editor-mobile-page-pager__controls">
        <button
          type="button"
          className="editor-mobile-page-pager__nav"
          disabled={!prevItem}
          aria-label="Предыдущая страница"
          onClick={() => prevItem && onGoTo(prevItem.goToPage)}
        >
          ‹
        </button>

        <div className="editor-mobile-page-pager__preview" aria-hidden>
          <div className="editor-mobile-page-pager__thumbs" style={{ width: thumbsW, height: PAGER_THUMB_H }}>
            {thumbnails[activeItem.pages[0]] ? (
              <img
                src={thumbnails[activeItem.pages[0]]}
                alt=""
                className="editor-mobile-page-pager__img"
                draggable={false}
              />
            ) : (
              <div className="editor-mobile-page-pager__blank" />
            )}
          </div>
        </div>

        <button
          type="button"
          className="editor-mobile-page-pager__nav"
          disabled={!nextItem}
          aria-label="Следующая страница"
          onClick={() => nextItem && onGoTo(nextItem.goToPage)}
        >
          ›
        </button>
      </div>

      {canAddSpread && onAddSpread && (
        <button
          type="button"
          className="editor-mobile-page-pager__add"
          onClick={onAddSpread}
        >
          <span className="editor-mobile-page-pager__add-icon" aria-hidden>+</span>
          {addSpreadLabel}
        </button>
      )}
    </div>
  );
};
