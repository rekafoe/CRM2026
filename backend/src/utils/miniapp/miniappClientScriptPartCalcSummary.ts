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
    var hero = h('div', '', 'ipc-calc-hero');
    hero.appendChild(document.createTextNode('Стоимость: '));
    var valWrap = h('span', '', 'ipc-calc-hero__amount');
    valWrap.innerHTML = '<strong>' + esc(bynFormatNum(r.finalPrice)) + '</strong>' + bynSpanHtml();
    hero.appendChild(valWrap);
    container.appendChild(hero);
    var row1 = h('div', '', 'ipc-calc-chips');
    function addChipWithMoney(lab, n) {
      var d = document.createElement('div');
      d.className = 'ipc-calc-chip';
      d.innerHTML = esc(lab) + bynFormatNum(n) + bynSpanHtml();
      row1.appendChild(d);
    }
    addChipWithMoney('За штуку: ', r.pricePerUnit);
    var dQty = document.createElement('div');
    dQty.className = 'ipc-calc-chip';
    dQty.textContent = 'Количество: ' + (r.quantity != null ? r.quantity : '—') + ' шт.';
    row1.appendChild(dQty);
    var dSides = document.createElement('div');
    dSides.className = 'ipc-calc-chip';
    dSides.textContent = 'Стороны: ' + printSidesRuCalc();
    row1.appendChild(dSides);
    var ptl = priceTypeLabelCalc();
    if (ptl) {
      var dPt = document.createElement('div');
      dPt.className = 'ipc-calc-chip';
      dPt.textContent = 'Тип цены: ' + ptl;
      row1.appendChild(dPt);
    }
    container.appendChild(row1);
    var params = buildCalcCartParams();
    var sum = params && Array.isArray(params.parameterSummary) ? params.parameterSummary : [];
    if (sum.length > 0) {
      var row2 = h('div', '', 'ipc-calc-chips ipc-calc-chips--detail');
      for (var si = 0; si < sum.length; si++) {
        var it = sum[si];
        if (!it || it.label == null || it.label === '') continue;
        var chip = document.createElement('div');
        chip.className = 'ipc-calc-chip ipc-calc-chip--kv';
        var sl = document.createElement('span');
        sl.className = 'ipc-calc-chip__lab';
        sl.textContent = String(it.label) + ' ';
        var sv = document.createElement('span');
        sv.className = 'ipc-calc-chip__val';
        sv.textContent = String(it.value != null ? it.value : '');
        chip.appendChild(sl);
        chip.appendChild(sv);
        row2.appendChild(chip);
      }
      container.appendChild(row2);
    }
    var lay = r.layout || {};
    var ips = lay.itemsPerSheet != null ? lay.itemsPerSheet : (r.itemsPerSheet != null ? r.itemsPerSheet : null);
    var sh = lay.sheetsNeeded != null ? lay.sheetsNeeded : (r.sheetsNeeded != null ? r.sheetsNeeded : null);
    if (ips != null || sh != null) {
      var parts = [];
      if (sh != null) parts.push('Листов: ' + sh);
      if (ips != null) parts.push('На листе: ' + ips + ' шт.');
      container.appendChild(h('div', '📄 ' + parts.join(' • '), 'ipc-calc-layout'));
    }
    if (r.tier_prices && r.tier_prices.length) {
      var det = document.createElement('details');
      det.className = 'ipc-calc-tiers';
      var sm = document.createElement('summary');
      sm.textContent = 'Тиражные скидки';
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
