/**
 * Продолжение inline-скрипта Mini App (часть 1 / 2) — с начала IIFE до renderOrders.
 */
export const MINIAPP_CLIENT_PART1 = `
  var out = {
    token: null, me: null, products: null, productErr: null, orders: null, ordersErr: null,
    cart: [], view: 'profile', err: null, load: false, checkoutMsg: null, checkoutType: 'individual',
    checkoutLoading: false,
    calcPid: null, calcName: '', calcListItem: null, calcSchema: null, calcErr: null, calcLoading: false, calcResult: null,
    calcForm: { typeId: null, sizeId: null, matId: null, qty: 100, printKey: '' }
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
        var b = h('button', esc(label), 'tab' + (out.view === key ? ' tab-on' : ''));
        b.type = 'button';
        b.onclick = function () {
          out.view = key;
          out.checkoutMsg = null;
          if (key === 'catalog' && !out.products) loadProducts();
          if (key === 'orders' && out.orders == null) loadOrders();
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
      out.calcForm = { typeId: null, sizeId: null, matId: null, qty: 100, printKey: '' };
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
    if (idx >= 0) out.cart[idx].qty += 1; else
      out.cart.push({ k: k, pid: id, name: p.name, price: price, qty: 1, type: String(id), params: { productName: p.name, source: 'miniapp' } });
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
    render();
  }
  function cartToItems() {
    var items = [];
    for (var i = 0; i < out.cart.length; i++) {
      var c = out.cart[i];
      items.push({ type: c.type, params: c.params, price: c.price, quantity: c.qty, priceType: 'website' });
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
    box.appendChild(h('h2', 'Профиль'));
    box.appendChild(h('p', 'Имя: ' + esc(t.first_name || '—') + (t.last_name ? ' ' + esc(t.last_name) : ''), 'line'));
    box.appendChild(h('p', 'Username: ' + (t.username ? '@' + esc(t.username) : '—'), 'line'));
    box.appendChild(h('p', 'Статус: ' + esc(t.role || 'клиент'), 'line'));
    return box;
  }
  function renderCatalog() {
    var box = h('div', '', 'section');
    if (out.productErr) box.appendChild(rowHint(out.productErr));
    if (!out.products) { box.appendChild(rowHint('Загрузка каталога…')); return box; }
    if (out.products.length === 0) { box.appendChild(rowHint('Нет товаров для сайта (forSite).')); return box; }
    box.appendChild(h('h2', 'Каталог'));
    for (var i = 0; i < out.products.length; i++) {
      (function (p) {
        var row = h('div', '', 'card');
        var title = esc(p.name || 'Товар') + (p.category_name ? ' — ' + esc(p.category_name) : '');
        var price = p.min_price != null && p.min_price !== '' ? 'от ' + esc(p.min_price) + ' Br' : 'цена по запросу';
        row.appendChild(h('div', title, 'card-title'));
        row.appendChild(h('div', price, 'card-price'));
        var btn = h('button', isSimplifiedProduct(p) ? 'Калькулятор' : 'В корзину', 'primary');
        btn.type = 'button';
        btn.onclick = function () { addToCart(p); };
        row.appendChild(btn);
        box.appendChild(row);
      })(out.products[i]);
    }
    return box;
  }
  function renderCart() {
    var box = h('div', '', 'section');
    box.appendChild(h('h2', 'Корзина'));
    if (out.cart.length === 0) {
      box.appendChild(rowHint('Пока пусто. Добавьте позиции из каталога.'));
      return box;
    }
    for (var i = 0; i < out.cart.length; i++) {
      (function (c) {
        var row = h('div', '', 'card');
        var line = esc(c.name) + ' × ' + c.qty + ' — ' + (Math.round(c.price * c.qty * 100) / 100) + ' Br';
        row.appendChild(h('div', line, 'card-title'));
        var tools = h('div', '', 'row');
        var m = h('button', '−', 'small'); m.type = 'button'; m.onclick = function () { setQty(c.k, -1); };
        var p = h('button', '+', 'small'); p.type = 'button'; p.onclick = function () { setQty(c.k, 1); };
        var r = h('button', 'Убрать', 'small danger'); r.type = 'button'; r.onclick = function () { removeLine(c.k); };
        tools.appendChild(m); tools.appendChild(p); tools.appendChild(r);
        row.appendChild(tools);
        box.appendChild(row);
      })(out.cart[i]);
    }
    box.appendChild(h('p', 'Итого: ' + subtotal() + ' Br', 'total'));
    var go = h('button', 'Оформить заказ', 'primary');
    go.type = 'button';
    go.onclick = function () { out.view = 'checkout'; out.checkoutMsg = null; render(); };
    box.appendChild(go);
    return box;
  }
  function orderMetaUnavail() {
    return out.orders && out.orders.meta && out.orders.meta.telegram_orders === false;
  }
  function renderOrders() {
    var box = h('div', '', 'section');
    box.appendChild(h('h2', 'Мои заказы'));
    if (out.ordersErr) box.appendChild(rowHint(out.ordersErr));
    if (!out.orders) { box.appendChild(rowHint('Загрузка…')); return box; }
    if (orderMetaUnavail()) { box.appendChild(rowHint('Список заказов пока недоступен (нужна миграция telegram_chat_id).')); return box; }
    var list = out.orders.orders || [];
    if (list.length === 0) { box.appendChild(rowHint('Заказов пока нет.')); return box; }
    for (var j = 0; j < list.length; j++) {
      (function (o) {
        var row = h('div', '', 'card');
        var t = esc(o.number) + (o.status_name ? ' — ' + esc(o.status_name) : ' — статус ' + o.status);
        row.appendChild(h('div', t, 'card-title'));
        if (o.created_at) row.appendChild(h('div', esc(o.created_at), 'muted'));
        box.appendChild(row);
      })(list[j]);
    }
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
