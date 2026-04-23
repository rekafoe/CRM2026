import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SimplifiedTemplateSidebar, type SimplifiedTemplateSidebarProps } from './SimplifiedTemplateSidebar';
import './SimplifiedTemplateSidebarDrawer.css';

type Props = SimplifiedTemplateSidebarProps;

/**
 * Сайдбар упрощённого шаблона: по умолчанию скрыт, открывается плашкой слева (как авто-резка в услугах).
 */
export const SimplifiedTemplateSidebarDrawer: React.FC<Props> = (props) => {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  const handleClose = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, handleClose]);

  return (
    <>
      <button
        type="button"
        className="simplified-tpl-rail"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Продукт, типы бумаги, опции калькулятора, route"
      >
        <span className="simplified-tpl-rail__icon" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </span>
        <span className="simplified-tpl-rail__label">Продукт</span>
      </button>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="simplified-tpl-drawer-root product-template product-template--admin-layout"
            role="presentation"
          >
            <button
              type="button"
              className="simplified-tpl-drawer__backdrop"
              aria-label="Закрыть"
              onClick={handleClose}
            />
            <div
              className="simplified-tpl-drawer__panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
            >
              <div className="simplified-tpl-drawer__head">
                <h2 className="simplified-tpl-drawer__title" id={titleId}>
                  Продукт и настройки
                </h2>
                <button
                  ref={closeRef}
                  type="button"
                  className="simplified-tpl-drawer__close"
                  onClick={handleClose}
                  aria-label="Закрыть панель"
                >
                  ×
                </button>
              </div>
              <div className="simplified-tpl-drawer__body">
                <div className="simplified-tpl-drawer__host product-template__body--simplified-with-sidebar">
                  <SimplifiedTemplateSidebar {...props} />
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default SimplifiedTemplateSidebarDrawer;
