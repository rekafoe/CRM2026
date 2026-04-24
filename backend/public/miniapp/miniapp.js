(function(){"use strict";const y="",b="",C="",t=`
  var _miniappAuthPromise = null;
  function getMiniappInitData() {
    var tg = window.Telegram && window.Telegram.WebApp;
    return (tg && tg.initData) ? tg.initData : '';
  }
  function miniappCloneHeaders(src) {
    var outHeaders = {};
    if (!src) return outHeaders;
    for (var k in src) {
      if (Object.prototype.hasOwnProperty.call(src, k)) outHeaders[k] = src[k];
    }
    return outHeaders;
  }
  function miniappJsonResponse(r) {
    return r.text().then(function (text) {
      var j = null;
      if (text) {
        try { j = JSON.parse(text); } catch (e) { j = null; }
      }
      return { ok: r.ok, status: r.status, j: j };
    });
  }
  function miniappEnsureSession(force) {
    if (out.token && !force) return Promise.resolve({ token: out.token });
    if (_miniappAuthPromise) return _miniappAuthPromise;
    var initData = getMiniappInitData();
    if (!initData) return Promise.resolve(null);
    _miniappAuthPromise = fetch(API_BASE + '/api/miniapp/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ initData: initData })
    })
      .then(function (r) { return miniappJsonResponse(r); })
      .then(function (x) {
        if (!x.ok || !x.j || !x.j.token) {
          out.token = null;
          return null;
        }
        out.token = x.j.token;
        return x.j;
      })
      .catch(function () {
        out.token = null;
        return null;
      })
      .then(function (result) {
        _miniappAuthPromise = null;
        return result;
      }, function (err) {
        _miniappAuthPromise = null;
        throw err;
      });
    return _miniappAuthPromise;
  }
  function miniappRequest(path, opts) {
    var options = opts || {};
    var attemptReauth = options.retry401 !== false;
    var headersBase = miniappCloneHeaders(options.headers);
    if (options.auth !== false && out.token && !headersBase.Authorization) {
      headersBase.Authorization = 'Bearer ' + out.token;
    }
    function doFetch(headersObj) {
      return fetch(API_BASE + path, {
        method: options.method || 'GET',
        headers: headersObj,
        body: options.body
      });
    }
    return doFetch(headersBase).then(function (r) {
      if (r.status !== 401 || options.auth === false || !attemptReauth) return r;
      return miniappEnsureSession(true).then(function (authRes) {
        if (!authRes || !out.token) return r;
        var retryHeaders = miniappCloneHeaders(options.headers);
        retryHeaders.Authorization = 'Bearer ' + out.token;
        return doFetch(retryHeaders);
      });
    });
  }
  function miniappRequestJson(path, opts) {
    return miniappRequest(path, opts).then(function (r) { return miniappJsonResponse(r); });
  }
`,r="0 0 3780 5315.63",i="M1667.66 2690.24c104.12,-0.5 365.38,-11.13 446.39,13.35 279.36,84.42 271.48,429.66 3.79,511.73 -79.56,24.4 -348.11,15.54 -450.15,13.76l0.08 -187.68 369.98 -0.3 0.16 -161.4 -370.58 -1.29 0.33 -188.17zm0.07 -604.24l653.99 -0.69 0.16 -161.09 -816.93 -0.07 -0.13 954.21 -208.72 0.15 0.43 162.65 208.15 0.76 0.21 349.18c111.37,-0.52 222.85,-0.05 334.23,-0.05 106.15,0 220.5,8.88 316.14,-17.04 379.05,-102.75 447.95,-590.61 110.72,-780.65 -82.93,-46.74 -155.85,-65.71 -268.51,-65.55 -109.25,0.16 -219.85,1.61 -329.7,-0.15l-0.04 -441.66z",a=()=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r}" fill="none" aria-hidden="true" focusable="false"><path d="${i}" fill="currentColor"/></svg>`.replace(/\s+/g," ");function n(){return' <span class="ipc-byn" role="img" aria-label="бел. руб.">'+a()+"</span>"}const o=`
  var out = {
    token: null, me: null, products: null, productErr: null, orders: null, ordersErr: null,
    cart: [], view: 'catalog', err: null, load: false, checkoutMsg: null, checkoutType: 'individual',
    checkoutLoading: false,
    finalizeLoading: false,
    draftOrderId: null,
    draftItemIds: null,
    draftOrderNumber: null,
    draftUploadedItemIds: null,
    calcPid: null, calcName: '', calcListItem: null, calcSchema: null, calcErr: null, calcLoading: false, calcResult: null,
    calcForm: { typeId: null, sizeId: null, matId: null, matPaperKey: null, qty: 100, printKey: '', priceType: '' },
    orderDetailId: null, orderDetailData: null, orderDetailErr: null, orderDetailLoading: false,
    orderFileMsg: null, orderUploadLoading: false,
    postCheckoutNotice: null,
    checkoutFileByK: null,
    /** Нет макета — нужна помощь с дизайном (не требовать файлы; сводка как «только печать»). */
    checkoutDesignHelp: false,
    calcStagedLayout: null,
    checkoutFileProgress: null,
    /** Правка строки из корзины: при «В корзину» старая позиция с этим k удаляется. */
    calcEditCartKey: null,
    _pendingCalcRestore: null
  };
  var nav, main;
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function bynSpanHtml() {
    return ${JSON.stringify(n())};
  }
  function h(tag, inner, cl) {
    var e = document.createElement(tag);
    if (cl) e.className = cl;
    if (inner != null) e.innerHTML = inner;
    return e;
  }
  function clearDraftCheckoutState() {
    out.draftOrderId = null;
    out.draftItemIds = null;
    out.draftOrderNumber = null;
    out.draftUploadedItemIds = null;
    out.finalizeLoading = false;
  }
  function setNav() {
    var tabs = [ ['catalog', 'Каталог'], ['profile', 'Профиль'], ['cart', 'Корзина'], ['orders', 'Заказы'] ];
    nav.innerHTML = '';
    for (var i = 0; i < tabs.length; i++) {
      (function (key, label) {
        var b = h('button', esc(label), 'tab' + ((out.view === key || (key === 'orders' && out.view === 'order_detail')) ? ' tab-on' : ''));
        b.type = 'button';
        b.onclick = function () {
          if (out.view === 'order_detail') {
            out.orderDetailId = null;
            out.orderDetailData = null;
            out.orderDetailErr = null;
            out.orderFileMsg = null;
            out.orderUploadLoading = false;
          }
          out.view = key;
          out.checkoutMsg = null;
          out.postCheckoutNotice = null;
          if (key === 'catalog' && !out.products) loadProducts();
          if (key === 'orders' && typeof loadOrders === 'function') loadOrders();
          render();
        };
        nav.appendChild(b);
      })(tabs[i][0], tabs[i][1]);
    }
  }
  function rowHint(msg) { return h('p', esc(msg), 'hint'); }
  function cartLineKey(pid) { return 'p' + pid; }
  function isSimplifiedProduct(p) {
    return p && String(p.calculator_type || '').toLowerCase() === 'simplified';
  }
  function stripHtmlTags(s) {
    if (s == null || s === '') return '';
    return String(s).replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim();
  }
  function shortProductDescription(p) {
    var d = stripHtmlTags(p && p.description != null ? p.description : '');
    if (d.length > 160) d = d.slice(0, 157) + '…';
    return d;
  }
  function productCardImageSrc(p) {
    if (!p) return '';
    var raw = (p.image_url != null && String(p.image_url).trim() !== '') ? String(p.image_url).trim() : '';
    if (!raw && p.icon != null) {
      var ic = String(p.icon).trim();
      if (ic.indexOf('http') === 0 || ic.indexOf('//') === 0 || ic.charAt(0) === '/') raw = ic;
    }
    if (!raw) return '';
    if (raw.indexOf('http') === 0 || raw.indexOf('//') === 0) return raw;
    if (raw.charAt(0) === '/') return API_BASE + raw;
    return '';
  }
  function addToCart(p) {
    if (isSimplifiedProduct(p)) {
      out.calcPid = p.id;
      out.calcName = p.name || 'Товар';
      out.calcListItem = p;
      out.calcSchema = null;
      out.calcErr = null;
      out.calcResult = null;
      out.calcStagedLayout = null;
      out.calcEditCartKey = null;
      out._pendingCalcRestore = null;
      out.calcForm = { typeId: null, sizeId: null, matId: null, matPaperKey: null, qty: 100, printKey: '', priceType: '' };
      out.view = 'calculator';
      if (typeof loadCalcSchema === 'function') loadCalcSchema();
      else { out.calcErr = 'Калькулятор не загружен'; render(); }
      return;
    }
    var id = p.id, price = (p.min_price != null && p.min_price !== '') ? Number(p.min_price) : 0;
    if (!isFinite(price)) price = 0;
    var k = cartLineKey(id);
    var idx = -1;
    for (var i = 0; i < out.cart.length; i++) { if (out.cart[i].k === k) { idx = i; break; } }
    clearDraftCheckoutState();
    if (idx >= 0) out.cart[idx].qty += 1; else {
      var pn = p.name || 'Товар';
      var priceTypeKey = String(p && (p.priceType || p.price_type || '') || '').trim();
      out.cart.push({
        k: k, pid: id, name: p.name, price: price, qty: 1, type: String(id),
        params: {
          productId: id,
          productName: pn,
          source: 'miniapp',
          ...(priceTypeKey ? { priceType: priceTypeKey } : {}),
          description: pn + ' — из каталога Mini App',
          parameterSummary: [
            { label: 'Продукт', value: pn },
            { label: 'Источник', value: 'Mini App, каталог' }
          ]
        }
      });
    }
    out.view = 'cart';
    render();
  }
  function setQty(k, d) {
    for (var i = 0; i < out.cart.length; i++) {
      if (out.cart[i].k !== k) continue;
      clearDraftCheckoutState();
      out.cart[i].qty = Math.max(1, out.cart[i].qty + d);
      render();
      return;
    }
  }
  function removeLine(k) {
    var a = [];
    for (var i = 0; i < out.cart.length; i++) { if (out.cart[i].k !== k) a.push(out.cart[i]); }
    clearDraftCheckoutState();
    out.cart = a;
    if (out.checkoutFileByK && out.checkoutFileByK[k]) { try { delete out.checkoutFileByK[k]; } catch (e) {} }
    render();
  }
  function cartToItems() {
    var items = [];
    for (var i = 0; i < out.cart.length; i++) {
      var c = out.cart[i];
      var p = c.params || {};
      var pt = p.priceType || p.price_type || '';
      var item = { type: c.type, params: c.params, price: c.price, quantity: c.qty };
      if (pt) item.priceType = pt;
      if (Array.isArray(c.components) && c.components.length > 0) item.components = c.components;
      items.push(item);
    }
    return items;
  }
  function subtotal() {
    var t = 0;
    for (var i = 0; i < out.cart.length; i++) t += out.cart[i].price * out.cart[i].qty;
    return Math.round(t * 100) / 100;
  }
  function cartLineSummaryEsc(line) {
    var name = (line.params && line.params.productName) ? String(line.params.productName) : String(line.name || 'Позиция');
    var lineTot = Math.round(line.price * line.qty * 100) / 100;
    var unit = Math.round(line.price * 100) / 100;
    return esc(name) + ' — ' + line.qty + ' шт — ' + lineTot + bynSpanHtml() + ' — ' + unit + bynSpanHtml() + ' за 1 ед.';
  }
  function renderProfile() {
    var box = h('div', '', 'section');
    if (out.load) { box.appendChild(rowHint('Вход…')); return box; }
    if (out.err) { box.appendChild(rowHint('Ошибка: ' + out.err)); return box; }
    if (!out.me || !out.me.telegram) { box.appendChild(rowHint('Нет данных профиля.')); return box; }
    var t = out.me.telegram || {};
    box.appendChild(h('div', 'Профиль', 'section-head'));
    var prPanel = h('div', '', 'ipc-panel');
    var prInner = h('div', '', 'ipc-detail-block');
    prInner.appendChild(h('p', 'Имя: ' + esc(t.first_name || '—') + (t.last_name ? ' ' + esc(t.last_name) : ''), 'line'));
    prInner.appendChild(h('p', 'Username: ' + (t.username ? '@' + esc(t.username) : '—'), 'line'));
    prInner.appendChild(h('p', 'Статус: ' + esc(t.role || 'клиент'), 'line'));
    if (out.me.crm && out.me.crm.phone) {
      prInner.appendChild(h('p', 'Телефон в CRM: ' + esc(out.me.crm.phone), 'line'));
    }
    prPanel.appendChild(prInner);
    box.appendChild(prPanel);
    return box;
  }
  function renderCatalog() {
    var box = h('div', '', 'section');
    if (out.productErr) box.appendChild(rowHint(out.productErr));
    if (!out.products) { box.appendChild(rowHint('Загрузка каталога…')); return box; }
    if (out.products.length === 0) { box.appendChild(h('p', 'Нет товаров для сайта (forSite).', 'hint ipc-empty')); return box; }
    box.appendChild(h('div', 'Каталог', 'section-head'));
    var grid = h('div', '', 'catalog-grid ipc-catalog-grid');
    for (var i = 0; i < out.products.length; i++) {
      (function (p) {
        var row = h('div', '', 'card ipc-card ipc-catalog-card');
        row.appendChild(h('div', esc(p.name || 'Товар'), 'card-title ipc-catalog-card__title'));
        var imgSrc = productCardImageSrc(p);
        var media = h('div', '', 'ipc-catalog-card__media' + (imgSrc ? '' : ' ipc-catalog-card__media--empty'));
        if (imgSrc) {
          var im = document.createElement('img');
          im.className = 'ipc-catalog-card__img';
          im.alt = '';
          im.loading = 'lazy';
          im.src = imgSrc;
          media.appendChild(im);
        }
        row.appendChild(media);
        var blurb = shortProductDescription(p);
        if (blurb) row.appendChild(h('div', esc(blurb), 'ipc-catalog-card__desc'));
        var price =
          p.min_price != null && p.min_price !== ''
            ? 'от <span class="ipc-catalog-card__price-amount">' + esc(p.min_price) + bynSpanHtml() + '</span>'
            : 'цена по запросу';
        row.appendChild(h('div', price, 'card-price ipc-catalog-card__price'));
        var btn = h('button', isSimplifiedProduct(p) ? 'Заказать' : 'В корзину', 'primary ipc-catalog-card__btn');
        btn.type = 'button';
        btn.onclick = function () { addToCart(p); };
        row.appendChild(btn);
        grid.appendChild(row);
      })(out.products[i]);
    }
    box.appendChild(grid);
    return box;
  }
  function orderMetaUnavail() {
    return out.orders && out.orders.meta && out.orders.meta.telegram_orders === false;
  }
  function renderOrders() {
    var box = h('div', '', 'section');
    box.appendChild(h('div', 'Мои заказы', 'section-head'));
    if (out.postCheckoutNotice) {
      box.appendChild(h('p', esc(out.postCheckoutNotice), 'okmsg'));
    }
    if (out.ordersErr) box.appendChild(rowHint(out.ordersErr));
    if (!out.orders) { box.appendChild(rowHint('Загрузка…')); return box; }
    if (orderMetaUnavail()) { box.appendChild(rowHint('Список заказов пока недоступен (нужна миграция telegram_chat_id).')); return box; }
    var list = out.orders.orders || [];
    if (list.length === 0) { box.appendChild(h('p', 'Заказов пока нет.', 'hint ipc-empty')); return box; }
    var panel = h('div', '', 'ipc-panel');
    var listEl = h('div', '', 'ipc-list');
    for (var j = 0; j < list.length; j++) {
      (function (o) {
        var row = h('div', '', 'ipc-list__row');
        var top = h('div', '', 'ipc-list__row-top');
        var left = h('div', '', '');
        left.appendChild(h('div', esc(o.number || '—'), 'ipc-list__title'));
        var chip = document.createElement('span');
        chip.className = 'ipc-chip ipc-chip--slate';
        chip.textContent = o.status_name ? String(o.status_name) : ('Статус ' + o.status);
        top.appendChild(left);
        top.appendChild(chip);
        row.appendChild(top);
        if (o.created_at) row.appendChild(h('div', esc(o.created_at), 'ipc-list__meta'));
        var act = h('div', '', 'ipc-list__actions ipc-list__actions--wide');
        var op = h('button', 'Открыть', 'primary');
        op.type = 'button';
        op.onclick = function () {
          out.view = 'order_detail';
          out.orderDetailId = o.id;
          out.orderDetailData = null;
          out.orderDetailErr = null;
          out.orderFileMsg = null;
          if (typeof loadOrderDetail === 'function') loadOrderDetail(); else render();
        };
        act.appendChild(op);
        row.appendChild(act);
        listEl.appendChild(row);
      })(list[j]);
    }
    panel.appendChild(listEl);
    box.appendChild(panel);
    return box;
  }
  function addField(form, text, el) {
    var w = h('div', '', 'field');
    var lab = document.createElement('label');
    var sp = document.createElement('span');
    sp.textContent = text;
    lab.appendChild(sp);
    lab.appendChild(el);
    w.appendChild(lab);
    form.appendChild(w);
  }
`,l=`
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
`,c=`
  function downloadOrderFile(fileId, suggestedName) {
    if (!out.token || !out.orderDetailId) return;
    out.orderFileMsg = null;
    miniappRequest('/api/miniapp/orders/' + out.orderDetailId + '/files/' + fileId, { headers: {} })
      .then(function (r) {
        if (r.ok) return r.blob();
        return miniappJsonResponse(r).then(function (x) { throw new Error((x.j && (x.j.error || x.j.message)) ? String(x.j.error || x.j.message) : ('HTTP ' + x.status)); });
      })
      .then(function (blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (suggestedName && String(suggestedName)) || 'file';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (e) {} }, 2000);
      })
      .catch(function (err) {
        out.orderFileMsg = (err && err.message) || String(err);
        render();
      });
  }
  function fmtFileSize(n) {
    if (n == null || !isFinite(Number(n))) return '—';
    var b = Math.floor(Number(n));
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (Math.round(b / 102.4) / 10) + ' KB';
    return (Math.round(b / 10485.76) / 10) + ' MB';
  }
  function loadOrderDetail(silent) {
    if (!out.token || !out.orderDetailId) return;
    var isSilent = !!silent;
    if (!isSilent) {
      out.orderDetailLoading = true;
      out.orderDetailErr = null;
      render();
    }
    miniappRequestJson('/api/miniapp/orders/' + out.orderDetailId, { headers: { Accept: 'application/json' } })
      .then(function (x) {
        if (!isSilent) out.orderDetailLoading = false;
        if (!x.ok) {
          if (!isSilent) {
            out.orderDetailErr = (x.j && (x.j.error || x.j.message)) ? String(x.j.error || x.j.message) : 'Ошибка загрузки';
            out.orderDetailData = null;
          }
          render();
          return;
        }
        out.orderDetailData = x.j;
        out.orderDetailErr = null;
        render();
      })
      .catch(function (err) {
        if (!isSilent) {
          out.orderDetailLoading = false;
          out.orderDetailErr = (err && err.message) || String(err);
          out.orderDetailData = null;
        }
        render();
      });
  }
  function renderOrderDetail() {
    var box = h('div', '', 'section');
    var back = h('button', '← К списку', 'small');
    back.type = 'button';
    back.onclick = function () {
      out.view = 'orders';
      out.orderDetailId = null;
      out.orderDetailData = null;
      out.orderDetailErr = null;
      out.orderFileMsg = null;
      out.orderUploadLoading = false;
      if (typeof loadOrders === 'function') loadOrders();
      render();
    };
    box.appendChild(back);
    box.appendChild(h('h2', 'Заказ', 'section-head'));
    if (out.orderDetailLoading && !out.orderDetailData) {
      box.appendChild(rowHint('Загрузка…'));
      return box;
    }
    if (out.orderDetailErr && !out.orderDetailData) {
      box.appendChild(rowHint(out.orderDetailErr));
      return box;
    }
    var d = out.orderDetailData;
    if (!d || !d.order) {
      box.appendChild(rowHint('Нет данных.'));
      return box;
    }
    var ord = d.order;
    var sumPanel = h('div', '', 'ipc-panel');
    var sumInner = h('div', '', 'ipc-detail-block');
    var headRow = h('div', '', 'ipc-list__row-top');
    headRow.appendChild(h('div', esc(ord.number || '—'), 'ipc-list__title'));
    var stChip = document.createElement('span');
    stChip.className = 'ipc-chip ipc-chip--slate';
    stChip.textContent = ord.status_name ? String(ord.status_name) : ('Статус ' + ord.status);
    headRow.appendChild(stChip);
    sumInner.appendChild(headRow);
    if (ord.created_at) sumInner.appendChild(h('div', esc(ord.created_at), 'ipc-list__meta'));
    if (ord.notes) sumInner.appendChild(h('p', 'Комментарий: ' + esc(ord.notes), 'line'));
    sumPanel.appendChild(sumInner);
    box.appendChild(sumPanel);
    box.appendChild(h('h3', 'Позиции', 'ipc-subhead'));
    var items = d.items && d.items.length ? d.items : [];
    if (items.length === 0) {
      box.appendChild(h('p', 'Нет позиций.', 'hint ipc-empty'));
    } else {
      var itPanel = h('div', '', 'ipc-panel');
      var itList = h('div', '', 'ipc-list');
      for (var i = 0; i < items.length; i++) {
        (function (it) {
          var t = '#' + it.id + ' ' + esc(it.type) + ' × ' + it.quantity + ' — ' + esc(String(it.price)) + bynSpanHtml();
          var ir = h('div', '', 'ipc-list__row');
          ir.appendChild(h('div', t, 'ipc-list__row-summary'));
          itList.appendChild(ir);
        })(items[i]);
      }
      itPanel.appendChild(itList);
      box.appendChild(itPanel);
    }
    box.appendChild(h('h3', 'Файлы', 'ipc-subhead'));
    var files = d.files && d.files.length ? d.files : [];
    if (files.length === 0) {
      box.appendChild(h('p', 'Пока нет вложений.', 'hint ipc-empty'));
    } else {
      var flPanel = h('div', '', 'ipc-panel');
      var flList = h('div', '', 'ipc-list');
      for (var f = 0; f < files.length; f++) {
        (function (fl) {
          var fn = fl.originalName || fl.filename || 'файл';
          var sub = (fl.orderItemId != null ? 'к позиции #' + fl.orderItemId : 'к заказу') + ' · ' + fmtFileSize(fl.size);
          var ir = h('div', '', 'ipc-list__row');
          ir.appendChild(h('div', esc(fn) + ' — ' + sub, 'ipc-list__row-summary'));
          var act = h('div', '', 'ipc-list__actions');
          var db = h('button', 'Скачать', 'small');
          db.type = 'button';
          db.onclick = function () { downloadOrderFile(fl.id, fn); };
          act.appendChild(db);
          ir.appendChild(act);
          flList.appendChild(ir);
        })(files[f]);
      }
      flPanel.appendChild(flList);
      box.appendChild(flPanel);
    }
    if (out.orderFileMsg) box.appendChild(h('p', esc(out.orderFileMsg), out.orderFileMsg.indexOf('прикреп') >= 0 || out.orderFileMsg.indexOf('успе') >= 0 ? 'okmsg' : 'hint'));
    var form = document.createElement('form');
    form.className = 'form ipc-card';
    form.onsubmit = function (e) {
      e.preventDefault();
      if (!out.token || !out.orderDetailId) return false;
      var fileInp = form.querySelector('input[type=file]');
      if (!fileInp || !fileInp.files || !fileInp.files[0]) {
        out.orderFileMsg = 'Выберите файл';
        render();
        return false;
      }
      var fd = new FormData();
      fd.append('file', fileInp.files[0]);
      var sel = form.querySelector('select[name=orderItemId]');
      if (sel && sel.value) fd.append('orderItemId', sel.value);
      out.orderUploadLoading = true;
      out.orderFileMsg = null;
      render();
      miniappRequestJson('/api/miniapp/orders/' + out.orderDetailId + '/files', { method: 'POST', headers: {}, body: fd })
        .then(function (x) {
          out.orderUploadLoading = false;
          if (!x.ok) {
            out.orderFileMsg = (x.j && (x.j.error || x.j.message)) ? String(x.j.error || x.j.message) : 'Не удалось прикрепить';
            render();
            return;
          }
          out.orderFileMsg = 'Файл прикреплён';
          fileInp.value = '';
          loadOrderDetail();
        })
        .catch(function (err) {
          out.orderUploadLoading = false;
          out.orderFileMsg = (err && err.message) || String(err);
          render();
        });
      return false;
    };
    var fileEl = document.createElement('input');
    fileEl.type = 'file';
    fileEl.name = 'file';
    addField(form, 'Файл', fileEl);
    var sel2 = document.createElement('select');
    sel2.name = 'orderItemId';
    sel2.innerHTML = '<option value="">Весь заказ (не к позиции)</option>';
    for (var j = 0; j < items.length; j++) {
      (function (it) {
        var o = document.createElement('option');
        o.value = String(it.id);
        o.textContent = 'Позиция #' + it.id + ' — ' + String(it.type).substring(0, 40);
        sel2.appendChild(o);
      })(items[j]);
    }
    addField(form, 'Привязка', sel2);
    var upBtn = h('button', out.orderUploadLoading ? 'Отправка…' : 'Прикрепить файл', 'primary');
    upBtn.type = 'submit';
    if (out.orderUploadLoading) upBtn.disabled = true;
    form.appendChild(upBtn);
    box.appendChild(h('h3', 'Прикрепить файл', 'ipc-subhead'));
    box.appendChild(form);
    return box;
  }
`,p=`
  function renderCart() {
    var box = h('div', '', 'section');
    box.appendChild(h('div', 'Корзина', 'section-head'));
    if (out.checkoutMsg) box.appendChild(h('p', esc(out.checkoutMsg), 'hint ipc-checkout-validate'));
    if (out.cart.length === 0) {
      box.appendChild(h('p', 'Пока пусто. Добавьте позиции из каталога.', 'hint ipc-empty'));
      return box;
    }
    out.checkoutFileByK = out.checkoutFileByK || {};
    var panel = h('div', '', 'ipc-panel');
    var listEl = h('div', '', 'ipc-list');
    for (var i = 0; i < out.cart.length; i++) {
      (function (c) {
        var row = h('div', '', 'ipc-list__row ipc-list__row--cart');
        var sumLine = cartLineSummaryEsc(c) + (out.checkoutFileByK[c.k] ? ' — макет к позиции выбран' : '');
        row.appendChild(h('div', sumLine, 'ipc-list__row-summary'));
        var tools = h('div', '', 'row');
        if (c.params && c.params.calculator) {
          var edc = h('button', 'Изменить', 'small'); edc.type = 'button'; edc.onclick = function () { if (typeof openCartLineForEdit === 'function') openCartLineForEdit(c); };
          tools.appendChild(edc);
        }
        var m = h('button', '−', 'small'); m.type = 'button'; m.onclick = function () { setQty(c.k, -1); };
        var p = h('button', '+', 'small'); p.type = 'button'; p.onclick = function () { setQty(c.k, 1); };
        var r = h('button', 'Убрать', 'small danger'); r.type = 'button'; r.onclick = function () { removeLine(c.k); };
        tools.appendChild(m); tools.appendChild(p); tools.appendChild(r);
        row.appendChild(tools);
        listEl.appendChild(row);
      })(out.cart[i]);
    }
    panel.appendChild(listEl);
    box.appendChild(panel);
    var dhRow = h('div', '', 'field ipc-design-help-row');
    var dhWrap = h('label', '', 'ipc-design-help');
    var dh = document.createElement('input');
    dh.type = 'checkbox';
    dh.checked = !!out.checkoutDesignHelp;
    dh.onchange = function () {
      if (typeof clearDraftCheckoutState === 'function') clearDraftCheckoutState();
      out.checkoutDesignHelp = !!dh.checked;
      out.checkoutMsg = null;
      render();
    };
    dhWrap.appendChild(dh);
    dhWrap.appendChild(document.createTextNode(' Нет макета — требуется помощь с его разработкой'));
    dhRow.appendChild(dhWrap);
    box.appendChild(dhRow);
    if (out.checkoutDesignHelp) {
      box.appendChild(
        h(
          'p',
          'Без макета файлы не обязательны. Указанная ниже сумма — только печать. Разработка дизайна оценивается отдельно по телефону; итоговая стоимость заказа может измениться.',
          'hint ipc-checkout-design-hint'
        )
      );
    } else {
      box.appendChild(
        h('p', 'Макет к позиции из калькулятора добавьте в калькуляторе до кнопки «В корзину». Или отметьте, что макета нет и нужна помощь с дизайном.', 'hint')
      );
    }
    box.appendChild(h('div', 'Итого: ' + subtotal() + bynSpanHtml(), 'total ipc-total'));
    var go = h('button', 'Оформить заказ', 'primary');
    go.type = 'button';
    go.onclick = function () {
      if (!out.checkoutDesignHelp) {
        out.checkoutFileByK = out.checkoutFileByK || {};
        for (var vi = 0; vi < out.cart.length; vi++) {
          if (!out.checkoutFileByK[out.cart[vi].k]) {
            out.checkoutMsg = 'Добавьте макет в калькуляторе (до «В корзину») или отметьте «Нет макета — требуется помощь с его разработкой».';
            _miniappScrollTop();
            render();
            return;
          }
        }
      }
      out.view = 'checkout';
      out.checkoutMsg = null;
      out.postCheckoutNotice = null;
      render();
    };
    box.appendChild(go);
    return box;
  }
  function renderCheckout() {
    var box = h('div', '', 'section');
    box.appendChild(h('div', 'Оформление', 'section-head'));
    if (out.checkoutMsg) box.appendChild(h('p', esc(out.checkoutMsg), 'okmsg'));
    if (out.checkoutFileProgress) box.appendChild(h('p', esc(out.checkoutFileProgress), 'hint'));
    if (out.draftOrderId) {
      box.appendChild(
        h(
          'p',
          'Черновик ' + esc(out.draftOrderNumber || ('#' + out.draftOrderId)) + ' уже создан. Повторная отправка продолжит загрузку файлов и финализацию, а не создаст новый заказ.',
          'hint'
        )
      );
    }
    var sumPanel = h('div', '', 'ipc-panel');
    var sumInner = h('div', '', 'ipc-detail-block');
    sumInner.appendChild(h('div', 'Позиции', 'ipc-subhead'));
    for (var si = 0; si < out.cart.length; si++) {
      sumInner.appendChild(h('p', cartLineSummaryEsc(out.cart[si]), 'line'));
    }
    if (out.checkoutDesignHelp) {
      sumInner.appendChild(h('p', 'Цена печати: ' + subtotal() + bynSpanHtml(), 'total'));
      sumInner.appendChild(
        h(
          'p',
          'Цена разработки дизайна будет просчитана в индивидуальном порядке по телефону. Окончательная стоимость заказа изменится.',
          'hint ipc-checkout-design-note'
        )
      );
    } else {
      sumInner.appendChild(h('p', 'Итого: ' + subtotal() + bynSpanHtml(), 'total'));
    }
    sumPanel.appendChild(sumInner);
    box.appendChild(sumPanel);
    var form = document.createElement('form');
    form.className = 'form';
    form.setAttribute('novalidate', 'novalidate');
    form.onsubmit = function (e) { e.preventDefault(); doCheckout(this); return false; };
    var isLeg = out.checkoutType === 'legal';
    var sel = document.createElement('select');
    sel.name = 'cust-type';
    sel.innerHTML = '<option value="individual">Физ. лицо</option><option value="legal">Юр. лицо</option>';
    sel.value = isLeg ? 'legal' : 'individual';
    sel.onchange = function () { out.checkoutType = sel.value; render(); };
    addField(form, 'Тип', sel);
    if (!isLeg) {
      var tg = out.me && out.me.telegram;
      if (tg) {
        var who = (tg.first_name || '—') + (tg.last_name ? ' ' + tg.last_name : '') + (tg.username ? ' (@' + tg.username + ')' : '');
        box.appendChild(h('p', 'Контакт в заказе: ' + esc(who) + ' (как в Telegram; имя на сервере подставится из профиля).', 'hint'));
      } else {
        box.appendChild(h('p', 'Вход через Telegram: имя для заказа подставит сервер по вашему профилю.', 'hint'));
      }
    } else {
      var c1 = document.createElement('input');
      c1.name = 'co';
      c1.type = 'text';
      c1.required = true;
      addField(form, 'Компания', c1);
    }
    var ph = document.createElement('input');
    ph.name = 'phone';
    ph.type = 'tel';
    ph.setAttribute('autocomplete', 'tel');
    var crmPhone = out.me && out.me.crm && out.me.crm.phone;
    if (crmPhone) {
      ph.value = String(crmPhone);
      ph.removeAttribute('required');
      addField(form, 'Телефон', ph);
      form.appendChild(h('p', 'Подставлен из CRM; при необходимости измените.', 'hint'));
    } else {
      ph.required = true;
      addField(form, 'Телефон', ph);
    }
    if (isLeg) {
      var em = document.createElement('input');
      em.name = 'email';
      em.type = 'email';
      em.setAttribute('autocomplete', 'email');
      addField(form, 'Email (необяз.)', em);
    }
    var no = document.createElement('textarea');
    no.name = 'notes';
    no.rows = 2;
    addField(form, 'Комментарий', no);
    var dhh = document.createElement('input');
    dhh.type = 'hidden';
    dhh.name = 'design_help';
    dhh.value = out.checkoutDesignHelp ? '1' : '0';
    form.appendChild(dhh);
    form.appendChild(
      h(
        'p',
        out.checkoutDesignHelp
          ? 'Сначала будет создан черновик, затем заказ сразу финализируется без файлов. Сумма заказа — печать; дизайн согласуем отдельно.'
          : 'Сначала будет создан черновик заказа, затем макеты прикрепятся к позициям и только после этого произойдёт финализация.',
        'hint'
      )
    );
    var subText = 'Создать черновик и завершить';
    if (out.draftOrderId && !out.checkoutLoading) subText = 'Продолжить финализацию';
    else if (out.checkoutLoading) subText = out.checkoutFileProgress || (out.finalizeLoading ? 'Финализация…' : 'Отправка…');
    var sub = h('button', subText, 'primary');
    sub.type = 'submit';
    if (out.checkoutLoading) sub.disabled = true;
    form.appendChild(sub);
    var coPanel = h('div', '', 'ipc-panel');
    var coInner = h('div', '', 'ipc-detail-block');
    coInner.appendChild(form);
    coPanel.appendChild(coInner);
    box.appendChild(coPanel);
    return box;
  }
  function loadProducts() {
    out.productErr = null;
    var listPath = '/api/products?forSite=1&withMinPrice=1';
    if (typeof CATALOG_CATEGORY_ID === 'number' && CATALOG_CATEGORY_ID > 0) {
      listPath = '/api/products/category/' + CATALOG_CATEGORY_ID + '?forSite=1&withMinPrice=1';
    }
    miniappRequest(listPath, { headers: { Accept: 'application/json' }, auth: false, retry401: false })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) { out.products = Array.isArray(data) ? data : []; render(); })
      .catch(function (err) { out.productErr = (err && err.message) || String(err); out.products = []; render(); });
  }
  function loadOrders() {
    if (!out.token) return;
    out.ordersErr = null;
    miniappRequestJson('/api/miniapp/orders', { headers: { Accept: 'application/json' } })
      .then(function (x) {
        if (!x.ok) { out.ordersErr = (x.j && x.j.error) ? String(x.j.error) : 'Ошибка'; out.orders = { orders: [], meta: { telegram_orders: true } }; }
        else out.orders = x.j;
        render();
      })
      .catch(function (err) { out.ordersErr = (err && err.message) || String(err); out.orders = { orders: [], meta: { telegram_orders: true } }; render(); });
  }
  function _miniappScrollTop() {
    try {
      if (window.scrollTo) window.scrollTo(0, 0);
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    } catch (e) {}
  }
  var _miniappPrevView = '';
  function render() {
    setNav();
    var viewChanged = _miniappPrevView !== out.view;
    _miniappPrevView = out.view;
    main.innerHTML = '';
    if (out.view === 'profile') main.appendChild(renderProfile());
    else if (out.view === 'catalog') main.appendChild(renderCatalog());
    else if (out.view === 'cart') main.appendChild(renderCart());
    else if (out.view === 'orders') main.appendChild(renderOrders());
    else if (out.view === 'order_detail') main.appendChild(renderOrderDetail());
    else if (out.view === 'checkout') main.appendChild(renderCheckout());
    else if (out.view === 'calculator') main.appendChild(renderCalculator());
    if (viewChanged) _miniappScrollTop();
  }
  function boot() {
    nav = $('miniapp-nav');
    main = $('miniapp-main');
    var tg = window.Telegram && window.Telegram.WebApp;
    if (tg) { try { tg.ready(); tg.expand(); } catch (ex) {} }
    var initData = (tg && tg.initData) ? tg.initData : '';
    if (!initData) {
      if (main) main.appendChild(rowHint('Откройте из Telegram (web_app). В браузере initData нет.'));
      return;
    }
    out.load = true;
    render();
    miniappEnsureSession(true)
      .then(function (x) {
        out.load = false;
        if (!x || !x.token) {
          out.err = 'auth failed';
          render();
          return null;
        }
        return miniappRequestJson('/api/miniapp/me', { headers: { Accept: 'application/json' } });
      })
      .then(function (meResp) {
        if (meResp && meResp.ok && meResp.j) {
          var me = meResp.j;
          if (me.telegram) out.me = { telegram: me.telegram, crm: me.crm != null ? me.crm : null };
          else if (me.me && me.me.telegram) out.me = { telegram: me.me.telegram, crm: me.crm != null ? me.crm : null };
          out.err = null;
        } else if (meResp && !meResp.ok) {
          out.me = null;
          out.err = (meResp.j && (meResp.j.error || meResp.j.message)) ? String(meResp.j.error || meResp.j.message) : ('HTTP ' + meResp.status);
        }
        if (out.view === 'catalog' && !out.products) loadProducts();
        render();
        if (out.token && !out._miniappOrdersPollInit) {
          out._miniappOrdersPollInit = true;
          function refreshOrdersViewIfOpen() {
            if (!out.token) return;
            if (out.view === 'orders' && typeof loadOrders === 'function') loadOrders();
            else if (out.view === 'order_detail' && out.orderDetailId && typeof loadOrderDetail === 'function') loadOrderDetail(true);
          }
          setInterval(refreshOrdersViewIfOpen, 20000);
          document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') refreshOrdersViewIfOpen();
          });
        }
      })
      .catch(function (err) { out.load = false; out.err = (err && err.message) || String(err); render(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();`,u=`
  function uploadCheckoutFilesSequential(orderId, tasks, index, errors, done) {
    if (!tasks || index >= tasks.length) { done(errors); return; }
    out.checkoutFileProgress = 'Прикрепляем файлы: ' + (index + 1) + ' / ' + tasks.length;
    render();
    var t = tasks[index];
    var fd = new FormData();
    fd.append('file', t.file);
    if (t.orderItemId != null && t.orderItemId !== '') fd.append('orderItemId', String(t.orderItemId));
    miniappRequestJson('/api/miniapp/orders/' + orderId + '/files', { method: 'POST', body: fd, headers: {} })
      .then(function (x) {
        if (!x.ok) errors.push((x.j && (x.j.message || x.j.error)) ? String(x.j.message || x.j.error) : ('Файл ' + (index + 1)));
        else if (t.orderItemId != null && t.orderItemId !== '') {
          out.draftUploadedItemIds = Array.isArray(out.draftUploadedItemIds) ? out.draftUploadedItemIds : [];
          if (out.draftUploadedItemIds.indexOf(t.orderItemId) < 0) out.draftUploadedItemIds.push(t.orderItemId);
        }
        uploadCheckoutFilesSequential(orderId, tasks, index + 1, errors, done);
      })
      .catch(function (err) {
        errors.push((err && err.message) ? String(err.message) : ('Файл ' + (index + 1)));
        uploadCheckoutFilesSequential(orderId, tasks, index + 1, errors, done);
      });
  }
  function finishCheckoutSuccess(orderNumber) {
    out.checkoutLoading = false;
    out.finalizeLoading = false;
    out.checkoutFileProgress = null;
    out.checkoutFileByK = null;
    out.checkoutDesignHelp = false;
    out.cart = [];
    out.orders = null;
    if (typeof clearDraftCheckoutState === 'function') clearDraftCheckoutState();
    out.postCheckoutNotice = orderNumber ? ('Заказ ' + orderNumber + ' оформлен.') : null;
    out.checkoutMsg = null;
    out.view = 'orders';
    loadOrders();
  }
  function buildCheckoutUploadTasks() {
    var byK = out.checkoutFileByK || {};
    var itemIds = Array.isArray(out.draftItemIds) ? out.draftItemIds : [];
    var uploaded = Array.isArray(out.draftUploadedItemIds) ? out.draftUploadedItemIds : [];
    var tasks = [];
    for (var ti = 0; ti < out.cart.length; ti++) {
      var ck = out.cart[ti].k;
      var fid = itemIds[ti];
      var one = byK[ck];
      if (uploaded.indexOf(fid) >= 0) continue;
      if (one && fid != null && fid !== '') tasks.push({ file: one, orderItemId: fid });
    }
    return tasks;
  }
  function finalizeCheckoutDraft(orderId, orderNumber) {
    out.finalizeLoading = true;
    out.checkoutFileProgress = 'Финализируем заказ…';
    render();
    miniappRequestJson('/api/miniapp/orders/' + orderId + '/finalize', {
      method: 'POST',
      headers: { Accept: 'application/json' }
    })
      .then(function (x) {
        if (!x.ok) {
          out.checkoutLoading = false;
          out.finalizeLoading = false;
          out.checkoutFileProgress = null;
          out.checkoutMsg = (x.j && (x.j.error || x.j.message))
            ? String(x.j.error || x.j.message)
            : 'Не удалось завершить оформление';
          _miniappScrollTop();
          render();
          return;
        }
        var ord = x.j && x.j.order;
        var num = (ord && ord.number) ? String(ord.number) : (orderNumber || '');
        finishCheckoutSuccess(num);
      })
      .catch(function (err) {
        out.checkoutLoading = false;
        out.finalizeLoading = false;
        out.checkoutFileProgress = null;
        out.checkoutMsg = (err && err.message) || String(err);
        _miniappScrollTop();
        render();
      });
  }
  function continueCheckoutWithDraft(orderId, orderNumber) {
    var tasks = buildCheckoutUploadTasks();
    if (!tasks.length) {
      finalizeCheckoutDraft(orderId, orderNumber);
      return;
    }
    var errs = [];
    uploadCheckoutFilesSequential(orderId, tasks, 0, errs, function (fileErrors) {
      if (fileErrors && fileErrors.length) {
        out.checkoutLoading = false;
        out.finalizeLoading = false;
        out.checkoutFileProgress = null;
        out.checkoutMsg = 'Черновик ' + (orderNumber || '') + ' сохранён, но не все файлы загрузились: ' + fileErrors.join('; ') + '. Исправьте и повторите отправку.';
        _miniappScrollTop();
        render();
        return;
      }
      finalizeCheckoutDraft(orderId, orderNumber);
    });
  }
  function doCheckout(formNode) {
    if (!out.token) { out.checkoutMsg = 'Нет сессии'; _miniappScrollTop(); render(); return; }
    if (out.cart.length === 0) { out.checkoutMsg = 'Корзина пуста'; _miniappScrollTop(); render(); return; }
    var f = formNode;
    if (!f || !f.querySelector || String(f.tagName || '').toLowerCase() !== 'form') {
      out.checkoutMsg = 'Ошибка формы. Обновите страницу и попробуйте снова.';
      _miniappScrollTop();
      render();
      return;
    }
    var fd = new FormData(f);
    var isLeg = String(fd.get('cust-type') || '') === 'legal';
    var phone = String(fd.get('phone') || '').trim();
    if (!phone && out.me && out.me.crm && out.me.crm.phone) phone = String(out.me.crm.phone).trim();
    var customer;
    if (isLeg) {
      customer = { type: 'legal', company_name: String(fd.get('co') || '').trim(), phone: phone, email: String(fd.get('email') || '').trim() || undefined, notes: String(fd.get('notes') || '').trim() || undefined };
      if (!customer.company_name) { out.checkoutMsg = 'Укажите компанию'; _miniappScrollTop(); render(); return; }
    } else {
      customer = { type: 'individual', phone: phone, notes: String(fd.get('notes') || '').trim() || undefined };
    }
    if (!phone) { out.checkoutMsg = 'Укажите телефон'; _miniappScrollTop(); render(); return; }
    out.checkoutDesignHelp = String(fd.get('design_help') || '') === '1';
    if (out.draftOrderId && Array.isArray(out.draftItemIds) && out.draftItemIds.length !== out.cart.length) {
      if (typeof clearDraftCheckoutState === 'function') clearDraftCheckoutState();
    }
    if (!out.checkoutDesignHelp) {
      out.checkoutFileByK = out.checkoutFileByK || {};
      for (var vi = 0; vi < out.cart.length; vi++) {
        if (!out.checkoutFileByK[out.cart[vi].k]) {
          out.checkoutMsg = 'Добавьте макет на этапе расчёта в калькуляторе (до «В корзину») или отметьте «Нет макета — требуется помощь с его разработкой».';
          _miniappScrollTop();
          render();
          return;
        }
      }
    }
    var subBtn = f.querySelector('button[type=submit]');
    if (subBtn) subBtn.disabled = true;
    out.checkoutLoading = true;
    out.finalizeLoading = false;
    out.checkoutFileProgress = null;
    out.checkoutMsg = null;
    render();
    if (out.draftOrderId) {
      continueCheckoutWithDraft(out.draftOrderId, out.draftOrderNumber || '');
      return;
    }
    var orderNotes = String(fd.get('notes') || '').trim();
    var body = {
      customer: customer,
      order: {
        items: cartToItems(),
        order_notes: orderNotes,
        design_help_requested: !!out.checkoutDesignHelp
      }
    };
    miniappRequestJson('/api/miniapp/orders/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (x) {
        if (!x.ok) {
          out.checkoutLoading = false;
          out.checkoutMsg = (x.j && (x.j.error || x.j.message)) ? String(x.j.error || x.j.message) : 'Оформление не удалось';
          _miniappScrollTop();
          render();
          return;
        }
        var ord = x.j && x.j.order;
        var oid = ord && ord.id != null ? ord.id : null;
        var num = (ord && ord.number) ? String(ord.number) : '';
        if (!oid) {
          out.checkoutLoading = false;
          out.checkoutMsg = 'Не удалось создать черновик';
          _miniappScrollTop();
          render();
          return;
        }
        out.draftOrderId = oid;
        out.draftItemIds = (x.j && Array.isArray(x.j.itemIds)) ? x.j.itemIds : [];
        out.draftOrderNumber = num;
        out.draftUploadedItemIds = [];
        continueCheckoutWithDraft(oid, num);
      })
      .catch(function (err) {
        out.checkoutLoading = false;
        out.checkoutFileProgress = null;
        out.checkoutMsg = (err && err.message) || String(err);
        _miniappScrollTop();
        render();
      });
  }
`,d=`
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
`,s=`
<div class="ipc-price-diff-accordion__section">
  <h3 class="ipc-price-diff-accordion__h3">Срочно</h3>
  <p class="ipc-price-diff-accordion__lead"><strong>В услуги «Срочно» включено:</strong></p>
  <ul class="ipc-price-diff-accordion__list">
    <li>Срок изготовления: 1-3 часа в порядке очереди*</li>
    <li>Звонок специалиста-консультанта, проверка макета</li>
    <li>Все материалы и размеры</li>
    <li>Тиражные скидки и по промокодам</li>
  </ul>
  <div class="ipc-price-diff-accordion__note">*Срок изготовления на сумму более 200 рублей зависит от параметров заказа. Заказы выполняются в рабочее время.</div>
  <p class="ipc-price-diff-accordion__footer">Все услуги единого профессионального качества.</p>
  <p class="ipc-price-diff-accordion__footer">При заказе в Центре обслуживания у специалиста услуги принимаются по цене «Срочно».</p>
</div>
<div class="ipc-price-diff-accordion__sep" role="separator"></div>
<div class="ipc-price-diff-accordion__section">
  <h3 class="ipc-price-diff-accordion__h3">Промо</h3>
  <p class="ipc-price-diff-accordion__lead"><strong>В услуги «Промо» включено:</strong></p>
  <ul class="ipc-price-diff-accordion__list">
    <li>Срок изготовления: 48 часов*</li>
    <li>Автоматическая печать готовых файлов без консультации специалиста. Только смс (или е-мейл) уведомление</li>
    <li>Только популярные материалы и размеры</li>
    <li>Скидки по промокодам не распространяются</li>
    <li>Акционные цены и тиражные скидки</li>
  </ul>
  <p class="ipc-price-diff-accordion__promo-link-wrap"><span class="ipc-price-diff-accordion__promo-link">Включить параметры акции</span></p>
  <div class="ipc-price-diff-accordion__note">*Срок изготовления на сумму более 200 рублей зависит от параметров заказа.</div>
  <p class="ipc-price-diff-accordion__footer">Все услуги единого профессионального качества.</p>
  <p class="ipc-price-diff-accordion__footer">Справочный центр: +375 33 336 5678.</p>
  <p class="ipc-price-diff-accordion__footer">При заказе в Центре обслуживания у специалиста услуги принимаются по цене «Срочно».</p>
</div>
`.trim(),m=`
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
    miniappRequestJson('/api/products/' + out.calcPid + '/schema?compact=1', {
      headers: { Accept: 'application/json' },
      auth: false,
      retry401: false
    })
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
    miniappRequestJson('/api/products/' + out.calcPid + '/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    })
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
    if (typeof clearDraftCheckoutState === 'function') clearDraftCheckoutState();
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
`;function f(){const e=window.__MINIAPP_CONFIG__||{},h=JSON.stringify(String(e.apiBase||"").replace(/\/+$/,"")),g=e.catalogCategoryId!=null&&Number.isFinite(Number(e.catalogCategoryId))&&Number(e.catalogCategoryId)>=1?String(Math.floor(Number(e.catalogCategoryId))):"null",v=JSON.stringify(e.priceTypeHelpHtml||s);return`(function () {
  var API_BASE = `+h+`;
  var CATALOG_CATEGORY_ID = `+g+`;
  var MINIAPP_PRICE_TYPE_HELP_INNER = `+v+`;
`+o+t+m+d+l+c+u+p}new Function(f())()})();
