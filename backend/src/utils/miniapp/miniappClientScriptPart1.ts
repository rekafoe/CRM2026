/**
 * Продолжение inline-скрипта Mini App (часть 1 / 2) — с начала IIFE до renderOrders.
 */
export const MINIAPP_CLIENT_PART1 = `
  var out = {
    token: null, me: null, products: null, productErr: null, orders: null, ordersErr: null,
    cart: [], view: 'profile', err: null, load: false, checkoutMsg: null, checkoutType: 'individual',
    checkoutLoading: false,
    calcPid: null, calcName: '', calcListItem: null, calcSchema: null, calcErr: null, calcLoading: false, calcResult: null,
    calcForm: { typeId: null, sizeId: null, matId: null, qty: 100, printKey: '', priceType: '' },
    orderDetailId: null, orderDetailData: null, orderDetailErr: null, orderDetailLoading: false,
    orderFileMsg: null, orderUploadLoading: false,
    postCheckoutNotice: null,
    checkoutFileByK: null,
    calcStagedLayout: null,
    checkoutFileProgress: null
  };
  var nav, main;
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function h(tag, inner, cl) {
    var e = document.createElement(tag);
    if (cl) e.className = cl;
    if (inner != null) e.innerHTML = inner;
    return e;
  }
  function setNav() {
    var tabs = [ ['profile', 'Профиль'], ['catalog', 'Каталог'], ['cart', 'Корзина'], ['orders', 'Заказы'] ];
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
  function addToCart(p) {
    if (isSimplifiedProduct(p)) {
      out.calcPid = p.id;
      out.calcName = p.name || 'Товар';
      out.calcListItem = p;
      out.calcSchema = null;
      out.calcErr = null;
      out.calcResult = null;
      out.calcStagedLayout = null;
      out.calcForm = { typeId: null, sizeId: null, matId: null, qty: 100, printKey: '', priceType: '' };
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
        var title = esc(p.name || 'Товар') + (p.category_name ? ' — ' + esc(p.category_name) : '');
        var price = p.min_price != null && p.min_price !== '' ? 'от ' + esc(p.min_price) + ' Br' : 'цена по запросу';
        row.appendChild(h('div', title, 'card-title'));
        row.appendChild(h('div', price, 'card-price'));
        var btn = h('button', isSimplifiedProduct(p) ? 'Калькулятор' : 'В корзину', 'primary');
        btn.type = 'button';
        btn.onclick = function () { addToCart(p); };
        row.appendChild(btn);
        grid.appendChild(row);
      })(out.products[i]);
    }
    box.appendChild(grid);
    return box;
  }
  function renderCart() {
    var box = h('div', '', 'section');
    box.appendChild(h('div', 'Корзина', 'section-head'));
    if (out.cart.length === 0) {
      box.appendChild(h('p', 'Пока пусто. Добавьте позиции из каталога.', 'hint ipc-empty'));
      return box;
    }
    var panel = h('div', '', 'ipc-panel');
    var listEl = h('div', '', 'ipc-list');
    for (var i = 0; i < out.cart.length; i++) {
      (function (c) {
        var row = h('div', '', 'ipc-list__row ipc-list__row--cart');
        var sub = (c.params && c.params.description) ? esc(c.params.description) : esc(c.name);
        var line = sub + ' × ' + c.qty + ' — ' + (Math.round(c.price * c.qty * 100) / 100) + ' Br';
        row.appendChild(h('div', line, 'ipc-list__row-summary'));
        var tools = h('div', '', 'row');
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
    box.appendChild(h('div', 'Итого: ' + subtotal() + ' Br', 'total ipc-total'));
    var go = h('button', 'Оформить заказ', 'primary');
    go.type = 'button';
    go.onclick = function () { out.view = 'checkout'; out.checkoutMsg = null; out.postCheckoutNotice = null; render(); };
    box.appendChild(go);
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
