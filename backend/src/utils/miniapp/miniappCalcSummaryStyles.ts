/** Стили сводки калькулятора MAP (подключаются к inline-стилям miniapp). */
export const MINIAPP_SHELL_CALC_SUMMARY_CSS = `
    .ipc-calc-summary { margin-top: 0; }
    .ipc-calc-hero {
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
      font-size: 1.05rem; font-weight: 600; color: var(--ipc-slate-900);
      margin-bottom: 12px;
    }
    .ipc-calc-hero__amount { display: inline-flex; align-items: baseline; gap: 0.15em; flex-wrap: wrap; }
    .ipc-calc-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
    .ipc-calc-chips--detail { margin-top: 4px; }
    .ipc-calc-chip {
      font-size: 12px; line-height: 1.35; padding: 6px 10px; border-radius: 10px;
      border: 1px solid var(--ipc-border); background: #f8fafc; color: #334155;
    }
    .ipc-calc-chip--kv { background: #fff; }
    .ipc-calc-chip__lab { font-weight: 600; color: #1e293b; }
    .ipc-calc-chip__val { color: #2563eb; font-weight: 600; }
    .ipc-calc-layout {
      font-size: 13px; color: #2563eb; margin: 10px 0 6px;
    }
    .ipc-calc-tiers { margin-top: 8px; font-size: 13px; color: #334155; }
    .ipc-calc-tiers summary { cursor: pointer; font-weight: 600; padding: 4px 0; }
    .ipc-calc-tiers__body { margin-top: 6px; }
    .ipc-calc-tiers__row { margin: 4px 0 !important; }
`;
