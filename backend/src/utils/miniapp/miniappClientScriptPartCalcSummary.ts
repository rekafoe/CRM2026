/**
 * Mini App: блок «сводка расчёта» в калькуляторе (чипы, знак BYN, раскладка, tier_prices).
 */
export const MINIAPP_CLIENT_PART_CALC_SUMMARY = `
  function bynFormatNum(n) {
    var v = Math.round(Number(n) * 100) / 100;
    if (!isFinite(v)) return '—';
    return v.toFixed(2).replace('.', ',');
  }
  function appendCalcResultSummaryUI(container, r) {
    var card = h('div', '', 'ipc-calc-card');
    var line1 = h('div', '', 'ipc-calc-card__line');
    line1.appendChild(h('span', 'Стоимость:', 'ipc-calc-card__label'));
    var valLg = h('div', '', 'ipc-calc-card__value--lg');
    valLg.innerHTML =
      '<span class="ipc-calc-card__sum">' + esc(bynFormatNum(r.finalPrice)) + bynSpanHtml() + '</span>';
    line1.appendChild(valLg);
    card.appendChild(line1);
    card.appendChild(h('div', '', 'ipc-calc-card__sep'));
    var line2 = h('div', '', 'ipc-calc-card__line ipc-calc-card__line--sub');
    line2.appendChild(h('span', 'За 1 шт.', 'ipc-calc-card__label ipc-calc-card__label--sub'));
    var valSub = h('div', '', 'ipc-calc-card__value--sub');
    var ppu0 = r.pricePerUnit != null && isFinite(Number(r.pricePerUnit)) ? Number(r.pricePerUnit) : NaN;
    if (!isFinite(ppu0) && r.finalPrice != null && r.quantity > 0) {
      ppu0 = Number(r.finalPrice) / Number(r.quantity);
    }
    valSub.innerHTML =
      '<span class="ipc-calc-card__ppu-amount">' +
      esc(bynFormatNum(isFinite(ppu0) ? ppu0 : NaN)) +
      bynSpanHtml() +
      '</span>';
    line2.appendChild(valSub);
    card.appendChild(line2);
    container.appendChild(card);
    if (r.tier_prices && r.tier_prices.length) {
      var det = document.createElement('details');
      det.className = 'ipc-calc-tiers';
      var sm = document.createElement('summary');
      sm.textContent = 'Тиражные скидки (за ед.)';
      det.appendChild(sm);
      var tb = h('div', '', 'ipc-calc-tiers__body');
      for (var ti = 0; ti < r.tier_prices.length; ti++) {
        var tp = r.tier_prices[ti];
        var rlo = tp.min_qty != null ? String(tp.min_qty) : '';
        var rhi = tp.max_qty != null ? String(tp.max_qty) : '…';
        var up = tp.unit_price != null ? Math.round(Number(tp.unit_price) * 10000) / 10000 : null;
        var numStr = up != null && isFinite(up) ? String(up).replace('.', ',') : null;
        var pr = h('p', '', 'hint ipc-calc-tiers__row');
        pr.innerHTML = esc(rlo + ' — ' + rhi + ' шт.: ') + (numStr != null ? (esc(numStr) + bynSpanHtml() + esc('/ед.')) : '—');
        tb.appendChild(pr);
      }
      det.appendChild(tb);
      container.appendChild(det);
    }
  }
`;
