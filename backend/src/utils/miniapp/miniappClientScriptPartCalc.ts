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
  function matHasPaperTypeInfo(m) {
    if (!m || typeof m !== 'object') return false;
    if (m.paper_type_id != null && String(m.paper_type_id).trim() !== '') return true;
    if (m.paper_type_name != null && String(m.paper_type_name).trim() !== '') return true;
    return false;
  }
  function shouldSplitMaterialSelects(list) {
    if (!list || list.length <= 1) return false;
    for (var i = 0; i < list.length; i++) {
      if (matHasPaperTypeInfo(list[i])) return true;
    }
    return false;
  }
  function materialPaperGroupKey(m) {
    if (m.paper_type_id != null && String(m.paper_type_id).trim() !== '') return 'pid:' + String(m.paper_type_id);
    if (m.paper_type_name != null && String(m.paper_type_name).trim() !== '') return 'pnm:' + String(m.paper_type_name).trim();
    return 'nopt';
  }
  function materialPaperGroupLabel(row) {
    if (row.paper_type_name != null && String(row.paper_type_name).trim() !== '') return String(row.paper_type_name).trim();
    return 'Прочее';
  }
  function materialDensityNum(m) {
    if (m == null || m.density == null || m.density === '') return NaN;
    var n = Number(m.density);
    return isFinite(n) ? n : NaN;
  }
  function materialDensityOptionLabel(m) {
    var n = materialDensityNum(m);
    if (isFinite(n)) return String(Math.round(n)) + ' г/м²';
    if (m.name != null && String(m.name).trim() !== '') return String(m.name).trim();
    return '—';
  }
  function buildMaterialPaperGroups(list) {
    var map = {};
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      var gk = materialPaperGroupKey(m);
      if (!map[gk]) map[gk] = [];
      map[gk].push(m);
    }
    var groups = [];
    for (var k in map) {
      if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
      var items = map[k].slice();
      items.sort(function (a, b) {
        var da = materialDensityNum(a);
        var db = materialDensityNum(b);
        if (isFinite(da) && isFinite(db) && da !== db) return da - db;
        if (isFinite(da) && !isFinite(db)) return -1;
        if (!isFinite(da) && isFinite(db)) return 1;
        return String(a.id) < String(b.id) ? -1 : 1;
      });
      groups.push({ key: k, label: materialPaperGroupLabel(items[0]), items: items });
    }
    groups.sort(function (a, b) {
      if (a.key === 'nopt' && b.key !== 'nopt') return 1;
      if (a.key !== 'nopt' && b.key === 'nopt') return -1;
      if (a.label < b.label) return -1;
      if (a.label > b.label) return 1;
      return 0;
    });
    return groups;
  }
  function findMaterialGroupByMatId(groups, matId) {
    if (matId == null) return null;
    for (var i = 0; i < groups.length; i++) {
      var it = groups[i].items;
      for (var j = 0; j < it.length; j++) {
        if (String(it[j].id) === String(matId)) return groups[i];
      }
    }
    return null;
  }
  function syncCalcFormMatPaperKey(mats) {
    if (!shouldSplitMaterialSelects(mats)) {
      out.calcForm.matPaperKey = null;
      return;
    }
    var groups = buildMaterialPaperGroups(mats);
    var g = findMaterialGroupByMatId(groups, out.calcForm.matId);
    if (g) {
      out.calcForm.matPaperKey = g.key;
      return;
    }
    if (groups[0] && groups[0].items[0]) {
      out.calcForm.matPaperKey = groups[0].key;
      out.calcForm.matId = groups[0].items[0].id;
    }
  }
  function calcPrintOptions() {
    var sz = calcSelectedSize();
    if (!sz || !Array.isArray(sz.print_prices)) return [];
    return sz.print_prices;
  }
  function priceTypeEntryDescription(x) {
    if (!x || typeof x !== 'object') return '';
    var d = x.description != null ? x.description : (x.hint != null ? x.hint : (x.help != null ? x.help : (x.note != null ? x.note : '')));
    d = d != null ? String(d).trim() : '';
    return d;
  }
  /** Словарь из compact-схемы: key → { name, description? } из таблицы price_types. */
  function calcPriceTypeInfo() {
    var d = out.calcSchema && out.calcSchema.data;
    if (!d || !d.price_type_info || typeof d.price_type_info !== 'object') return null;
    return d.price_type_info;
  }
  function getSimplifiedTypeConfigMap() {
    var s = calcSimp();
    if (!s || !s.typeConfigs || typeof s.typeConfigs !== 'object') return null;
    return s.typeConfigs;
  }
  /** typeConfigs ключи в JSON — строки; typeId в форме — число или строка. */
  function getTypeConfigForCurrentSubtype() {
    var m = getSimplifiedTypeConfigMap();
    if (!m) return null;
    var tid = calcPickTypeId();
    if (tid == null) return null;
    if (m[String(tid)] != null) return m[String(tid)];
    for (var k in m) {
      if (Object.prototype.hasOwnProperty.call(m, k) && k == tid) return m[k];
    }
    return null;
  }
  function calcAllowedPriceTypesRaw() {
    var s = calcSimp();
    if (!s) return [];
    var d = out.calcSchema && out.calcSchema.data;
    var cfg = getTypeConfigForCurrentSubtype();
    if (cfg && Array.isArray(cfg.allowed_price_types) && cfg.allowed_price_types.length > 0) {
      return cfg.allowed_price_types;
    }
    if (d && d.constraints && Array.isArray(d.constraints.allowed_price_types) && d.constraints.allowed_price_types.length > 0) {
      return d.constraints.allowed_price_types;
    }
    return [];
  }
  function calcAllowedPriceTypes() {
    var raw = calcAllowedPriceTypesRaw();
    var pti = calcPriceTypeInfo();
    var opts = [];
    for (var i = 0; i < raw.length; i++) {
      var x = raw[i];
      if (typeof x === 'string' || typeof x === 'number') {
        var k = String(x).trim();
        if (!k) continue;
        var sk = pti && pti[k] ? pti[k] : null;
        var lab = (sk && sk.name) ? String(sk.name) : k;
        var dsk = (sk && sk.description) ? String(sk.description) : '';
        opts.push({ key: k, label: lab, description: dsk });
        continue;
      }
      if (x && typeof x === 'object') {
        var key = String(x.key || x.id || x.value || '').trim();
        if (!key) continue;
        var ptk = pti && pti[key] ? pti[key] : null;
        var tplDesc = priceTypeEntryDescription(x);
        var fromDbName = ptk && ptk.name ? String(ptk.name) : '';
        var fromDbDesc = ptk && ptk.description ? String(ptk.description) : '';
        var labObj = fromDbName || String(x.name || x.label || x.title || key);
        var descObj = tplDesc || fromDbDesc;
        opts.push({ key: key, label: labObj, description: descObj });
      }
    }
    return opts;
  }
  function initCalcFormFromSchema() {
    out.calcForm.typeId = calcPickTypeId();
    var sizes = calcSizes(out.calcForm.typeId);
    if (sizes[0]) out.calcForm.sizeId = sizes[0].id; else out.calcForm.sizeId = null;
    var mats = calcMaterials();
    if (mats[0]) {
      out.calcForm.matId = mats[0].id;
      syncCalcFormMatPaperKey(mats);
    } else {
      out.calcForm.matId = null;
      out.calcForm.matPaperKey = null;
    }
    var pp = calcPrintOptions();
    if (pp[0]) {
      out.calcForm.printKey = makePrintKeyFromRow(pp[0]);
    } else { out.calcForm.printKey = ''; }
    var allowedPts = calcAllowedPriceTypes();
    if (allowedPts.length > 0) {
      var selectedPt = String(out.calcForm.priceType || '').trim();
      var valid = false;
      for (var pti = 0; pti < allowedPts.length; pti++) {
        if (allowedPts[pti].key === selectedPt) { valid = true; break; }
      }
      out.calcForm.priceType = valid ? selectedPt : allowedPts[0].key;
    } else {
      out.calcForm.priceType = '';
    }
    if (!out.calcForm.qty || out.calcForm.qty < 1) out.calcForm.qty = 100;
  }
  var _calcDebounceT = null;
  function scheduleCalcRun() {
    if (_calcDebounceT) clearTimeout(_calcDebounceT);
    _calcDebounceT = setTimeout(function () {
      _calcDebounceT = null;
      runCalc({ soft: true });
    }, 420);
  }
  /** Восстанавливает calcForm из сохранённого configuration позиции корзины. */
  function applyConfigFromCartLine(c) {
    var p = c && c.params && c.params.configuration;
    if (!p || typeof p !== 'object') return;
    if (p.type_id != null) out.calcForm.typeId = p.type_id;
    if (p.size_id != null) out.calcForm.sizeId = p.size_id;
    if (p.material_id != null) out.calcForm.matId = p.material_id;
    out.calcForm.printKey =
      String(p.print_technology || '') +
      '||' +
      String(p.print_color_mode != null ? p.print_color_mode : 'color') +
      '||' +
      String(p.print_sides_mode != null ? p.print_sides_mode : 'single');
    if (c.qty != null) out.calcForm.qty = Math.max(1, parseInt(String(c.qty), 10) || 1);
    else if (p.quantity != null) out.calcForm.qty = Math.max(1, parseInt(String(p.quantity), 10) || 1);
    if (p.priceType) out.calcForm.priceType = String(p.priceType);
    syncCalcFormMatPaperKey(calcMaterials());
    ensurePrintKeyMatchesOptions();
    var allowedPts = calcAllowedPriceTypes();
    if (allowedPts.length > 0) {
      var selectedPt = String(out.calcForm.priceType || '').trim();
      var validP = false;
      for (var pti = 0; pti < allowedPts.length; pti++) {
        if (allowedPts[pti].key === selectedPt) { validP = true; break; }
      }
      out.calcForm.priceType = validP ? selectedPt : allowedPts[0].key;
    } else {
      out.calcForm.priceType = '';
    }
  }
  function openCartLineForEdit(c) {
    if (!c || !c.params || !c.params.configuration || !c.params.calculator) return;
    out._pendingCalcRestore = c;
    out.calcPid = c.pid;
    out.calcName = c.params && c.params.productName ? String(c.params.productName) : (c.name || 'Товар');
    out.calcListItem = null;
    if (out.products) {
      for (var pi = 0; pi < out.products.length; pi++) {
        if (String(out.products[pi].id) === String(c.pid)) {
          out.calcListItem = out.products[pi];
          break;
        }
      }
    }
    out.calcEditCartKey = c.k;
    out.calcSchema = null;
    out.calcErr = null;
    out.calcResult = null;
    out.calcStagedLayout = out.checkoutFileByK && out.checkoutFileByK[c.k] ? out.checkoutFileByK[c.k] : null;
    out.calcForm = { typeId: null, sizeId: null, matId: null, matPaperKey: null, qty: 100, printKey: '', priceType: '' };
    out.view = 'calculator';
    loadCalcSchema();
  }
  function loadCalcSchema() {
    if (!out.calcPid) return;
    var restoreLine = out._pendingCalcRestore;
    out._pendingCalcRestore = null;
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
        if (restoreLine) applyConfigFromCartLine(restoreLine);
        render();
        scheduleCalcRun();
      })
      .catch(function (e) { out.calcLoading = false; out.calcErr = (e && e.message) || String(e); render(); });
  }
  function parsePrintKey() {
    var a = (out.calcForm.printKey || '').split('||');
    return { tech: (a[0] || '').trim(), color: (a[1] || 'color').trim(), sides: (a[2] || 'single').trim() };
  }
  function makePrintKeyFromRow(r) {
    if (!r) return '';
    return String(r.technology_code || '') + '||' + String(r.color_mode != null ? r.color_mode : 'color') + '||' + String(r.sides_mode != null ? r.sides_mode : 'single');
  }
  function printColorModeLabel(v) {
    var x = String(v != null ? v : 'color').toLowerCase();
    if (x === 'bw' || x === 'grayscale' || x === 'grey' || x === 'gray' || x === 'mono') return 'Ч/б';
    if (x === 'color') return 'Цветная';
    return v != null && String(v).trim() ? String(v) : '—';
  }
  function printSidesModeLabel(v) {
    var x = String(v != null ? v : 'single').toLowerCase();
    if (x === 'single' || x === 'one' || x === 'one_sided' || x === 'onesided') return 'Односторонняя';
    if (x === 'duplex' || x === 'double' || x === 'twosided') return 'Двусторонняя';
    if (x === 'duplex_bw_back' || x === 'duplex_bw' || x === 'duplex_bwb') return 'Сзади ч/б';
    return v != null && String(v).trim() ? String(v) : '—';
  }
  function uniquePrintColorModes(pps) {
    var seen = {};
    var out = [];
    for (var i = 0; i < pps.length; i++) {
      var c = String((pps[i] && pps[i].color_mode) != null ? pps[i].color_mode : 'color');
      if (!seen[c]) { seen[c] = true; out.push(c); }
    }
    return out;
  }
  function uniquePrintSidesModes(pps) {
    var seen = {};
    var out = [];
    for (var i = 0; i < pps.length; i++) {
      var s = String((pps[i] && pps[i].sides_mode) != null ? pps[i].sides_mode : 'single');
      if (!seen[s]) { seen[s] = true; out.push(s); }
    }
    return out;
  }
  function findPrintRowByColorSides(pps, color, sides, preferTech) {
    var c = String(color);
    var s = String(sides);
    var tech = preferTech != null && String(preferTech).length ? String(preferTech) : '';
    var list = [];
    for (var i = 0; i < pps.length; i++) {
      var r = pps[i];
      if (!r) continue;
      var rc = String((r.color_mode != null ? r.color_mode : 'color'));
      var rs = String((r.sides_mode != null ? r.sides_mode : 'single'));
      if (rc === c && rs === s) list.push(r);
    }
    if (list.length === 0) return null;
    if (tech) {
      for (var j = 0; j < list.length; j++) {
        if (String(list[j].technology_code || '') === tech) return list[j];
      }
    }
    return list[0];
  }
  function ensurePrintKeyMatchesOptions() {
    var pps = calcPrintOptions();
    if (pps.length === 0) { out.calcForm.printKey = ''; return; }
    var k = String(out.calcForm.printKey);
    for (var i = 0; i < pps.length; i++) { if (makePrintKeyFromRow(pps[i]) === k) return; }
    var p = parsePrintKey();
    var row = findPrintRowByColorSides(pps, p.color, p.sides, p.tech);
    if (row) { out.calcForm.printKey = makePrintKeyFromRow(row); return; }
    out.calcForm.printKey = '';
  }
  function onPickPrintColor(colorVal) {
    var pps = calcPrintOptions();
    if (pps.length === 0) return;
    var p = parsePrintKey();
    var row = findPrintRowByColorSides(pps, String(colorVal), p.sides, p.tech);
    if (row) out.calcForm.printKey = makePrintKeyFromRow(row);
    render();
    scheduleCalcRun();
  }
  function onPickPrintSides(sidesVal) {
    var pps = calcPrintOptions();
    if (pps.length === 0) return;
    var p = parsePrintKey();
    var row = findPrintRowByColorSides(pps, p.color, String(sidesVal), p.tech);
    if (row) out.calcForm.printKey = makePrintKeyFromRow(row);
    render();
    scheduleCalcRun();
  }
  function buildCalcPayload() {
    var p = parsePrintKey();
    var qn = Math.max(1, parseInt(String(out.calcForm.qty), 10) || 1);
    var pl = { quantity: qn, size_id: out.calcForm.sizeId, print_technology: p.tech, print_color_mode: p.color, print_sides_mode: p.sides };
    if (out.calcForm.matId != null) pl.material_id = out.calcForm.matId;
    if (out.calcForm.typeId != null) pl.type_id = out.calcForm.typeId;
    if (out.calcForm.priceType) pl.priceType = out.calcForm.priceType;
    return pl;
  }
  function runCalc(opts) {
    if (!out.calcPid) { return; }
    var soft = opts && opts.soft;
    if (!soft) {
      out.calcResult = null;
      out.calcErr = null;
    } else {
      out.calcErr = null;
    }
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
    var r = out.calcResult || {};
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
    var productTitle = out.calcName || r.productName || 'Товар';
    var summary = Array.isArray(r.parameterSummary) && r.parameterSummary.length
      ? r.parameterSummary.map(function (p) { return { label: String((p && p.label) || ''), value: String((p && p.value) || '') }; })
      : [];
    if (summary.length === 0) {
      if (typeName) summary.push({ label: 'Тип', value: typeName });
      summary.push({ label: 'Размер', value: sizeLabel });
      summary.push({ label: 'Материал', value: matName });
      (function () {
        var ppn = parsePrintKey();
        summary.push({ label: 'Тип печати', value: printColorModeLabel(ppn.color) });
        summary.push({ label: 'Стороны печати', value: printSidesModeLabel(ppn.sides) });
      })();
      summary.push({ label: 'Тираж', value: String(q) + ' шт.' });
    }
    var summaryText = summary.length ? summary.map(function (p) { return p.label + ': ' + p.value; }).join(' • ') : (q + ' шт.');
    var description = productTitle + ' • ' + summaryText;
    var services = Array.isArray(r.services) ? r.services.map(function (s) {
      return {
        operationId: s.operationId,
        operationName: s.operationName || s.service,
        operationType: s.operationType,
        priceUnit: s.priceUnit || s.unit,
        unitPrice: s.unitPrice != null ? s.unitPrice : s.price,
        quantity: s.quantity,
        totalCost: s.totalCost != null ? s.totalCost : s.total
      };
    }) : [];
    var materials = Array.isArray(r.materials) ? r.materials.map(function (m) {
      return {
        materialId: m.materialId,
        materialName: m.materialName,
        quantity: m.quantity,
        unitPrice: m.unitPrice,
        totalCost: m.totalCost,
        density: m.density,
        paper_type_name: m.paper_type_name
      };
    }) : [];
    var specs = (r.specifications && typeof r.specifications === 'object') ? JSON.parse(JSON.stringify(r.specifications)) : {};
    var selectedOps = specs.selectedOperations;
    try { delete specs.selectedOperations; } catch (e) {}
    var itemsPerSheet = r.layout && Number(r.layout.itemsPerSheet) > 0 ? Number(r.layout.itemsPerSheet) : null;
    var sheetsNeeded = r.layout && Number(r.layout.sheetsNeeded) > 0
      ? Number(r.layout.sheetsNeeded)
      : (itemsPerSheet ? Math.ceil(q / Math.max(itemsPerSheet, 1)) : undefined);
    var estimatedDelivery = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    var outParams = {
      productId: out.calcPid,
      productName: productTitle,
      source: 'miniapp',
      calculator: true,
      configuration: cfg,
      priceType: out.calcForm.priceType || (specs.priceType ? String(specs.priceType) : undefined),
      specifications: specs,
      materials: materials,
      services: services,
      productionTime: r.productionTime,
      productType: specs.productType,
      urgency: specs.priceType,
      customerType: specs.customerType,
      estimatedDelivery: estimatedDelivery,
      sheetsNeeded: sheetsNeeded,
      piecesPerSheet: itemsPerSheet != null ? itemsPerSheet : undefined,
      formatInfo: r.formatInfo,
      parameterSummary: summary,
      description: description
    };
    if (Array.isArray(selectedOps) && selectedOps.length > 0) outParams.selectedOperations = selectedOps;
    return outParams;
  }
  function calcAddToCart() {
    if (!out.calcResult || out.calcResult.finalPrice == null) { return; }
    var r = out.calcResult || {};
    var q = Math.max(1, parseInt(String(out.calcForm.qty), 10) || 1);
    var totalCost = Number(r.totalCost);
    var ppu = q > 0 && isFinite(totalCost) ? totalCost / q : Number(r.pricePerUnit);
    if (!isFinite(ppu) || ppu < 0) ppu = q > 0 ? Number(r.finalPrice) / q : 0;
    if (out.calcEditCartKey) {
      var re = out.calcEditCartKey;
      var ncart = [];
      for (var ri = 0; ri < out.cart.length; ri++) {
        if (out.cart[ri].k !== re) ncart.push(out.cart[ri]);
      }
      out.cart = ncart;
      if (out.checkoutFileByK && out.checkoutFileByK[re]) {
        try { delete out.checkoutFileByK[re]; } catch (e) {}
      }
    }
    var k = 'cx' + out.calcPid + '-' + String(out.calcForm.typeId) + '-' + String(out.calcForm.sizeId) + '-' + String(out.calcForm.matId) + '-' + String(out.calcForm.printKey);
    var name = (out.calcName || 'Товар') + ' (кальк.)';
    var found = -1;
    for (var i = 0; i < out.cart.length; i++) { if (out.cart[i].k === k) { found = i; break; } }
    var rich = buildCalcCartParams();
    var materials = Array.isArray(r.materials) ? r.materials : [];
    var components = [];
    for (var mi = 0; mi < materials.length; mi++) {
      var m = materials[mi] || {};
      var mid = Number(m.materialId);
      var mqty = Number(m.quantity);
      if (!isFinite(mid) || mid <= 0 || !isFinite(mqty)) continue;
      components.push({ materialId: Math.floor(mid), qtyPerItem: q > 0 ? Number((mqty / q).toFixed(6)) : Number(mqty) });
    }
    var line = { k: k, pid: out.calcPid, name: name, price: ppu, qty: q, type: String(out.calcPid), params: rich, components: components };
    if (found >= 0) out.cart[found] = line; else out.cart.push(line);
    out.checkoutFileByK = out.checkoutFileByK || {};
    if (out.calcStagedLayout) { out.checkoutFileByK[k] = out.calcStagedLayout; }
    out.calcStagedLayout = null;
    out.calcEditCartKey = null;
    out.view = 'cart';
    render();
  }
  function calcBack() {
    out.view = 'catalog';
    out.calcPid = null;
    out.calcStagedLayout = null;
    out.calcEditCartKey = null;
    out._pendingCalcRestore = null;
    render();
  }
  function renderCalculator() {
    var box = h('div', '', 'section');
    box.appendChild(h('div', esc(out.calcName || 'Калькулятор'), 'section-head'));
    var back = h('button', out.calcEditCartKey ? '← Корзина' : '← Каталог', 'small');
    back.type = 'button';
    back.onclick = function () {
      if (out.calcEditCartKey) {
        out._pendingCalcRestore = null;
        out.calcPid = null;
        out.calcStagedLayout = null;
        out.calcEditCartKey = null;
        out.view = 'cart';
        render();
        return;
      }
      calcBack();
    };
    box.appendChild(back);
    if (out.calcLoading && !out.calcSchema) { box.appendChild(rowHint('Загрузка схемы…')); return box; }
    if (out.calcErr) box.appendChild(rowHint(out.calcErr));
    if (out.calcLoading && out.calcSchema) box.appendChild(rowHint('Считаем…'));
    var simp = calcSimp();
    if (!simp) { if (!out.calcErr) box.appendChild(rowHint('Нет данных.')); return box; }
    var form = h('form', '', 'form');
    form.onsubmit = function (e) { e.preventDefault(); return false; };
    var types = calcTypes();
    if (types.length > 0) {
      if (out.calcForm.typeId == null) out.calcForm.typeId = types[0].id;
      var tidOk = false;
      for (var tix = 0; tix < types.length; tix++) {
        if (String(types[tix].id) === String(out.calcForm.typeId)) { tidOk = true; break; }
      }
      if (!tidOk) out.calcForm.typeId = types[0].id;
      if (types.length > 1) {
        var ts = document.createElement('select');
        ts.onchange = function () { out.calcForm.typeId = ts.value ? (isNaN(+ts.value) ? ts.value : +ts.value) : null; initCalcFormFromSchema(); render(); scheduleCalcRun(); };
        for (var ti = 0; ti < types.length; ti++) {
          var op = document.createElement('option');
          op.value = String(types[ti].id);
          op.textContent = types[ti].name || op.value;
          if (String(types[ti].id) === String(calcPickTypeId()) || String(types[ti].id) === String(out.calcForm.typeId)) op.selected = true;
          ts.appendChild(op);
        }
        ts.value = String(out.calcForm.typeId);
        addField(form, 'Тип / вариант', ts);
      }
    } else { out.calcForm.typeId = null; }
    var sizes = calcSizes(calcPickTypeId());
    if (sizes.length > 0) {
      var ss = document.createElement('select');
      ss.onchange = function () {
        out.calcForm.sizeId = ss.value ? (isNaN(+ss.value) ? ss.value : +ss.value) : null;
        var m = calcMaterials();
        if (m[0]) {
          out.calcForm.matId = m[0].id;
          syncCalcFormMatPaperKey(m);
        } else { out.calcForm.matId = null; out.calcForm.matPaperKey = null; }
        var pp = calcPrintOptions();
        if (pp[0]) out.calcForm.printKey = makePrintKeyFromRow(pp[0]);
        render();
        scheduleCalcRun();
      };
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
      if (shouldSplitMaterialSelects(matList)) {
        var grps = buildMaterialPaperGroups(matList);
        if (!out.calcForm.matPaperKey) syncCalcFormMatPaperKey(matList);
        var gcur = null;
        for (var gix = 0; gix < grps.length; gix++) {
          if (grps[gix].key === out.calcForm.matPaperKey) { gcur = grps[gix]; break; }
        }
        if (!gcur) { gcur = grps[0]; out.calcForm.matPaperKey = gcur.key; }
        var inGrp = gcur.items;
        var mOk = false;
        for (var mx = 0; mx < inGrp.length; mx++) {
          if (String(inGrp[mx].id) === String(out.calcForm.matId)) { mOk = true; break; }
        }
        if (!mOk && inGrp[0]) out.calcForm.matId = inGrp[0].id;
        var pty = document.createElement('select');
        pty.onchange = function () {
          out.calcForm.matPaperKey = pty.value || null;
          var gr2 = buildMaterialPaperGroups(matList);
          var g2 = null;
          for (var a = 0; a < gr2.length; a++) {
            if (gr2[a].key === out.calcForm.matPaperKey) { g2 = gr2[a]; break; }
          }
          if (g2 && g2.items[0]) {
            var prevD = null;
            for (var b = 0; b < matList.length; b++) {
              if (String(matList[b].id) === String(out.calcForm.matId)) { prevD = materialDensityNum(matList[b]); break; }
            }
            var pick = null;
            if (isFinite(prevD)) {
              for (var c = 0; c < g2.items.length; c++) {
                if (materialDensityNum(g2.items[c]) === prevD) { pick = g2.items[c]; break; }
              }
            }
            out.calcForm.matId = pick ? pick.id : g2.items[0].id;
          }
          render();
          scheduleCalcRun();
        };
        for (var pi = 0; pi < grps.length; pi++) {
          var po = document.createElement('option');
          po.value = grps[pi].key;
          po.textContent = grps[pi].label;
          pty.appendChild(po);
        }
        pty.value = gcur.key;
        addField(form, 'Тип материала', pty);
        var dns = document.createElement('select');
        dns.onchange = function () { out.calcForm.matId = dns.value ? +dns.value : null; render(); scheduleCalcRun(); };
        for (var di = 0; di < inGrp.length; di++) {
          var dopt = document.createElement('option');
          dopt.value = String(inGrp[di].id);
          dopt.textContent = materialDensityOptionLabel(inGrp[di]);
          dns.appendChild(dopt);
        }
        if (out.calcForm.matId != null) dns.value = String(out.calcForm.matId);
        if (out.calcForm.matId == null && inGrp[0]) out.calcForm.matId = inGrp[0].id;
        if (out.calcForm.matId != null) dns.value = String(out.calcForm.matId);
        addField(form, 'Плотность', dns);
      } else {
        out.calcForm.matPaperKey = null;
        var ms = document.createElement('select');
        ms.onchange = function () { out.calcForm.matId = ms.value ? +ms.value : null; render(); scheduleCalcRun(); };
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
    }
    var pps = calcPrintOptions();
    if (pps.length > 0) {
      ensurePrintKeyMatchesOptions();
      pps = calcPrintOptions();
      var uPColors = uniquePrintColorModes(pps);
      var uPSides = uniquePrintSidesModes(pps);
      var pCur = parsePrintKey();
      if (uPColors.length > 1) {
        var fCol = h('div', '', 'field ipc-field--price-type');
        fCol.appendChild(h('div', 'Тип печати', 'ipc-price-type__fieldtitle'));
        var rCol = h('div', '', 'ipc-price-type__btns');
        for (var pci = 0; pci < uPColors.length; pci++) {
          (function (cv) {
            var onC = String(pCur.color) === String(cv);
            var bc = document.createElement('button');
            bc.type = 'button';
            bc.className = 'ipc-price-type__btn' + (onC ? ' ipc-price-type__btn--on' : '');
            bc.setAttribute('aria-pressed', onC ? 'true' : 'false');
            bc.textContent = printColorModeLabel(cv);
            bc.onclick = function () { onPickPrintColor(cv); };
            rCol.appendChild(bc);
          })(uPColors[pci]);
        }
        fCol.appendChild(rCol);
        form.appendChild(fCol);
      }
      if (uPSides.length > 1) {
        var fSide = h('div', '', 'field ipc-field--price-type');
        fSide.appendChild(h('div', 'Стороны печати', 'ipc-price-type__fieldtitle'));
        var rSide = h('div', '', 'ipc-price-type__btns');
        for (var psi = 0; psi < uPSides.length; psi++) {
          (function (sv) {
            var onS = String(pCur.sides) === String(sv);
            var bs = document.createElement('button');
            bs.type = 'button';
            bs.className = 'ipc-price-type__btn' + (onS ? ' ipc-price-type__btn--on' : '');
            bs.setAttribute('aria-pressed', onS ? 'true' : 'false');
            bs.textContent = printSidesModeLabel(sv);
            bs.onclick = function () { onPickPrintSides(sv); };
            rSide.appendChild(bs);
          })(uPSides[psi]);
        }
        fSide.appendChild(rSide);
        form.appendChild(fSide);
      }
    } else { box.appendChild(rowHint('В шаблоне нет print_prices для размера — расчёт может быть недоступен.')); }
    var pts = calcAllowedPriceTypes();
    if (pts.length > 0) {
      if (!out.calcForm.priceType && pts[0]) out.calcForm.priceType = pts[0].key;
      var ptpOk = false;
      for (var pvi = 0; pvi < pts.length; pvi++) {
        if (String(pts[pvi].key) === String(out.calcForm.priceType || '')) { ptpOk = true; break; }
      }
      if (!ptpOk && pts[0]) out.calcForm.priceType = pts[0].key;
      if (pts.length > 1) {
        var ptField = h('div', '', 'field ipc-field--price-type');
        ptField.appendChild(h('div', 'Тип цены', 'ipc-price-type__fieldtitle'));
        var ptRow = h('div', '', 'ipc-price-type__btns');
        for (var pti = 0; pti < pts.length; pti++) {
          (function (pt) {
            var on = String(pt.key) === String(out.calcForm.priceType || '');
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'ipc-price-type__btn' + (on ? ' ipc-price-type__btn--on' : '');
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
            b.textContent = pt.label;
            b.onclick = function () {
              out.calcForm.priceType = pt.key;
              render();
              scheduleCalcRun();
            };
            ptRow.appendChild(b);
          })(pts[pti]);
        }
        ptField.appendChild(ptRow);
        var curPh = '';
        for (var hci = 0; hci < pts.length; hci++) {
          if (String(pts[hci].key) === String(out.calcForm.priceType || '')) {
            curPh = pts[hci].description || '';
            break;
          }
        }
        if (curPh) ptField.appendChild(h('p', esc(curPh), 'hint ipc-price-type__hint'));
        form.appendChild(ptField);
        var accF = h('div', '', 'field ipc-field--price-type-help');
        accF.appendChild(buildPriceTypeHelpAccordion());
        form.appendChild(accF);
      }
    }
    var qi = document.createElement('input');
    qi.name = 'q';
    qi.type = 'number';
    qi.min = '1';
    qi.value = String(out.calcForm.qty);
    qi.oninput = qi.onchange = function () { out.calcForm.qty = Math.max(1, parseInt(qi.value, 10) || 1); scheduleCalcRun(); };
    addField(form, 'Тираж (шт.)', qi);
    var dhRow = h('div', '', 'field ipc-design-help-row');
    var dhLabel = h('label', '', 'ipc-design-help');
    var dhIn = document.createElement('input');
    dhIn.type = 'checkbox';
    dhIn.checked = !!out.checkoutDesignHelp;
    dhIn.setAttribute('aria-label', 'Нет макета, нужна помощь с дизайном');
    dhIn.onchange = function () { out.checkoutDesignHelp = !!dhIn.checked; out.checkoutMsg = null; };
    dhLabel.appendChild(dhIn);
    dhLabel.appendChild(
      document.createTextNode(' Нет макета — требуется помощь с его разработкой')
    );
    dhRow.appendChild(dhLabel);
    form.appendChild(dhRow);
    var layIn = document.createElement('input');
    layIn.type = 'file';
    layIn.setAttribute('accept', 'application/pdf,image/*,.doc,.docx,.xls,.xlsx');
    layIn.onchange = function () { out.calcStagedLayout = (this.files && this.files[0]) ? this.files[0] : null; };
    addField(form, 'Макет к этой позиции (необяз., после расчёта — «В корзину»)', layIn);
    form.appendChild(h('p', 'Цена обновляется автоматически при смене параметров. Макет уйдёт в заказ с привязкой к позиции.', 'hint'));
    var calcPanel = h('div', '', 'ipc-panel');
    var calcInner = h('div', '', 'ipc-detail-block');
    calcInner.appendChild(form);
    calcPanel.appendChild(calcInner);
    box.appendChild(calcPanel);
    if (out.calcResult) {
      var r = out.calcResult;
      var resBox = h('div', '', 'ipc-calc-summary ipc-result');
      appendCalcResultSummaryUI(resBox, r);
      if (r.warnings && r.warnings.length) resBox.appendChild(h('p', esc(r.warnings.join('; ')), 'hint'));
      var addB = h('button', 'В корзину', 'primary');
      addB.type = 'button';
      addB.onclick = function () { calcAddToCart(); };
      resBox.appendChild(addB);
      var resPanel = h('div', '', 'ipc-panel');
      var resInner = h('div', '', 'ipc-detail-block');
      resInner.appendChild(resBox);
      resPanel.appendChild(resInner);
      box.appendChild(resPanel);
    }
    return box;
  }
`;

