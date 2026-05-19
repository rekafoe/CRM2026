import React from 'react';
import { Button } from '../../components/common';
import type { PublicEditorPreflightIssue, PublicEditorPreflightSummary } from './publicDesignPreflight';

interface PublicDesignCheckoutPreviewProps {
  open: boolean;
  thumbnails: Record<number, string>;
  pageCount: number;
  preflight: PublicEditorPreflightSummary;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onIssueFocus?: (issue: PublicEditorPreflightIssue) => void;
}

export const PublicDesignCheckoutPreview: React.FC<PublicDesignCheckoutPreviewProps> = ({
  open,
  thumbnails,
  pageCount,
  preflight,
  saving,
  onClose,
  onConfirm,
  onIssueFocus,
}) => {
  if (!open) return null;
  const warnings = preflight.issues.filter((issue) => issue.level === 'warning');
  const errors = preflight.issues.filter((issue) => issue.level === 'error');
  const pages = Array.from({ length: pageCount }, (_, pageIndex) => pageIndex);

  return (
    <div className="public-design-editor__checkout-preview" role="dialog" aria-modal="true" aria-label="Проверка макета перед заказом">
      <div className="public-design-editor__checkout-card">
        <header className="public-design-editor__checkout-head">
          <div>
            <span>Перед заказом</span>
            <h2>{errors.length > 0 ? 'Нужно исправить макет' : 'Проверьте страницы'}</h2>
            <p>
              {errors.length > 0
                ? 'Есть обязательные ошибки. Нажмите пункт ниже, чтобы вернуться к месту исправления.'
                : warnings.length > 0
                  ? 'Заказ возможен, но лучше открыть предупреждения и проверить качество.'
                  : 'Макет сохранён и выглядит готовым к заказу.'}
            </p>
          </div>
          <button type="button" className="public-design-editor__checkout-close" onClick={onClose}>
            Закрыть
          </button>
        </header>

        <div className="public-design-editor__checkout-pages" aria-label="Миниатюры страниц">
          {pages.map((pageIndex) => (
            <figure key={pageIndex} className="public-design-editor__checkout-page">
              {thumbnails[pageIndex] ? (
                <img src={thumbnails[pageIndex]} alt={`Страница ${pageIndex + 1}`} />
              ) : (
                <div className="public-design-editor__checkout-page-empty">Нет превью</div>
              )}
              <figcaption>Страница {pageIndex + 1}</figcaption>
            </figure>
          ))}
        </div>

        {(errors.length > 0 || warnings.length > 0) && (
          <section className="public-design-editor__checkout-issues">
            <strong>{errors.length > 0 ? 'Что исправить' : 'Что проверить'}</strong>
            <span>Нажмите на пункт, чтобы вернуться к нужному месту в макете.</span>
            {preflight.issues.slice(0, 6).map((issue) => (
              <button
                key={issue.id}
                type="button"
                className={`public-design-editor__checkout-issue public-design-editor__checkout-issue--${issue.level}`}
                onClick={() => {
                  onClose();
                  onIssueFocus?.(issue);
                }}
              >
                {issue.message}
              </button>
            ))}
          </section>
        )}

        <footer className="public-design-editor__checkout-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Вернуться к редактору
          </Button>
          <Button type="button" variant="primary" onClick={onConfirm} disabled={saving || errors.length > 0}>
            {saving ? 'Готовим...' : 'Подтвердить и перейти к заказу'}
          </Button>
        </footer>
      </div>
    </div>
  );
};
