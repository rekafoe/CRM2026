/**
 * Клиент Mini App: аккордеон «Срочно / Промо» (innerHTML из getMiniappClientInlineScript).
 */
export const MINIAPP_CLIENT_PART_PRICE_TYPE_HELP = `
  function buildPriceTypeHelpAccordion() {
    var det = document.createElement('details');
    det.className = 'ipc-price-diff-accordion';
    var sm = document.createElement('summary');
    sm.className = 'ipc-price-diff-accordion__summary';
    sm.textContent = 'Чем отличаются Срочно и Промо?';
    det.appendChild(sm);
    var wrap = document.createElement('div');
    wrap.className = 'ipc-price-diff-accordion__body';
    wrap.innerHTML = typeof MINIAPP_PRICE_TYPE_HELP_INNER !== 'undefined' ? MINIAPP_PRICE_TYPE_HELP_INNER : '';
    det.appendChild(wrap);
    return det;
  }
`;
