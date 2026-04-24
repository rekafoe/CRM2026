export const MINIAPP_CLIENT_PART_CALC_SUMMARY = `
  function appendCalcResultSummaryUI(container, r) {
    if (!container || !r) return;
    var card = h('div', '', 'ipc-calc-card');
    var lineTop = h('div', '', 'ipc-calc-card__line');
    lineTop.appendChild(h('div', 'Стоимость', 'ipc-calc-card__label'));
    var valLg = h('div', '', 'ipc-calc-card__value--lg');
    var totalCost = r.totalCost != null ? Number(r.totalCost) : Number(r.finalPrice);
    valLg.innerHTML =
      isFinite(totalCost)
        ? esc(String(Math.round(totalCost * 100) / 100)) + bynSpanHtml()
        : '—';
    lineTop.appendChild(valLg);
    card.appendChild(lineTop);

    var lineSub = h('div', '', 'ipc-calc-card__line ipc-calc-card__line--sub');
    lineSub.appendChild(h('div', 'Цена за 1 шт.', 'ipc-calc-card__label ipc-calc-card__label--sub'));
    var valSub = h('div', '', 'ipc-calc-card__value--sub');
    var ppu = r.pricePerUnit != null ? Number(r.pricePerUnit) : NaN;
    valSub.innerHTML =
      isFinite(ppu)
        ? '<span class="ipc-calc-card__ppu-amount">' + esc(String(Math.round(ppu * 100) / 100)) + bynSpanHtml() + '/ед.</span>'
        : '—';
    lineSub.appendChild(valSub);
    card.appendChild(lineSub);

    if (Array.isArray(r.priceTiers) && r.priceTiers.length > 0) {
      card.appendChild(h('hr', '', 'ipc-calc-card__sep'));
      var det = document.createElement('details');
      det.className = 'ipc-calc-tiers';
      var sm = document.createElement('summary');
      sm.textContent = 'Тиражные цены';
      det.appendChild(sm);
      var bd = h('div', '', 'ipc-calc-tiers__body');
      for (var i = 0; i < r.priceTiers.length; i++) {
        var t = r.priceTiers[i] || {};
        var pr = h('p', '', 'ipc-calc-tiers__row line');
        var rlo = t.fromQty != null ? String(t.fromQty) : '—';
        var rhi = t.toQty != null ? String(t.toQty) : '∞';
        var num = t.unitPrice != null ? Number(t.unitPrice) : NaN;
        var numStr = isFinite(num) ? String(Math.round(num * 100) / 100) : null;
        pr.innerHTML = esc(rlo + ' — ' + rhi + ' шт.: ') + (numStr != null ? (esc(numStr) + bynSpanHtml() + esc('/ед.')) : '—');
        bd.appendChild(pr);
      }
      det.appendChild(bd);
      card.appendChild(det);
    }

    container.appendChild(card);
  }
`;
