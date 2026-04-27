/**
 * Inline Mini App: finishing operations support for simplified calculator.
 */
export const MINIAPP_CLIENT_PART_CALC_OPERATIONS = `
  function miniappFinishingKey(x) {
    if (!x) return '';
    var sid = Number(x.service_id != null ? x.service_id : (x.operation_id != null ? x.operation_id : x.operationId));
    if (!isFinite(sid) || sid <= 0) return '';
    var vidRaw = x.variant_id != null ? x.variant_id : x.variantId;
    var vid = vidRaw != null && String(vidRaw).trim() !== '' && isFinite(Number(vidRaw)) ? Number(vidRaw) : null;
    return String(sid) + ':' + (vid != null ? String(vid) : '');
  }
  function miniappServiceInfo(serviceId) {
    var d = out.calcSchema && out.calcSchema.data;
    var ops = d && Array.isArray(d.operations) ? d.operations : [];
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i] || {};
      var oid = Number(op.operation_id != null ? op.operation_id : (op.id != null ? op.id : op.service_id));
      if (oid === Number(serviceId)) return op;
    }
    return null;
  }
  function miniappVariantLabel(serviceId, variantId) {
    if (variantId == null) return '';
    var d = out.calcSchema && out.calcSchema.data;
    var byService = d && d.service_variants ? d.service_variants[String(serviceId)] : null;
    if (!Array.isArray(byService)) return '';
    for (var i = 0; i < byService.length; i++) {
      var v = byService[i] || {};
      if (Number(v.id) !== Number(variantId)) continue;
      var p = v.parameters || {};
      var parts = [];
      if (p.type) parts.push(String(p.type).trim());
      if (p.subType) parts.push(String(p.subType).trim());
      else if (p.density) parts.push(String(p.density).trim());
      var joined = parts.filter(Boolean).join(' ');
      return joined || v.variantName || ('Вариант #' + variantId);
    }
    return 'Вариант #' + variantId;
  }
  function miniappFinishingOptions() {
    var sz = calcSelectedSize();
    var rows = sz && Array.isArray(sz.finishing) ? sz.finishing : [];
    var cfg = getTypeConfigForCurrentSubtype();
    var init = cfg && cfg.initial;
    var initOps = init && Array.isArray(init.operations) ? init.operations : [];
    var byKey = {};
    function add(raw) {
      var sid = Number(raw && (raw.service_id != null ? raw.service_id : (raw.operation_id != null ? raw.operation_id : raw.operationId)));
      if (!isFinite(sid) || sid <= 0) return;
      var vidRaw = raw.variant_id != null ? raw.variant_id : raw.variantId;
      var vid = vidRaw != null && String(vidRaw).trim() !== '' && isFinite(Number(vidRaw)) ? Number(vidRaw) : undefined;
      var key = miniappFinishingKey({ service_id: sid, variant_id: vid });
      if (!key || byKey[key]) return;
      var svc = miniappServiceInfo(sid);
      var variantLabel = miniappVariantLabel(sid, vid);
      byKey[key] = {
        key: key,
        service_id: sid,
        variant_id: vid,
        price_unit: raw.price_unit || (svc && svc.price_unit) || undefined,
        units_per_item: raw.units_per_item != null ? Number(raw.units_per_item) : 1,
        name: (svc && (svc.operation_name || svc.name)) || ('Операция #' + sid),
        variantLabel: variantLabel
      };
    }
    for (var i = 0; i < rows.length; i++) add(rows[i]);
    for (var j = 0; j < initOps.length; j++) add(initOps[j]);
    var outRows = [];
    for (var k in byKey) {
      if (Object.prototype.hasOwnProperty.call(byKey, k)) outRows.push(byKey[k]);
    }
    outRows.sort(function (a, b) {
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return String(a.variantLabel || '').localeCompare(String(b.variantLabel || ''), 'ru');
    });
    return outRows;
  }
  function miniappDefaultFinishingSelection() {
    var cfg = getTypeConfigForCurrentSubtype();
    var init = cfg && cfg.initial;
    var initOps = init && Array.isArray(init.operations) ? init.operations : [];
    var selected = {};
    for (var i = 0; i < initOps.length; i++) {
      var key = miniappFinishingKey(initOps[i]);
      if (key) selected[key] = true;
    }
    return selected;
  }
  function miniappFinishingContextKey() {
    return String(calcPickTypeId()) + '|' + String(out.calcForm.sizeId || '');
  }
  function syncMiniappFinishingSelectionFromDefaults(force) {
    var ctx = miniappFinishingContextKey();
    if (!out.calcForm.finishingSelection || force || out.calcForm.finishingSelectionContext !== ctx) {
      out.calcForm.finishingSelection = miniappDefaultFinishingSelection();
      out.calcForm.finishingSelectionContext = ctx;
    }
  }
  function restoreMiniappFinishingSelection(finishing) {
    var selected = {};
    if (Array.isArray(finishing)) {
      for (var i = 0; i < finishing.length; i++) {
        var key = miniappFinishingKey(finishing[i]);
        if (key) selected[key] = true;
      }
    }
    out.calcForm.finishingSelection = selected;
    out.calcForm.finishingSelectionContext = miniappFinishingContextKey();
  }
  function buildMiniappFinishingPayload() {
    syncMiniappFinishingSelectionFromDefaults(false);
    var selected = out.calcForm.finishingSelection || {};
    var options = miniappFinishingOptions();
    var payload = [];
    var usedServices = {};
    for (var i = 0; i < options.length; i++) {
      var opt = options[i];
      if (!selected[opt.key]) continue;
      if (usedServices[String(opt.service_id)]) continue;
      usedServices[String(opt.service_id)] = true;
      var entry = { service_id: opt.service_id };
      if (opt.variant_id != null) entry.variant_id = opt.variant_id;
      if (opt.price_unit) entry.price_unit = opt.price_unit;
      if (opt.units_per_item != null && isFinite(Number(opt.units_per_item))) entry.units_per_item = Number(opt.units_per_item);
      payload.push(entry);
    }
    return payload;
  }
  function miniappFinishingGroups(options) {
    var byService = {};
    for (var i = 0; i < options.length; i++) {
      var opt = options[i];
      var key = String(opt.service_id);
      if (!byService[key]) byService[key] = { service_id: opt.service_id, name: opt.name, options: [] };
      byService[key].options.push(opt);
    }
    var groups = [];
    for (var k in byService) {
      if (Object.prototype.hasOwnProperty.call(byService, k)) groups.push(byService[k]);
    }
    groups.sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
    });
    return groups;
  }
  function setMiniappFinishingServiceSelection(serviceId, optionKey) {
    out.calcForm.finishingSelection = out.calcForm.finishingSelection || {};
    var options = miniappFinishingOptions();
    for (var i = 0; i < options.length; i++) {
      if (Number(options[i].service_id) === Number(serviceId)) {
        out.calcForm.finishingSelection[options[i].key] = false;
      }
    }
    if (optionKey) out.calcForm.finishingSelection[optionKey] = true;
    render();
    scheduleCalcRun();
  }
  function renderMiniappFinishingControls(form) {
    var options = miniappFinishingOptions();
    if (!options.length) return;
    syncMiniappFinishingSelectionFromDefaults(false);
    var selected = out.calcForm.finishingSelection || {};
    var field = h('div', '', 'field ipc-field--price-type ipc-ops-field');
    field.appendChild(h('div', 'Операции', 'ipc-price-type__fieldtitle'));
    var wrap = h('div', '', 'ipc-ops-list');
    var groups = miniappFinishingGroups(options);
    for (var gi = 0; gi < groups.length; gi++) {
      (function (group) {
        if (group.options.length <= 1) {
          var opt = group.options[0];
          if (!opt) return;
          var lab = document.createElement('label');
          lab.className = 'ipc-design-help ipc-op-option';
          var cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = !!selected[opt.key];
          cb.setAttribute('aria-label', opt.name);
          cb.onchange = function () {
            out.calcForm.finishingSelection = out.calcForm.finishingSelection || {};
            out.calcForm.finishingSelection[opt.key] = !!cb.checked;
            render();
            scheduleCalcRun();
          };
          var text = opt.name + (opt.variantLabel ? ' — ' + opt.variantLabel : '');
          lab.appendChild(cb);
          lab.appendChild(document.createTextNode(' ' + text));
          wrap.appendChild(lab);
          return;
        }
        var groupBox = h('div', '', 'ipc-op-group');
        groupBox.appendChild(h('div', esc(group.name), 'ipc-op-group__title'));
        var btns = h('div', '', 'ipc-op-group__btns');
        var hasSelected = group.options.some(function (opt) { return !!selected[opt.key]; });
        var noneBtn = document.createElement('button');
        noneBtn.type = 'button';
        noneBtn.className = 'ipc-op-variant' + (!hasSelected ? ' ipc-op-variant--on' : '');
        noneBtn.textContent = 'Без операции';
        noneBtn.onclick = function () { setMiniappFinishingServiceSelection(group.service_id, null); };
        btns.appendChild(noneBtn);
        for (var oi = 0; oi < group.options.length; oi++) {
          (function (opt) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ipc-op-variant' + (selected[opt.key] ? ' ipc-op-variant--on' : '');
            btn.textContent = opt.variantLabel || opt.name;
            btn.onclick = function () { setMiniappFinishingServiceSelection(group.service_id, opt.key); };
            btns.appendChild(btn);
          })(group.options[oi]);
        }
        groupBox.appendChild(btns);
        wrap.appendChild(groupBox);
      })(groups[gi]);
    }
    field.appendChild(wrap);
    form.appendChild(field);
  }
`;
