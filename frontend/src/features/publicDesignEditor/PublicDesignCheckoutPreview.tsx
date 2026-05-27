import React from 'react';
import { Button } from '../../components/common';
import type { PublicEditorPreflightIssue, PublicEditorPreflightSummary } from './publicDesignPreflight';
import {
  buildCheckoutPreviewItems,
  checkoutPreviewHasSpreads,
  type CheckoutPreviewItem,
} from './buildCheckoutPreviewItems';
import type { StripItem } from '../../pages/admin/designEditor/spreadUtils';

interface PublicDesignCheckoutPreviewProps {
  open: boolean;
  stripItems: StripItem[];
  thumbnails: Record<number, string>;
  preflight: PublicEditorPreflightSummary;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onIssueFocus?: (issue: PublicEditorPreflightIssue) => void;
}

function CheckoutPageThumb({ pageIndex, thumbnails }: { pageIndex: number; thumbnails: Record<number, string> }) {
  const src = thumbnails[pageIndex];
  if (src) {
    return <img src={src} alt="" />;
  }
  return <div className="public-design-editor__checkout-page-empty">Нет превью</div>;
}

function CheckoutPreviewFigure({ item, thumbnails }: { item: CheckoutPreviewItem; thumbnails: Record<number, string> }) {
  const isSpread = item.pages.length === 2;

  return (
    <figure
      className={`public-design-editor__checkout-page${isSpread ? ' public-design-editor__checkout-page--spread' : ''}`}
    >
      {isSpread ? (
        <div className="public-design-editor__checkout-page-spread" aria-hidden="true">
          {item.pages.map((pageIndex, halfIndex) => (
            <div key={pageIndex} className="public-design-editor__checkout-page-half">
              <CheckoutPageThumb pageIndex={pageIndex} thumbnails={thumbnails} />
              <span className="public-design-editor__checkout-page-half-label">
                {halfIndex === 0 ? 'Левая' : 'Правая'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <CheckoutPageThumb pageIndex={item.pages[0]} thumbnails={thumbnails} />
      )}
      <figcaption>{item.label}</figcaption>
    </figure>
  );
}

export const PublicDesignCheckoutPreview: React.FC<PublicDesignCheckoutPreviewProps> = ({
  open,
  stripItems,
  thumbnails,
  preflight,
  saving,
  onClose,
  onConfirm,
  onIssueFocus,
}) => {
  if (!open) return null;

  const previewItems = buildCheckoutPreviewItems(stripItems);
  const hasSpreads = checkoutPreviewHasSpreads(previewItems);
  const warnings = preflight.issues.filter((issue) => issue.level === 'warning');
  const errors = preflight.issues.filter((issue) => issue.level === 'error');

  const pagesAriaLabel = hasSpreads ? 'Миниатюры страниц и разворотов' : 'Миниатюры страниц';
  const okSubtitle = hasSpreads
    ? 'Проверьте обложки, развороты и страницы — порядок как в редакторе.'
    : 'Макет сохранён и выглядит готовым к заказу.';

  return (
    <div className="public-design-editor__checkout-preview" role="dialog" aria-modal="true" aria-label="Проверка макета перед заказом">
      <div className="public-design-editor__checkout-card">
        <header className="public-design-editor__checkout-head">
          <div>
            <span>Перед заказом</span>
            <h2>{errors.length > 0 ? 'Нужно исправить макет' : hasSpreads ? 'Проверьте развороты' : 'Проверьте страницы'}</h2>
            <p>
              {errors.length > 0
                ? 'Есть обязательные ошибки. Нажмите пункт ниже, чтобы вернуться к месту исправления.'
                : warnings.length > 0
                  ? 'Заказ возможен, но лучше открыть предупреждения и проверить качество.'
                  : okSubtitle}
            </p>
          </div>
          <button type="button" className="public-design-editor__checkout-close" onClick={onClose}>
            Закрыть
          </button>
        </header>

        <div className="public-design-editor__checkout-pages" aria-label={pagesAriaLabel}>
          {previewItems.map((item) => (
            <CheckoutPreviewFigure key={item.key} item={item} thumbnails={thumbnails} />
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
