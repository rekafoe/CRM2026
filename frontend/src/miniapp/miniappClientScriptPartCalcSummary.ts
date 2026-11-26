export const MINIAPP_CLIENT_PART_CALC_SUMMARY = `
  function ipcCalcMoneyHtml(value) {
    var n = Number(value);
    if (!isFinite(n)) return '—';
    return esc(String(Math.round(n * 100) / 100)) + bynSpanHtml();
  }
  function ipcCalcNumberLabel(value, suffix) {
    var n = Number(value);
    if (!isFinite(n) || n <= 0) return '';
    var rounded = Math.round(n * 1000) / 1000;
    return String(rounded) + (suffix || '');
  }
  function ipcCalcLineTotal(row) {
    if (!row) return 0;
    var direct = row.totalCost != null ? row.totalCost : (row.total != null ? row.total : row.priceForQuantity);
    var n = Number(direct);
    if (isFinite(n)) return n;
    var unit = Number(row.unitPrice != null ? row.unitPrice : (row.unit_price != null ? row.unit_price : row.price));
    var qty = Number(row.quantity != null ? row.quantity : row.units_needed);
    return isFinite(unit) && isFinite(qty) ? unit * qty : 0;
  }
  function ipcCalcOperationName(row) {
    if (!row) return 'Операция';
    return String(
      row.operationName ||
      row.operation_name ||
      row.service_name ||
      row.service ||
      row.name ||
      'Операция'
    );
  }
  function ipcCalcOperationKind(row) {
    var name = ipcCalcOperationName(row).toLowerCase();
    var type = String(row && (row.operationType || row.operation_type || row.type || '') || '').toLowerCase();
    var key = String(row && (row.pricingKey || row.pricing_key || '') || '').toLowerCase();
    if (key === 'print' || type === 'print' || row.technologyCode || row.technology_code || name.indexOf('печать') >= 0) return 'print';
    if (type === 'cut' || name.indexOf('резк') >= 0 || name.indexOf('cut') >= 0) return 'cutting';
    return 'operation';
  }
  function ipcCalcBreakdownRows(r) {
    var rows = [];
    var materials = Array.isArray(r.materials) ? r.materials : [];
    for (var i = 0; i < materials.length; i++) {
      var m = materials[i] || {};
      rows.push({
        group: 'material',
        label: m.materialName || m.material_name || m.name || 'Материал',
        meta: ipcCalcNumberLabel(m.quantity, m.unit ? ' ' + m.unit : ''),
        total: ipcCalcLineTotal(m)
      });
    }
    var ops = Array.isArray(r.operations) ? r.operations : (Array.isArray(r.services) ? r.services : []);
    for (var j = 0; j < ops.length; j++) {
      var op = ops[j] || {};
      var kind = ipcCalcOperationKind(op);
      rows.push({
        group: kind,
        label: ipcCalcOperationName(op),
        meta: ipcCalcNumberLabel(op.quantity != null ? op.quantity : op.units_needed, ''),
        total: ipcCalcLineTotal(op)
      });
    }
    return rows.filter(function (row) {
      return row && row.label && isFinite(Number(row.total));
    });
  }
  function ipcCalcGroupTitle(group) {
    if (group === 'material') return 'Материалы';
    if (group === 'print') return 'Печать';
    if (group === 'cutting') return 'Резка';
    return 'Операции';
  }
  function appendCalcBreakdownUI(card, r) {
    var rows = ipcCalcBreakdownRows(r);
    if (!rows.length) return;
    card.appendChild(h('hr', '', 'ipc-calc-card__sep'));
    var wrap = h('div', '', 'ipc-calc-breakdown');
    wrap.appendChild(h('div', 'Разбивка цены', 'ipc-calc-breakdown__title'));
    var order = ['material', 'print', 'cutting', 'operation'];
    for (var gi = 0; gi < order.length; gi++) {
      var group = order[gi];
      var groupRows = rows.filter(function (row) { return row.group === group; });
      if (!groupRows.length) continue;
      var groupBox = h('div', '', 'ipc-calc-breakdown__group');
      groupBox.appendChild(h('div', ipcCalcGroupTitle(group), 'ipc-calc-breakdown__group-title'));
      for (var ri = 0; ri < groupRows.length; ri++) {
        var row = groupRows[ri];
        var line = h('div', '', 'ipc-calc-breakdown__row');
        var left = h('div', '', 'ipc-calc-breakdown__left');
        left.appendChild(h('span', esc(row.label), 'ipc-calc-breakdown__label'));
        if (row.meta) left.appendChild(h('span', esc(row.meta), 'ipc-calc-breakdown__meta'));
        var right = h('div', '', 'ipc-calc-breakdown__value');
        right.innerHTML = ipcCalcMoneyHtml(row.total);
        line.appendChild(left);
        line.appendChild(right);
        groupBox.appendChild(line);
      }
      wrap.appendChild(groupBox);
    }
    card.appendChild(wrap);
  }
  function ipcCalcChecklistRows() {
    var rows = [];
    if (out.calcName) rows.push({ label: 'Продукт', value: String(out.calcName) });
    var types = calcTypes();
    for (var ti = 0; ti < types.length; ti++) {
      if (String(types[ti].id) === String(out.calcForm.typeId)) {
        if (types[ti].name) rows.push({ label: 'Тип / вариант', value: String(types[ti].name) });
        break;
      }
    }
    var size = calcSelectedSize();
    if (size && size.label) rows.push({ label: 'Размер', value: String(size.label) });
    var materials = calcMaterials();
    for (var mi = 0; mi < materials.length; mi++) {
      if (String(materials[mi].id) === String(out.calcForm.matId)) {
        if (materials[mi].name) rows.push({ label: 'Материал', value: String(materials[mi].name) });
        break;
      }
    }
    var print = parsePrintKey();
    if (print.color) rows.push({ label: 'Тип печати', value: printColorModeLabel(print.color) });
    if (print.sides) rows.push({ label: 'Стороны печати', value: printSidesModeLabel(print.sides) });
    var priceTypes = calcAllowedPriceTypes();
    for (var pi = 0; pi < priceTypes.length; pi++) {
      if (String(priceTypes[pi].key) === String(out.calcForm.priceType)) {
        rows.push({ label: 'Срок и цена', value: String(priceTypes[pi].label) });
        break;
      }
    }
    rows.push({ label: 'Тираж', value: String(out.calcForm.qty) + ' шт.' });
    if (typeof miniappFinishingOptions === 'function') {
      var selected = out.calcForm.finishingSelection || {};
      var operations = miniappFinishingOptions().filter(function (opt) { return !!selected[opt.key]; });
      if (operations.length) {
        rows.push({
          label: 'Операции',
          value: operations.map(function (opt) { return opt.variantLabel || opt.name; }).join(', ')
        });
      }
    }
    if (out.checkoutDesignHelp) {
      rows.push({ label: 'Макет', value: 'Нужна помощь с разработкой' });
    } else if (out.calcStagedLayout && out.calcStagedLayout.name) {
      rows.push({ label: 'Макет', value: String(out.calcStagedLayout.name) });
    }
    return rows;
  }
  function appendCalcChecklistUI(card) {
    var rows = ipcCalcChecklistRows();
    if (!rows.length) return;
    var box = h('div', '', 'ipc-calc-checklist');
    box.appendChild(h('div', 'Проверьте заказ', 'ipc-calc-checklist__title'));
    for (var i = 0; i < rows.length; i++) {
      var row = h('div', '', 'ipc-calc-checklist__row');
      row.appendChild(h('span', esc(rows[i].label), 'ipc-calc-checklist__label'));
      row.appendChild(h('span', esc(rows[i].value), 'ipc-calc-checklist__value'));
      box.appendChild(row);
    }
    card.appendChild(box);
    card.appendChild(h('hr', '', 'ipc-calc-card__sep'));
  }
  function appendCalcResultSummaryUI(container, r) {
    if (!container || !r) return;
    var card = h('div', '', 'ipc-calc-card');
    appendCalcChecklistUI(card);
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
