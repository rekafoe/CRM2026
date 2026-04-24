/**
 * Продолжение inline-скрипта Mini App (часть 1 / 2) — с начала IIFE до renderOrders.
 */
import { bynIconInlineSpanHtmlForMiniapp } from '../byCurrencyBYN';

export const MINIAPP_CLIENT_PART1 = `
  var out = {
    token: null, me: null, products: null, productErr: null, orders: null, ordersErr: null,
    cart: [], view: 'catalog', err: null, load: false, checkoutMsg: null, checkoutType: 'individual',
    checkoutLoading: false,
    calcPid: null, calcName: '', calcListItem: null, calcSchema: null, calcErr: null, calcLoading: false, calcResult: null,
    calcForm: { typeId: null, sizeId: null, matId: null, matPaperKey: null, qty: 100, printKey: '', priceType: '' },
    orderDetailId: null, orderDetailData: null, orderDetailErr: null, orderDetailLoading: false,
    orderFileMsg: null, orderUploadLoading: false,
    postCheckoutNotice: null,
    checkoutFileByK: null,
    /** Нет макета — нужна помощь с дизайном (не требовать файлы; сводка как «только печать»). */
    checkoutDesignHelp: false,
    calcStagedLayout: null,
    checkoutFileProgress: null
  };
  var nav, main;
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function bynSpanHtml() {
    return ${JSON.stringify(bynIconInlineSpanHtmlForMiniapp())};
  }
  function h(tag, inner, cl) {
    var e = document.createElement(tag);
    if (cl) e.className = cl;
    if (inner != null) e.innerHTML = inner;
    return e;
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
  /** URL картинки товара для карточки (image_url или icon со ссылкой). */
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
      out.cart[i].qty = Math.max(1, out.cart[i].qty + d);
      render();
      return;
    }
  }
  function removeLine(k) {
    var a = [];
    for (var i = 0; i < out.cart.length; i++) { if (out.cart[i].k !== k) a.push(out.cart[i]); }
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
        var price = p.min_price != null && p.min_price !== '' ? 'от ' + esc(p.min_price) + bynSpanHtml() : 'цена по запросу';
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
`;
