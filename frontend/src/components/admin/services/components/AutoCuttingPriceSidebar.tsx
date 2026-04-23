import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AutoCuttingPriceSection } from './AutoCuttingPriceSection';
import './AutoCuttingPriceSidebar.css';

/**
 * Сайдбар: цена авто-резки скрыта по умолчанию, открывается по клику на плашку.
 */
export const AutoCuttingPriceSidebar: React.FC = () => {
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
        className="sm-ac-rail"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Настройка цены автоматической резки"
      >
        <span className="sm-ac-rail__icon" aria-hidden>
          ✂
        </span>
        <span className="sm-ac-rail__label">Авто-резка</span>
      </button>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="sm-ac-sidebar-root services-management"
            role="presentation"
          >
            <button
              type="button"
              className="sm-ac-sidebar__backdrop"
              aria-label="Закрыть"
              onClick={handleClose}
            />
            <aside
              className="sm-ac-sidebar__panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
            >
              <div className="sm-ac-sidebar__head">
                <h2 className="sm-ac-sidebar__title" id={titleId}>
                  Цена авто-резки
                </h2>
                <button
                  ref={closeRef}
                  type="button"
                  className="sm-ac-sidebar__close"
                  onClick={handleClose}
                  aria-label="Закрыть панель"
                >
                  ×
                </button>
              </div>
              <div className="sm-ac-sidebar__body">
                <AutoCuttingPriceSection />
              </div>
            </aside>
          </div>,
          document.body
        )}
    </>
  );
};

export default AutoCuttingPriceSidebar;
