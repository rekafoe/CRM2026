import React, { useRef, useEffect } from 'react';
import type { StripItem } from './spreadUtils';
import { findStripItemForPage } from './spreadUtils';

interface PageStripProps {
  items: StripItem[];
  currentPage: number;
  thumbnails: Record<number, string>;
  thumbW: number;
  thumbH: number;
  spreadMode: boolean;
  onGoTo: (pageIndex: number) => void;
  onAddSpread: () => void;
  onAddPage: () => void;
  onDeleteLast: () => void;
  canDelete: boolean;
  onSpreadModeToggle: () => void;
  infoLine?: string;
  collapsed?: boolean;
  onCollapse?: () => void;
}

const STRIP_THUMB_H = 82;

export const PageStrip: React.FC<PageStripProps> = ({
  items,
  currentPage,
  thumbnails,
  thumbW,
  thumbH,
  spreadMode,
  onGoTo,
  onAddSpread,
  onAddPage,
  onDeleteLast,
  canDelete,
  onSpreadModeToggle,
  infoLine,
  collapsed = false,
  onCollapse,
}) => {
  const stripRef = useRef<HTMLDivElement>(null);
  const activeIdx = findStripItemForPage(items, currentPage);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const active = strip.querySelector<HTMLElement>('.psitem.is-active');
    if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }, [activeIdx]);

  const ratio = thumbH > 0 ? thumbW / thumbH : 1;
  const singleW = Math.round(STRIP_THUMB_H * ratio);

  return (
    <div className={`ps-root${collapsed ? ' is-collapsed' : ''}`}>
      {/* Заголовок */}
      <div className="ps-header">
        <div className="ps-header-left">
          {onCollapse && (
            <button type="button" className="ps-collapse-btn" onClick={onCollapse}
              title={collapsed ? 'Развернуть' : 'Свернуть'}>
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
            {spreadMode ? 'Менеджер разворотов' : 'Менеджер страниц'}
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
          <div className="ps-mode-toggle" title={spreadMode ? 'Режим разворотов' : 'Режим страниц'}>
            <button
              type="button"
              className={`ps-mode-btn${!spreadMode ? ' is-active' : ''}`}
              onClick={() => spreadMode && onSpreadModeToggle()}
              title="Режим страниц"
            >
              <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
                <rect x="0.75" y="0.75" width="8.5" height="10.5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </button>
            <button
              type="button"
              className={`ps-mode-btn${spreadMode ? ' is-active' : ''}`}
              onClick={() => !spreadMode && onSpreadModeToggle()}
              title="Режим разворотов"
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

      {/* Полоса миниатюр */}
      <div className="ps-strip" ref={stripRef}>
        {items.map((item, idx) => {
          const isActive = idx === activeIdx;
          const isSpread = item.pages.length === 2;
          const thumbsW = isSpread ? singleW * 2 + 2 : singleW;

          return (
            <button
              key={`ps-${idx}`}
              type="button"
              className={`psitem${isActive ? ' is-active' : ''}`}
              onClick={() => onGoTo(item.goToPage)}
              title={item.label}
            >
              <div className="psitem-thumbs" style={{ width: thumbsW, height: STRIP_THUMB_H }}>
                {item.pages.map((pIdx, pi) => (
                  <div
                    key={pIdx}
                    className="psitem-page"
                    style={{ width: singleW, height: STRIP_THUMB_H }}
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
                    {isSpread && pi === 0 && <div className="psitem-spine" />}
                  </div>
                ))}
              </div>
              <span className="psitem-label">{item.label}</span>
            </button>
          );
        })}

        {/* Добавить */}
        <div className="ps-add-wrap">
          <button
            type="button"
            className="ps-add-btn"
            style={{ height: STRIP_THUMB_H }}
            onClick={spreadMode ? onAddSpread : onAddPage}
            title={spreadMode ? 'Добавить разворот' : 'Добавить страницу'}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <circle cx="11" cy="11" r="10" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="11" y1="6" x2="11" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="6" y1="11" x2="16" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span className="ps-add-label">
              {spreadMode ? 'Добавить\nразворот' : 'Добавить\nстраницу'}
            </span>
          </button>

          {canDelete && (
            <button
              type="button"
              className="ps-del-btn"
              onClick={onDeleteLast}
              title={spreadMode ? 'Удалить последний разворот' : 'Удалить последнюю страницу'}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <line x1="1.5" y1="1.5" x2="10.5" y2="10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                <line x1="10.5" y1="1.5" x2="1.5" y2="10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
