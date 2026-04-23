/**
 * Продолжение inline-скрипта Mini App (часть 2 / 2) — оформление, boot, конец IIFE.
 */
export const MINIAPP_CLIENT_PART2 = `
  function renderCheckout() {
    var box = h('div', '', 'section');
    box.appendChild(h('h2', 'Оформление'));
    if (out.checkoutMsg) box.appendChild(h('p', esc(out.checkoutMsg), 'okmsg'));
    var form = document.createElement('form');
    form.className = 'form';
    form.onsubmit = function (e) { e.preventDefault(); doCheckout(e); return false; };
    var isLeg = out.checkoutType === 'legal';
    var sel = document.createElement('select');
    sel.name = 'cust-type';
    sel.innerHTML = '<option value="individual">Физ. лицо</option><option value="legal">Юр. лицо</option>';
    sel.value = isLeg ? 'legal' : 'individual';
    sel.onchange = function () { out.checkoutType = sel.value; render(); };
    addField(form, 'Тип', sel);
    if (!isLeg) {
      var i1 = document.createElement('input');
      i1.name = 'fn';
      i1.type = 'text';
      i1.required = true;
      i1.setAttribute('autocomplete', 'given-name');
      addField(form, 'Имя', i1);
      var i2 = document.createElement('input');
      i2.name = 'ln';
      i2.type = 'text';
      i2.required = true;
      i2.setAttribute('autocomplete', 'family-name');
      addField(form, 'Фамилия', i2);
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
    ph.required = true;
    ph.setAttribute('autocomplete', 'tel');
    addField(form, 'Телефон', ph);
    var em = document.createElement('input');
    em.name = 'email';
    em.type = 'email';
    em.setAttribute('autocomplete', 'email');
    addField(form, 'Email (необяз.)', em);
    var no = document.createElement('textarea');
    no.name = 'notes';
    no.rows = 2;
    addField(form, 'Комментарий', no);
    var sub = h('button', out.checkoutLoading ? 'Отправка…' : 'Отправить заказ', 'primary');
    sub.type = 'submit';
    if (out.checkoutLoading) sub.disabled = true;
    form.appendChild(sub);
    box.appendChild(form);
    return box;
  }
  function doCheckout(e) {
    if (!out.token) { out.checkoutMsg = 'Нет сессии'; render(); return; }
    if (out.cart.length === 0) { out.checkoutMsg = 'Корзина пуста'; render(); return; }
    var f = e.currentTarget;
    if (!f) return;
    var fd = new FormData(f);
    var isLeg = String(fd.get('cust-type') || '') === 'legal';
    var phone = String(fd.get('phone') || '').trim();
    var customer;
    if (isLeg) {
      customer = { type: 'legal', company_name: String(fd.get('co') || '').trim(), phone: phone, email: String(fd.get('email') || '').trim() || undefined, notes: String(fd.get('notes') || '').trim() || undefined };
      if (!customer.company_name) { out.checkoutMsg = 'Укажите компанию'; render(); return; }
    } else {
      customer = { type: 'individual', first_name: String(fd.get('fn') || '').trim(), last_name: String(fd.get('ln') || '').trim(), phone: phone, email: String(fd.get('email') || '').trim() || undefined, notes: String(fd.get('notes') || '').trim() || undefined };
      if (!customer.first_name && !customer.last_name) { out.checkoutMsg = 'Укажите имя/фамилию'; render(); return; }
    }
    if (!phone) { out.checkoutMsg = 'Укажите телефон'; render(); return; }
    var subBtn = f.querySelector('button[type=submit]');
    if (subBtn) subBtn.disabled = true;
    out.checkoutLoading = true;
    var orderNotes = String(fd.get('notes') || '').trim();
    var body = { customer: customer, order: { items: cartToItems(), order_notes: orderNotes } };
    fetch(API_BASE + '/api/miniapp/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + out.token, Accept: 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        out.checkoutLoading = false;
        if (!x.ok) { out.checkoutMsg = (x.j && (x.j.error || x.j.message)) ? String(x.j.error || x.j.message) : 'Оформление не удалось'; render(); return; }
        out.cart = [];
        out.orders = null;
        out.checkoutMsg = (x.j && x.j.message) ? String(x.j.message) : 'Заказ создан';
        out.view = 'orders';
        loadOrders();
      })
      .catch(function (err) {
        out.checkoutLoading = false;
        out.checkoutMsg = (err && err.message) || String(err);
        render();
      });
  }
  function loadProducts() {
    out.productErr = null;
    var listPath = '/api/products?forSite=1&withMinPrice=1';
    if (typeof CATALOG_CATEGORY_ID === 'number' && CATALOG_CATEGORY_ID > 0) {
      listPath = '/api/products/category/' + CATALOG_CATEGORY_ID + '?forSite=1&withMinPrice=1';
    }
    fetch(API_BASE + listPath, { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) { out.products = Array.isArray(data) ? data : []; render(); })
      .catch(function (err) { out.productErr = (err && err.message) || String(err); out.products = []; render(); });
  }
  function loadOrders() {
    if (!out.token) return;
    out.ordersErr = null;
    fetch(API_BASE + '/api/miniapp/orders', { headers: { Authorization: 'Bearer ' + out.token, Accept: 'application/json' } })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) { out.ordersErr = (x.j && x.j.error) ? String(x.j.error) : 'Ошибка'; out.orders = { orders: [], meta: { telegram_orders: true } }; }
        else out.orders = x.j;
        render();
      })
      .catch(function (err) { out.ordersErr = (err && err.message) || String(err); out.orders = { orders: [], meta: { telegram_orders: true } }; render(); });
  }
  function render() {
    setNav();
    main.innerHTML = '';
    if (out.view === 'profile') main.appendChild(renderProfile());
    else if (out.view === 'catalog') main.appendChild(renderCatalog());
    else if (out.view === 'cart') main.appendChild(renderCart());
    else if (out.view === 'orders') main.appendChild(renderOrders());
    else if (out.view === 'checkout') main.appendChild(renderCheckout());
    else if (out.view === 'calculator') main.appendChild(renderCalculator());
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
    fetch(API_BASE + '/api/miniapp/auth', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ initData: initData }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        out.load = false;
        if (!x.ok) {
          out.err = (x.j && (x.j.error || x.j.message)) ? JSON.stringify(x.j) : 'auth failed';
          render();
          return null;
        }
        if (!x.j || !x.j.token) { out.err = 'Нет токена'; render(); return null; }
        out.token = x.j.token;
        return fetch(API_BASE + '/api/miniapp/me', { headers: { Authorization: 'Bearer ' + out.token, Accept: 'application/json' } });
      })
      .then(function (r) {
        if (r == null) return null;
        if (!r.ok) {
          return r.json().then(function (j) { out.me = null; out.err = (j && (j.error || j.message)) ? String(j.error || j.message) : ('HTTP ' + r.status); });
        }
        return r.json();
      })
      .then(function (me) {
        if (me) {
          if (me.telegram) out.me = { telegram: me.telegram };
          else if (me.me && me.me.telegram) out.me = { telegram: me.me.telegram };
          out.err = null;
        }
        render();
      })
      .catch(function (err) { out.load = false; out.err = (err && err.message) || String(err); render(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();`;
