/**
 * Inline Mini App: упрощённый калькулятор (schema compact + POST /products/:id/calculate).
 */
export const MINIAPP_CLIENT_PART_CALC = `
  function calcSimp() {
    var d = out.calcSchema && out.calcSchema.data;
    return d && d.template && d.template.simplified;
  }
  function calcSizes(tid) {
    var s = calcSimp();
    if (!s) return [];
    if (tid != null && s.typeConfigs && s.typeConfigs[String(tid)] && s.typeConfigs[String(tid)].sizes)
      return s.typeConfigs[String(tid)].sizes;
    return s.sizes || [];
  }
  function calcTypes() {
    var s = calcSimp();
    if (!s) return [];
    if (s.types && s.types.length) return s.types;
    if (s.typeConfigs) {
      var k = Object.keys(s.typeConfigs);
      var a = [];
      for (var i = 0; i < k.length; i++) a.push({ id: isNaN(+k[i]) ? k[i] : +k[i], name: 'Вариант ' + k[i] });
      return a;
    }
    return [];
  }
  function calcPickTypeId() {
    var types = calcTypes();
    if (types.length === 0) return null;
    if (out.calcForm.typeId != null) return out.calcForm.typeId;
    for (var i = 0; i < types.length; i++) { if (types[i].default) return types[i].id; }
    return types[0].id;
  }
  function calcSelectedSize() {
    var tid = calcPickTypeId();
    var sizes = calcSizes(tid);
    var sid = out.calcForm.sizeId;
    for (var i = 0; i < sizes.length; i++) {
      if (String(sizes[i].id) === String(sid)) return sizes[i];
    }
    return sizes[0] || null;
  }
  function calcMaterials() {
    var d = out.calcSchema && out.calcSchema.data;
    var list = d && d.materials ? d.materials : [];
    var sz = calcSelectedSize();
    if (!sz || !Array.isArray(sz.allowed_material_ids) || sz.allowed_material_ids.length === 0) return list;
    var o = [];
    for (var i = 0; i < list.length; i++) {
      for (var j = 0; j < sz.allowed_material_ids.length; j++) {
        if (String(list[i].id) === String(sz.allowed_material_ids[j])) { o.push(list[i]); break; }
      }
    }
    return o.length > 0 ? o : list;
  }
  function calcPrintOptions() {
    var sz = calcSelectedSize();
    if (!sz || !Array.isArray(sz.print_prices)) return [];
    return sz.print_prices;
  }
  function initCalcFormFromSchema() {
    out.calcForm.typeId = calcPickTypeId();
    var sizes = calcSizes(out.calcForm.typeId);
    if (sizes[0]) out.calcForm.sizeId = sizes[0].id; else out.calcForm.sizeId = null;
    var mats = calcMaterials();
    if (mats[0]) out.calcForm.matId = mats[0].id; else out.calcForm.matId = null;
    var pp = calcPrintOptions();
    if (pp[0]) {
      out.calcForm.printKey = String(pp[0].technology_code || '') + '||' + String(pp[0].color_mode || '') + '||' + String(pp[0].sides_mode || 'single');
    } else { out.calcForm.printKey = ''; }
    if (!out.calcForm.qty || out.calcForm.qty < 1) out.calcForm.qty = 100;
  }
  function loadCalcSchema() {
    if (!out.calcPid) return;
    out.calcLoading = true;
    out.calcErr = null;
    out.calcResult = null;
    render();
    fetch(API_BASE + '/api/products/' + out.calcPid + '/schema?compact=1', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        out.calcLoading = false;
        if (!x.ok || !x.j || !x.j.data) { out.calcErr = (x.j && (x.j.error || x.j.message)) ? String(x.j.error || x.j.message) : 'Схема не загрузилась'; render(); return; }
        out.calcSchema = x.j;
        var simp = x.j.data.template && x.j.data.template.simplified;
        if (!simp || (!simp.sizes || simp.sizes.length === 0) && (!simp.typeConfigs || Object.keys(simp.typeConfigs).length === 0)) {
          out.calcErr = 'Нет настроенных размеров (simplified).';
          render();
          return;
        }
        initCalcFormFromSchema();
        render();
      })
      .catch(function (e) { out.calcLoading = false; out.calcErr = (e && e.message) || String(e); render(); });
  }
  function parsePrintKey() {
    var a = (out.calcForm.printKey || '').split('||');
    return { tech: (a[0] || '').trim(), color: (a[1] || 'color').trim(), sides: (a[2] || 'single').trim() };
  }
  function buildCalcPayload() {
    var p = parsePrintKey();
    var qn = Math.max(1, parseInt(String(out.calcForm.qty), 10) || 1);
    var pl = { quantity: qn, size_id: out.calcForm.sizeId, print_technology: p.tech, print_color_mode: p.color, print_sides_mode: p.sides };
    if (out.calcForm.matId != null) pl.material_id = out.calcForm.matId;
    if (out.calcForm.typeId != null) pl.type_id = out.calcForm.typeId;
    return pl;
  }
  function runCalc() {
    if (!out.calcPid) { return; }
    out.calcResult = null;
    out.calcErr = null;
    out.calcLoading = true;
    render();
    var body = buildCalcPayload();
    var hdrs = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (out.token) hdrs.Authorization = 'Bearer ' + out.token;
    fetch(API_BASE + '/api/products/' + out.calcPid + '/calculate', { method: 'POST', headers: hdrs, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        out.calcLoading = false;
        if (!x.ok || !x.j) { out.calcErr = 'Ошибка цены'; render(); return; }
        if (x.j.success && x.j.data) { out.calcResult = x.j.data; out.calcErr = null; } else
          { out.calcErr = (x.j.message || x.j.error) ? String(x.j.message || x.j.error) : 'Расчёт неудачен'; }
        render();
      })
      .catch(function (e) { out.calcLoading = false; out.calcErr = (e && e.message) || String(e); render(); });
  }
  function buildCalcCartParams() {
    var cfg = buildCalcPayload();
    var q = Math.max(1, parseInt(String(out.calcForm.qty), 10) || 1);
    var typeName = '';
    var types = calcTypes();
    for (var ti = 0; ti < types.length; ti++) {
      if (String(types[ti].id) === String(out.calcForm.typeId)) { typeName = String(types[ti].name || '').trim(); break; }
    }
    var sz = calcSelectedSize();
    var sizeLabel = sz && (sz.label != null || sz.id != null) ? String(sz.label != null ? sz.label : sz.id) : '—';
    var matName = '—';
    var matList = calcMaterials();
    for (var mi = 0; mi < matList.length; mi++) {
      if (String(matList[mi].id) === String(out.calcForm.matId)) { matName = String(matList[mi].name || out.calcForm.matId); break; }
    }
    var printLabel = '—';
    var pps = calcPrintOptions();
    for (var pi = 0; pi < pps.length; pi++) {
      var pr = pps[pi];
      var pkey = String(pr.technology_code || '') + '||' + String(pr.color_mode || '') + '||' + String(pr.sides_mode || 'single');
      if (pkey === String(out.calcForm.printKey)) {
        printLabel = (pr.technology_code || '') + ' / ' + (pr.color_mode || '') + ' / ' + (pr.sides_mode || '');
        break;
      }
    }
    var productTitle = out.calcName || 'Товар';
    var summary = [];
    if (typeName) summary.push({ label: 'Тип', value: typeName });
    summary.push({ label: 'Размер', value: sizeLabel });
    summary.push({ label: 'Материал', value: matName });
    summary.push({ label: 'Печать', value: printLabel });
    summary.push({ label: 'Тираж', value: String(q) + ' шт.' });
    var description = [productTitle, 'тираж ' + q + ' шт.', sizeLabel, matName, printLabel].filter(function (x) { return x && String(x).trim() && String(x) !== '—'; }).join(' · ');
    return {
      productName: productTitle,
      source: 'miniapp',
      calculator: true,
      configuration: cfg,
      priceType: 'standard',
      parameterSummary: summary,
      description: description
    };
  }
  function calcAddToCart() {
    if (!out.calcResult || out.calcResult.finalPrice == null) { return; }
    var q = Math.max(1, parseInt(String(out.calcForm.qty), 10) || 1);
    var ppu = Number(out.calcResult.pricePerUnit);
    if (!isFinite(ppu) || ppu < 0) ppu = q > 0 ? Number(out.calcResult.finalPrice) / q : 0;
    var k = 'cx' + out.calcPid + '-' + String(out.calcForm.typeId) + '-' + String(out.calcForm.sizeId) + '-' + String(out.calcForm.matId) + '-' + String(out.calcForm.printKey);
    var name = (out.calcName || 'Товар') + ' (кальк.)';
    var found = -1;
    for (var i = 0; i < out.cart.length; i++) { if (out.cart[i].k === k) { found = i; break; } }
    var rich = buildCalcCartParams();
    var line = { k: k, pid: out.calcPid, name: name, price: ppu, qty: q, type: String(out.calcPid), params: rich };
    if (found >= 0) out.cart[found] = line; else out.cart.push(line);
    out.view = 'cart';
    render();
  }
  function calcBack() {
    out.view = 'catalog';
    out.calcPid = null;
    render();
  }
  function renderCalculator() {
    var box = h('div', '', 'section');
    box.appendChild(h('div', esc(out.calcName || 'Калькулятор'), 'section-head'));
    var back = h('button', '← Каталог', 'small');
    back.type = 'button';
    back.onclick = function () { calcBack(); };
    box.appendChild(back);
    if (out.calcLoading && !out.calcSchema) { box.appendChild(rowHint('Загрузка схемы…')); return box; }
    if (out.calcErr) box.appendChild(rowHint(out.calcErr));
    if (out.calcLoading && out.calcSchema) box.appendChild(rowHint('Считаем…'));
    var simp = calcSimp();
    if (!simp) { if (!out.calcErr) box.appendChild(rowHint('Нет данных.')); return box; }
    var form = h('form', '', 'form ipc-card');
    form.onsubmit = function (e) { e.preventDefault(); runCalc(); return false; };
    var types = calcTypes();
    if (types.length > 0) {
      var ts = document.createElement('select');
      ts.onchange = function () { out.calcForm.typeId = ts.value ? (isNaN(+ts.value) ? ts.value : +ts.value) : null; initCalcFormFromSchema(); render(); };
      for (var ti = 0; ti < types.length; ti++) {
        var op = document.createElement('option');
        op.value = String(types[ti].id);
        op.textContent = types[ti].name || op.value;
        if (String(types[ti].id) === String(calcPickTypeId()) || String(types[ti].id) === String(out.calcForm.typeId)) op.selected = true;
        ts.appendChild(op);
      }
      if (out.calcForm.typeId == null) out.calcForm.typeId = types[0].id;
      ts.value = String(out.calcForm.typeId);
      addField(form, 'Тип / вариант', ts);
    } else { out.calcForm.typeId = null; }
    var sizes = calcSizes(calcPickTypeId());
    if (sizes.length > 0) {
      var ss = document.createElement('select');
      ss.onchange = function () { out.calcForm.sizeId = ss.value ? (isNaN(+ss.value) ? ss.value : +ss.value) : null; var m = calcMaterials(); if (m[0]) out.calcForm.matId = m[0].id; var pp = calcPrintOptions(); if (pp[0]) out.calcForm.printKey = String(pp[0].technology_code || '') + '||' + String(pp[0].color_mode || '') + '||' + String(pp[0].sides_mode || 'single'); render(); };
      for (var si = 0; si < sizes.length; si++) {
        var o1 = document.createElement('option');
        o1.value = String(sizes[si].id);
        o1.textContent = sizes[si].label || o1.value;
        ss.appendChild(o1);
      }
      if (out.calcForm.sizeId == null && sizes[0]) out.calcForm.sizeId = sizes[0].id;
      if (out.calcForm.sizeId != null) ss.value = String(out.calcForm.sizeId);
      addField(form, 'Размер', ss);
    }
    var matList = calcMaterials();
    if (matList.length > 0) {
      var ms = document.createElement('select');
      ms.onchange = function () { out.calcForm.matId = ms.value ? +ms.value : null; };
      for (var mi = 0; mi < matList.length; mi++) {
        var o2 = document.createElement('option');
        o2.value = String(matList[mi].id);
        o2.textContent = matList[mi].name || o2.value;
        ms.appendChild(o2);
      }
      if (out.calcForm.matId != null) ms.value = String(out.calcForm.matId);
      if (out.calcForm.matId == null && matList[0]) out.calcForm.matId = matList[0].id;
      if (out.calcForm.matId != null) ms.value = String(out.calcForm.matId);
      addField(form, 'Материал', ms);
    }
    var pps = calcPrintOptions();
    if (pps.length > 0) {
      var ps = document.createElement('select');
      ps.onchange = function () { out.calcForm.printKey = ps.value; };
      for (var pi = 0; pi < pps.length; pi++) {
        var o3 = document.createElement('option');
        var pr = pps[pi];
        o3.value = String(pr.technology_code || '') + '||' + String(pr.color_mode || '') + '||' + String(pr.sides_mode || 'single');
        o3.textContent = (pr.technology_code || '') + ' / ' + (pr.color_mode || '') + ' / ' + (pr.sides_mode || '');
        ps.appendChild(o3);
      }
      if (out.calcForm.printKey) { var ok = false; for (var q = 0; q < ps.options.length; q++) { if (ps.options[q].value === out.calcForm.printKey) { ok = true; break; } } if (!ok) out.calcForm.printKey = ps.options[0].value; }
      if (!out.calcForm.printKey && ps.options[0]) out.calcForm.printKey = ps.options[0].value;
      if (out.calcForm.printKey) ps.value = out.calcForm.printKey;
      addField(form, 'Печать (техн./цвет/стороны)', ps);
    } else { box.appendChild(rowHint('В шаблоне нет print_prices для размера — расчёт может быть недоступен.')); }
    var qi = document.createElement('input');
    qi.name = 'q';
    qi.type = 'number';
    qi.min = '1';
    qi.value = String(out.calcForm.qty);
    qi.onchange = function () { out.calcForm.qty = Math.max(1, parseInt(qi.value, 10) || 1); };
    addField(form, 'Тираж (шт.)', qi);
    var sub = h('button', out.calcLoading ? 'Счёт…' : 'Рассчитать цену', 'primary');
    sub.type = 'submit';
    if (out.calcLoading) sub.disabled = true;
    form.appendChild(sub);
    box.appendChild(form);
    if (out.calcResult) {
      var r = out.calcResult;
      var resBox = h('div', '', 'ipc-card ipc-result');
      resBox.appendChild(h('p', 'Итого: ' + (Math.round(Number(r.finalPrice) * 100) / 100) + ' Br, за ед.: ' + (Math.round(Number(r.pricePerUnit) * 100) / 100) + ' Br', 'total'));
      if (r.warnings && r.warnings.length) resBox.appendChild(h('p', esc(r.warnings.join('; ')), 'hint'));
      var addB = h('button', 'В корзину', 'primary');
      addB.type = 'button';
      addB.onclick = function () { calcAddToCart(); };
      resBox.appendChild(addB);
      box.appendChild(resBox);
    }
    return box;
  }
`;

