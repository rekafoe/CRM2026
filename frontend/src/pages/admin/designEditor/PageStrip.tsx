import React, { useCallback, useRef, useEffect, useState } from 'react';
import type { StripItem } from './spreadUtils';
import { findStripItemForPage } from './spreadUtils';
import './PageStrip.css';

export interface PageStripStatus {
  tone: 'ready' | 'warning' | 'error';
  label: string;
}

export interface PageStripLabels {
  titlePages?: string;
  titleSpreads?: string;
  addPage?: string;
  addSpread?: string;
  deletePage?: string;
  deleteSpread?: string;
  pagesMode?: string;
  spreadsMode?: string;
  collapse?: string;
  expand?: string;
}

interface PageStripProps {
  items: StripItem[];
  currentPage: number;
  thumbnails: Record<number, string>;
  thumbW: number;
  thumbH: number;
  spreadMode: boolean;
  onGoTo: (pageIndex: number) => void | Promise<void>;
  onAddSpread: () => void | Promise<void>;
  onAddPage: () => void | Promise<void>;
  onInsertPage?: (pageIndex: number) => void | Promise<void>;
  onDeletePage?: (pageIndex: number) => void | Promise<void>;
  onDeleteLast: () => void | Promise<void>;
  canDelete: boolean;
  canAdd?: boolean;
  canAddPage?: boolean;
  canAddSpread?: boolean;
  onSpreadModeToggle: () => void;
  infoLine?: string;
  collapsed?: boolean;
  onCollapse?: () => void;
  pageStatuses?: Record<number, PageStripStatus>;
  titleLabel?: string;
  labels?: PageStripLabels;
  /** Компактная полоса для мобильного редактора */
  compact?: boolean;
  /** Светлая полоса клиентского редактора (без админской тёмной темы) */
  appearance?: 'admin' | 'client';
  transitionBusy?: boolean;
}

const DEFAULT_STRIP_THUMB_H = 82;
const CLIENT_STRIP_THUMB_H = 96;
const COMPACT_STRIP_THUMB_H = 56;

export const PageStrip: React.FC<PageStripProps> = ({
  items,
  currentPage,
  thumbnails,
  thumbW,
  thumbH,
  spreadMode,
  compact = false,
  appearance = 'admin',
  onGoTo,
  onAddSpread,
  onAddPage,
  onInsertPage,
  onDeletePage,
  onDeleteLast,
  canDelete,
  canAdd = true,
  canAddPage,
  canAddSpread,
  onSpreadModeToggle,
  infoLine,
  collapsed = false,
  onCollapse,
  pageStatuses,
  titleLabel,
  labels,
  transitionBusy = false,
}) => {
  const stripRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  /** Перед какой страницей показана кнопка вставки */
  const [openInsertBefore, setOpenInsertBefore] = useState<number | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [addConfirmArmed, setAddConfirmArmed] = useState(false);
  const addConfirmTimerRef = useRef<number | null>(null);
  const activeIdx = findStripItemForPage(items, currentPage);
  const stripThumbH = compact
    ? COMPACT_STRIP_THUMB_H
    : appearance === 'client'
      ? CLIENT_STRIP_THUMB_H
      : DEFAULT_STRIP_THUMB_H;

  const updateScrollState = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const maxScroll = strip.scrollWidth - strip.clientWidth;
    setCanScrollLeft(strip.scrollLeft > 2);
    setCanScrollRight(strip.scrollLeft < maxScroll - 2);
  }, []);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const active = strip.querySelector<HTMLElement>('.psitem.is-active');
    if (active) {
      // Только горизонтальная прокрутка полосы — scrollIntoView двигает всю страницу и «уносит» топбар.
      const targetLeft = active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2;
      strip.scrollTo({ left: Math.max(0, targetLeft), behavior: 'auto' });
    }
    window.setTimeout(updateScrollState, 180);
  }, [activeIdx, compact, updateScrollState]);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return undefined;
    const handleWheel = (event: WheelEvent) => {
      if (strip.scrollWidth <= strip.clientWidth) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (delta === 0) return;
      event.preventDefault();
      strip.scrollLeft += delta;
    };
    updateScrollState();
    strip.addEventListener('scroll', updateScrollState, { passive: true });
    strip.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('resize', updateScrollState);
    return () => {
      strip.removeEventListener('scroll', updateScrollState);
      strip.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [items.length, updateScrollState]);

  const ratio = thumbH > 0 ? thumbW / thumbH : 1;
  const singleW = Math.round(stripThumbH * ratio);
  const allowAddPage = canAddPage ?? canAdd;
  const allowAddSpread = canAddSpread ?? canAdd;
  const canAddCurrentMode = spreadMode ? allowAddSpread : allowAddPage;
  const lastInsertIndex = items.length > 0 ? Math.max(...items.flatMap((item) => item.pages)) + 1 : 0;
  const isBusy = actionBusy || transitionBusy;
  const runStripAction = useCallback((action: () => void | Promise<void>) => {
    if (isBusy) return;
    setActionBusy(true);
    void Promise.resolve(action()).finally(() => {
      setActionBusy(false);
    });
  }, [isBusy]);

  const handleAddAtEnd = () => {
    if (appearance === 'client' && !addConfirmArmed) {
      setAddConfirmArmed(true);
      if (addConfirmTimerRef.current != null) window.clearTimeout(addConfirmTimerRef.current);
      addConfirmTimerRef.current = window.setTimeout(() => {
        setAddConfirmArmed(false);
        addConfirmTimerRef.current = null;
      }, 2200);
      return;
    }
    if (addConfirmTimerRef.current != null) {
      window.clearTimeout(addConfirmTimerRef.current);
      addConfirmTimerRef.current = null;
    }
    setAddConfirmArmed(false);
    if (spreadMode) {
      runStripAction(onAddSpread);
      return;
    }
    if (onAddPage) {
      runStripAction(onAddPage);
      return;
    }
    if (onInsertPage) runStripAction(() => onInsertPage(lastInsertIndex));
  };

  useEffect(() => {
    return () => {
      if (addConfirmTimerRef.current != null) {
        window.clearTimeout(addConfirmTimerRef.current);
      }
    };
  }, []);
  const handleStripScroll = (direction: -1 | 1) => {
    const strip = stripRef.current;
    if (!strip) return;
    strip.scrollBy({ left: direction * Math.max(180, Math.round(strip.clientWidth * 0.55)), behavior: 'smooth' });
  };

  return (
    <div className={`ps-root${collapsed ? ' is-collapsed' : ''}${compact ? ' ps-root--compact' : ''}${appearance === 'client' ? ' ps-root--client' : ''}${isBusy ? ' is-busy' : ''}`}>
      {/* Заголовок */}
      <div className="ps-header">
        <div className="ps-header-left">
          {onCollapse && (
            <button type="button" className="ps-collapse-btn" onClick={onCollapse}
              title={collapsed ? (labels?.expand ?? 'Развернуть') : (labels?.collapse ?? 'Свернуть')}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
          {spreadMode ? (
            <svg className="ps-header-icon" width="16" height="12" viewBox="0 0 16 12" fill="none">
              <rect x="0.75" y="0.75" width="6.5" height="10.5" rx="1.25" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="8.75" y="0.75" width="6.5" height="10.5" rx="1.25" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="8" y1="2" x2="8" y2="10" stroke="currentColor" strokeWidth="1" strokeDasharray="1.5 1.5"/>
            </svg>
          ) : (
            <svg className="ps-header-icon" width="10" height="12" viewBox="0 0 10 12" fill="none">
              <rect x="0.75" y="0.75" width="8.5" height="10.5" rx="1.25" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          )}
          <span className="ps-header-title">
            {titleLabel ?? (spreadMode ? (labels?.titleSpreads ?? 'Менеджер разворотов') : (labels?.titlePages ?? 'Менеджер страниц'))}
          </span>
          <span className="ps-header-count">
            {spreadMode
              ? `${items.length - 1 > 0 ? items.length - 1 : 0} разв.`
              : `${items.length} стр.`}
          </span>
        </div>

        {infoLine && (
          <span className="ps-header-info">{infoLine}</span>
        )}

        <div className="ps-header-right">
          {/* Переключатель режима */}
          <div className="ps-mode-toggle" title={spreadMode ? (labels?.spreadsMode ?? 'Режим разворотов') : (labels?.pagesMode ?? 'Режим страниц')}>
            <button
              type="button"
              className={`ps-mode-btn${!spreadMode ? ' is-active' : ''}`}
              onClick={() => spreadMode && onSpreadModeToggle()}
              title={labels?.pagesMode ?? 'Режим страниц'}
            >
              <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
                <rect x="0.75" y="0.75" width="8.5" height="10.5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </button>
            <button
              type="button"
              className={`ps-mode-btn${spreadMode ? ' is-active' : ''}`}
              onClick={() => !spreadMode && onSpreadModeToggle()}
              title={labels?.spreadsMode ?? 'Режим разворотов'}
            >
              <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
                <rect x="0.75" y="0.75" width="6.5" height="10.5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="8.75" y="0.75" width="6.5" height="10.5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="8" y1="2" x2="8" y2="10" stroke="currentColor" strokeWidth="1" strokeDasharray="1.5 1.5"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="ps-strip-row">
        <button
          type="button"
          className="ps-scroll-btn ps-scroll-btn--left"
          onClick={() => handleStripScroll(-1)}
          disabled={!canScrollLeft}
          aria-label="Прокрутить страницы влево"
          title="Прокрутить страницы влево"
        >
          ‹
        </button>

        {/* Полоса миниатюр */}
        <div
          className="ps-strip"
          ref={stripRef}
          style={{
            ['--ps-thumb-h' as string]: `${stripThumbH}px`,
            ['--ps-insert-offset-y' as string]: '4px',
          }}
        >
          {items.map((item, idx) => {
            const isActive = idx === activeIdx;
            const isSpread = item.pages.length === 2;
            const thumbsW = isSpread ? singleW * 2 + 2 : singleW;
            const itemStatus = resolveStripItemStatus(item.pages, pageStatuses);
            const itemTitle = itemStatus ? `${item.label}: ${itemStatus.label}` : item.label;
            const insertIndex = item.pages[0];
            const canDeleteItem = canDelete && onDeletePage && item.pages.length === 1;
            const deleteAction = canDeleteItem ? (
              <button
                type="button"
                className="psitem-delete"
                onClick={() => runStripAction(() => onDeletePage(item.pages[0]))}
                disabled={isBusy}
                title={`Удалить ${item.label}`}
                aria-label={`Удалить ${item.label}`}
              >
                ×
              </button>
            ) : null;

            const showInsert = idx > 0 && typeof onInsertPage === 'function';
            const pageTile = (
              <div className={`psitem${isActive ? ' is-active' : ''}`} title={itemTitle}>
                {deleteAction}
                <button
                  type="button"
                  className="psitem-main"
                  onClick={() => runStripAction(() => onGoTo(item.goToPage))}
                  disabled={isBusy}
                >
                  <div
                    className={`psitem-thumbs${isSpread ? ' psitem-thumbs--spread' : ''}`}
                    style={{ width: thumbsW, height: stripThumbH }}
                  >
                    {item.pages.map((pIdx) => (
                      <div
                        key={pIdx}
                        className="psitem-page"
                        style={{ width: singleW, height: stripThumbH }}
                      >
                        {thumbnails[pIdx] ? (
                          <img
                            src={thumbnails[pIdx]}
                            alt=""
                            className="psitem-img"
                            draggable={false}
                          />
                        ) : (
                          <div className="psitem-blank">
                            <svg width="16" height="20" viewBox="0 0 16 20" fill="none" opacity="0.3">
                              <rect x="1" y="1" width="14" height="18" rx="2" stroke="#888" strokeWidth="1.5"/>
                              <line x1="4" y1="7" x2="12" y2="7" stroke="#888" strokeWidth="1"/>
                              <line x1="4" y1="10" x2="12" y2="10" stroke="#888" strokeWidth="1"/>
                              <line x1="4" y1="13" x2="9" y2="13" stroke="#888" strokeWidth="1"/>
                            </svg>
                          </div>
                        )}
                        {pageStatuses?.[pIdx] && (
                          <span
                            className={`psitem-status psitem-status--${pageStatuses[pIdx].tone}`}
                            aria-label={pageStatuses[pIdx].label}
                          />
                        )}
                      </div>
                    ))}
                    {isSpread && <div className="psitem-spine" aria-hidden="true" />}
                  </div>
                  <span className="psitem-label" style={{ maxWidth: thumbsW }} title={item.label}>
                    {item.label}
                  </span>
                  {itemStatus && <span className={`psitem-status-label psitem-status-label--${itemStatus.tone}`}>{itemStatus.label}</span>}
                </button>
                {isActive && canDeleteItem && (
                  <button
                    type="button"
                    className="psitem-delete-action"
                    onClick={() => runStripAction(() => onDeletePage(item.pages[0]))}
                    disabled={isBusy}
                  >
                    Удалить
                  </button>
                )}
              </div>
            );

            if (!showInsert) {
              return <React.Fragment key={`ps-${idx}`}>{pageTile}</React.Fragment>;
            }

            const insertOpen = openInsertBefore === insertIndex;
            const showGapInsert = () => setOpenInsertBefore(insertIndex);
            const hideGapInsert = (event: React.PointerEvent<HTMLElement>) => {
              const related = event.relatedTarget;
              if (related instanceof Node && event.currentTarget.contains(related)) return;
              setOpenInsertBefore((prev) => (prev === insertIndex ? null : prev));
            };
            const handleInsertClick = (event: React.MouseEvent<HTMLButtonElement>) => {
              event.preventDefault();
              event.stopPropagation();
              setOpenInsertBefore(null);
              if (onInsertPage) runStripAction(() => onInsertPage(insertIndex));
            };

            return (
              <div key={`ps-${idx}`} className="ps-strip-pair">
                <div
                  className={`ps-strip-gap${insertOpen ? ' is-active' : ''}`}
                  onPointerEnter={showGapInsert}
                  onPointerLeave={hideGapInsert}
                >
                  <button
                    type="button"
                    className="ps-insert-btn"
                    onClick={handleInsertClick}
                    disabled={isBusy}
                    title={`Вставить страницу перед ${item.label}`}
                    aria-label={`Вставить страницу перед ${item.label}`}
                  >
                    <svg className="ps-insert-icon" viewBox="0 0 24 24" aria-hidden>
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                {pageTile}
              </div>
            );
          })}
        </div>

        {canAddCurrentMode && (
          <div className="ps-add-wrap">
            <button
              type="button"
              className={`psitem psitem--add${addConfirmArmed ? ' psitem--add-armed' : ''}`}
              onClick={handleAddAtEnd}
              disabled={isBusy}
              title={addConfirmArmed
                ? 'Нажмите еще раз для подтверждения'
                : spreadMode
                  ? (labels?.addSpread ?? 'Добавить разворот')
                  : (labels?.addPage ?? 'Добавить страницу')}
            >
              <span className="psitem-main">
                <span className="psitem-thumbs ps-add-thumbs" style={{ width: singleW, height: stripThumbH }}>
                  <span className="ps-add-symbol">+</span>
                </span>
                <span className="psitem-label">
                  {addConfirmArmed
                    ? 'Подтвердите добавление'
                    : spreadMode
                      ? (labels?.addSpread ?? 'Добавить разворот')
                      : (labels?.addPage ?? 'Добавить страницу')}
                </span>
                <span className="psitem-status-label psitem-status-label--add">Новая</span>
              </span>
            </button>
          </div>
        )}

        {canDelete && !onDeletePage && (
          <button
            type="button"
            className="ps-del-btn"
            onClick={() => runStripAction(onDeleteLast)}
            disabled={isBusy}
            title={spreadMode ? (labels?.deleteSpread ?? 'Удалить последний разворот') : (labels?.deletePage ?? 'Удалить последнюю страницу')}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <line x1="1.5" y1="1.5" x2="10.5" y2="10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              <line x1="10.5" y1="1.5" x2="1.5" y2="10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        )}

        <button
          type="button"
          className="ps-scroll-btn ps-scroll-btn--right"
          onClick={() => handleStripScroll(1)}
          disabled={!canScrollRight}
          aria-label="Прокрутить страницы вправо"
          title="Прокрутить страницы вправо"
        >
          ›
        </button>
      </div>
    </div>
  );
};

function resolveStripItemStatus(
  pages: number[],
  pageStatuses?: Record<number, PageStripStatus>,
): PageStripStatus | null {
  if (!pageStatuses) return null;
  const statuses = pages.map((pageIndex) => pageStatuses[pageIndex]).filter(Boolean);
  if (statuses.length === 0) return null;
  const errorStatus = statuses.find((status) => status.tone === 'error');
  if (errorStatus) return errorStatus;
  const warningStatus = statuses.find((status) => status.tone === 'warning');
  if (warningStatus) return warningStatus;
  return { tone: 'ready', label: 'Готово' };
}
