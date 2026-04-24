/**
 * Mini App: блок «сводка расчёта» в калькуляторе (чипы, знак BYN, раскладка, tier_prices).
 */
export const MINIAPP_CLIENT_PART_CALC_SUMMARY = `
  function bynFormatNum(n) {
    var v = Math.round(Number(n) * 100) / 100;
    if (!isFinite(v)) return '—';
    return v.toFixed(2).replace('.', ',');
  }
  function printSidesRuCalc() {
    var p = parsePrintKey();
    if (p.sides === 'duplex' || p.sides === 'duplex_bw_back') return 'двусторонняя';
    if (p.sides === 'single') return 'односторонняя';
    return String(p.sides || '—');
  }
  function priceTypeLabelCalc() {
    var pts = calcAllowedPriceTypes();
    var k = String(out.calcForm.priceType || '');
    for (var i = 0; i < pts.length; i++) {
      if (String(pts[i].key) === k) return String(pts[i].label || k);
    }
    return k || '';
  }
  function appendCalcResultSummaryUI(container, r) {
    var card = h('div', '', 'ipc-calc-card');
    var line1 = h('div', '', 'ipc-calc-card__line');
    line1.appendChild(h('span', 'Стоимость:', 'ipc-calc-card__label'));
    var valLg = h('div', '', 'ipc-calc-card__value--lg');
    valLg.innerHTML = '<span class="ipc-calc-card__sum">' + esc(bynFormatNum(r.finalPrice)) + '</span>' + bynSpanHtml();
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
    valSub.innerHTML = esc(bynFormatNum(isFinite(ppu0) ? ppu0 : NaN)) + bynSpanHtml();
    line2.appendChild(valSub);
    card.appendChild(line2);
    container.appendChild(card);
    var detP = document.createElement('details');
    detP.className = 'ipc-calc-details';
    var smP = document.createElement('summary');
    smP.textContent = 'Параметры';
    detP.appendChild(smP);
    var bodyP = h('div', '', 'ipc-calc-details__body');
    var q0 = r.quantity != null ? r.quantity : '—';
    bodyP.appendChild(h('p', 'Количество: ' + q0 + ' шт.', 'hint ipc-calc-line'));
    bodyP.appendChild(h('p', 'Стороны: ' + printSidesRuCalc(), 'hint ipc-calc-line'));
    var ptl0 = priceTypeLabelCalc();
    if (ptl0) bodyP.appendChild(h('p', 'Тип цены: ' + ptl0, 'hint ipc-calc-line'));
    var params = buildCalcCartParams();
    var sum = params && Array.isArray(params.parameterSummary) ? params.parameterSummary : [];
    for (var si = 0; si < sum.length; si++) {
      var it = sum[si];
      if (!it || it.label == null || it.label === '') continue;
      bodyP.appendChild(
        h('p', esc(String(it.label)) + ': ' + esc(String(it.value != null ? it.value : '')), 'hint ipc-calc-line')
      );
    }
    var lay = r.layout || {};
    var ips = lay.itemsPerSheet != null ? lay.itemsPerSheet : (r.itemsPerSheet != null ? r.itemsPerSheet : null);
    var sh = lay.sheetsNeeded != null ? lay.sheetsNeeded : (r.sheetsNeeded != null ? r.sheetsNeeded : null);
    if (ips != null || sh != null) {
      var parts = [];
      if (sh != null) parts.push('листов: ' + sh);
      if (ips != null) parts.push('на листе: ' + ips + ' шт.');
      bodyP.appendChild(h('p', 'Раскладка: ' + parts.join(', '), 'hint ipc-calc-line'));
    }
    detP.appendChild(bodyP);
    container.appendChild(detP);
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
