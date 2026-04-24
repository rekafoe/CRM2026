/** Стили сводки калькулятора MAP: компактная карточка «стоимость / за шт.» как на витрине. */
export const MINIAPP_SHELL_CALC_SUMMARY_CSS = `
    .ipc-calc-summary { margin-top: 0; }
    .ipc-calc-card {
      background: var(--tg-theme-secondary-bg-color, #f0f4f8);
      border: 1px solid var(--ipc-border, #e2e8f0);
      border-radius: 14px;
      padding: 16px 18px;
      margin-bottom: 12px;
    }
    .ipc-calc-card__line {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px 16px;
    }
    .ipc-calc-card__line--sub { margin-top: 2px; }
    .ipc-calc-card__label {
      font-size: 15px;
      font-weight: 500;
      color: #475569;
    }
    .ipc-calc-card__label--sub {
      font-size: 13px;
      font-weight: 400;
      color: #64748b;
    }
    .ipc-calc-card__value--lg {
      text-align: right;
      font-size: 1.4rem;
      font-weight: 700;
      color: #0d9488;
      line-height: 1.2;
    }
    .ipc-calc-card__value--lg .ipc-byn { font-size: 1em; }
    .ipc-calc-card__value--lg .ipc-byn svg {
      color: inherit;
      min-height: 20px;
      min-width: 17px;
    }
    .ipc-calc-card__value--sub {
      text-align: right;
      font-size: 15px;
      color: #64748b;
    }
    .ipc-calc-card__ppu-amount { white-space: nowrap; }
    .ipc-calc-card__value--sub .ipc-byn svg {
      min-height: 16px;
      min-width: 13px;
    }
    .ipc-calc-card__sep {
      height: 1px;
      background: #d1d5db;
      margin: 12px 0 10px;
      border: 0;
    }
    .ipc-calc-tiers { margin-top: 8px; font-size: 13px; color: #334155; }
    .ipc-calc-tiers summary { cursor: pointer; font-weight: 600; padding: 4px 0; }
    .ipc-calc-tiers__body { margin-top: 6px; }
    .ipc-calc-tiers__row { margin: 4px 0 !important; }
    .ipc-price-type__fieldtitle {
      font-size: 13px;
      font-weight: 600;
      color: var(--tg-theme-text-color, #1e293b);
      margin: 0 0 8px;
    }
    .ipc-price-type__btns {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 8px;
      background: var(--tg-theme-bg-color, #f8fafc);
      border: 1px solid var(--tg-theme-section-separator-color, rgba(120, 120, 120, 0.28));
      border-radius: 12px;
    }
    .ipc-price-type__btn {
      flex: 1 1 auto;
      min-width: 0;
      padding: 10px 12px;
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      line-height: 1.2;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      color: var(--tg-theme-text-color, #0f172a);
      background: transparent;
      -webkit-tap-highlight-color: transparent;
      transition: background 0.15s, color 0.15s;
    }
    .ipc-price-type__btn:focus-visible {
      outline: 2px solid var(--tg-theme-link-color, #00a8c0);
      outline-offset: 2px;
    }
    .ipc-price-type__btn--on {
      color: #fff;
      background: #00b5cc;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
    }
    .ipc-price-type__hint {
      margin: 8px 0 0;
      color: var(--tg-theme-hint-color, #64748b) !important;
    }
    .ipc-field--price-type-help { margin-top: 4px; }
    .ipc-price-diff-accordion {
      border: 1px solid var(--tg-theme-section-separator-color, rgba(120, 120, 120, 0.35));
      border-radius: 12px;
      background: var(--tg-theme-secondary-bg-color, #fff);
      overflow: hidden;
    }
    .ipc-price-diff-accordion__summary {
      list-style: none;
      cursor: pointer;
      padding: 12px 14px;
      font-size: 14px;
      font-weight: 600;
      color: var(--tg-theme-text-color, #1e293b);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      -webkit-tap-highlight-color: transparent;
    }
    .ipc-price-diff-accordion__summary::-webkit-details-marker { display: none; }
    .ipc-price-diff-accordion__summary::after {
      content: '';
      width: 0; height: 0;
      border-left: 5px solid transparent;
      border-right: 5px solid transparent;
      border-top: 6px solid var(--tg-theme-hint-color, #94a3b8);
      flex-shrink: 0;
      transition: transform 0.2s ease;
    }
    .ipc-price-diff-accordion[open] .ipc-price-diff-accordion__summary::after {
      transform: rotate(180deg);
    }
    .ipc-price-diff-accordion__body {
      padding: 0 14px 14px;
      font-size: 13px;
      line-height: 1.45;
      color: var(--tg-theme-text-color, #334155);
    }
    .ipc-price-diff-accordion__section { margin: 0; }
    .ipc-price-diff-accordion__h3 {
      margin: 0 0 6px;
      font-size: 15px;
      font-weight: 700;
      color: var(--tg-theme-text-color, #0f172a);
    }
    .ipc-price-diff-accordion__lead { margin: 0 0 6px; }
    .ipc-price-diff-accordion__list {
      margin: 0 0 10px;
      padding-left: 1.1em;
      list-style: disc;
    }
    .ipc-price-diff-accordion__list li { margin: 4px 0; }
    .ipc-price-diff-accordion__note {
      margin: 0 0 10px;
      padding: 10px 12px;
      background: var(--tg-theme-bg-color, #e9ecef);
      border-radius: 8px;
      font-size: 12px;
      color: var(--tg-theme-hint-color, #475569);
    }
    .ipc-price-diff-accordion__footer {
      margin: 0 0 6px;
      font-size: 13px;
      color: var(--tg-theme-hint-color, #64748b);
    }
    .ipc-price-diff-accordion__footer:last-child { margin-bottom: 0; }
    .ipc-price-diff-accordion__sep {
      height: 1px;
      margin: 12px 0;
      background: var(--tg-theme-section-separator-color, #e2e8f0);
      border: 0;
    }
    .ipc-price-diff-accordion__promo-link-wrap { margin: 0 0 8px; }
    .ipc-price-diff-accordion__promo-link {
      color: #b91c1c;
      font-weight: 600;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
`;
