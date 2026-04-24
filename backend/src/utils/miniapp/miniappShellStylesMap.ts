/**
 * Стили сетки каталога (MAP); знак рубля — инлайн-SVG в `bynSpanHtml()`.
 */
export function getMiniappMapAndBynShellCss() {
  return `
    .catalog-grid.ipc-catalog-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
    }
    @media (min-width: 420px) {
      .catalog-grid.ipc-catalog-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
    }
    .ipc-catalog-card.card.ipc-card {
      display: flex;
      flex-direction: column;
      aspect-ratio: 1;
      min-width: 0;
      min-height: 0;
      margin-bottom: 0;
      padding: 10px 10px 12px;
      overflow: hidden;
      transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
    }
    .ipc-catalog-card:hover {
      border-color: var(--tg-theme-hint-color, #94a3b8);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
      transform: translateY(-1px);
    }
    .ipc-catalog-card__title {
      flex-shrink: 0;
      margin-bottom: 6px;
      font-size: 14px;
      font-weight: 600;
      color: var(--tg-theme-text-color, #1e293b);
      line-height: 1.25;
      max-height: 2.55em;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .ipc-catalog-card__media {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 0 6px;
      border-radius: 10px;
      background: var(--tg-theme-bg-color, #f1f5f9);
      overflow: hidden;
    }
    .ipc-catalog-card__media--empty {
      flex: 0 0 40px;
      min-height: 40px;
    }
    .ipc-catalog-card__img {
      width: 100%;
      height: 100%;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      display: block;
    }
    .ipc-catalog-card__desc {
      flex: 0 1 auto;
      font-size: 11px;
      line-height: 1.35;
      color: var(--tg-theme-hint-color, var(--ipc-slate-500));
      margin: 0 0 6px;
      max-height: 2.75em;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .ipc-catalog-card .card-price { flex-shrink: 0; margin-top: auto; font-size: 14px; }
    .ipc-catalog-card__price-amount { font-size: inherit; white-space: nowrap; }
    .ipc-catalog-card__btn { width: 100%; box-sizing: border-box; flex-shrink: 0; margin-top: 6px; }
    .ipc-subhead {
      font-size: 0.95rem;
      font-weight: 700;
      margin: 20px 0 10px;
      color: var(--tg-theme-text-color, var(--ipc-slate-900));
      letter-spacing: -0.02em;
    }
    .ipc-detail-block {
      padding: 14px 16px;
    }
    .ipc-detail-block .ipc-result { margin-top: 0; }
    .ipc-list__row--cart .row { margin-top: 0; }
    h2.section-head, h3.section-head { margin-top: 0; }
    /* Знак BYN: em привязываем к наследуемому кеглю строки; min-* — страховка в Telegram WebView. */
    .ipc-byn {
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
      margin-left: 0.12ch;
      line-height: 1;
      vertical-align: -0.06em;
      font-size: inherit;
    }
    .ipc-byn svg {
      display: block;
      flex-shrink: 0;
      height: 1.1em;
      width: 0.92em;
      min-height: 14px;
      min-width: 12px;
      transform: translateY(0.04em);
    }
    .ipc-design-help-row { margin: 10px 0; }
    .ipc-design-help {
      display: flex; align-items: center; gap: 10px; font-size: 14px; line-height: 1.4;
      color: var(--tg-theme-text-color, #1e293b); cursor: pointer; user-select: none;
    }
    .ipc-design-help input[type="checkbox"] {
      width: 22px; height: 22px; min-width: 22px; min-height: 22px; margin: 0;
      flex-shrink: 0; cursor: pointer; accent-color: #2563eb;
      -webkit-appearance: auto; appearance: auto;
    }
    .ipc-checkout-design-note, .ipc-checkout-design-hint { line-height: 1.45; }
    .ipc-checkout-validate { color: #b91c1c; font-weight: 500; }
  `;
}
