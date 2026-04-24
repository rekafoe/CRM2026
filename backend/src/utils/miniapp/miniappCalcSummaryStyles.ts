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
    .ipc-calc-card__value--lg .ipc-byn svg { color: inherit; }
    .ipc-calc-card__value--sub {
      text-align: right;
      font-size: 15px;
      color: #64748b;
    }
    .ipc-calc-card__sep {
      height: 1px;
      background: #d1d5db;
      margin: 12px 0 10px;
      border: 0;
    }
    .ipc-calc-details {
      margin-top: 10px;
      font-size: 13px;
      color: #334155;
    }
    .ipc-calc-details summary {
      cursor: pointer;
      font-weight: 600;
      padding: 6px 0;
      color: #475569;
    }
    .ipc-calc-details__body { margin-top: 4px; padding-left: 2px; }
    .ipc-calc-line { margin: 4px 0; line-height: 1.4; }
    .ipc-calc-tiers { margin-top: 8px; font-size: 13px; color: #334155; }
    .ipc-calc-tiers summary { cursor: pointer; font-weight: 600; padding: 4px 0; }
    .ipc-calc-tiers__body { margin-top: 6px; }
    .ipc-calc-tiers__row { margin: 4px 0 !important; }
`;
