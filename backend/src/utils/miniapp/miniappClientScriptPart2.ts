/**
 * Продолжение inline-скрипта Mini App (часть 2 / 2) — оформление, boot, конец IIFE.
 */
export const MINIAPP_CLIENT_PART2 = `
  function renderCheckout() {
    var box = h('div', '', 'section');
    box.appendChild(h('div', 'Оформление', 'section-head'));
    if (out.checkoutMsg) box.appendChild(h('p', esc(out.checkoutMsg), 'okmsg'));
    if (out.checkoutFileProgress) box.appendChild(h('p', esc(out.checkoutFileProgress), 'hint'));
    var form = document.createElement('form');
    form.className = 'form ipc-card';
    form.onsubmit = function (e) { e.preventDefault(); doCheckout(e); return false; };
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
    var fileInp = document.createElement('input');
    fileInp.type = 'file';
    fileInp.name = 'orderFiles';
    fileInp.multiple = true;
    fileInp.setAttribute('accept', 'application/pdf,image/*,.doc,.docx,.xls,.xlsx');
    fileInp.onchange = function () {
      out.checkoutStagedFiles = (this.files && this.files.length) ? Array.prototype.slice.call(this.files) : [];
    };
    addField(form, 'Макеты к заказу (необяз.)', fileInp);
    form.appendChild(h('p', 'До 20 файлов, до 25 МБ каждый. Загрузка сразу после создания заказа.', 'hint'));
    var sub = h('button', out.checkoutLoading ? (out.checkoutFileProgress || 'Отправка…') : 'Отправить заказ', 'primary');
    sub.type = 'submit';
    if (out.checkoutLoading) sub.disabled = true;
    form.appendChild(sub);
    box.appendChild(form);
    return box;
  }
  function uploadCheckoutFilesSequential(orderId, files, index, errors, done) {
    if (!files || index >= files.length) { done(errors); return; }
    out.checkoutFileProgress = 'Прикрепляем файлы: ' + (index + 1) + ' / ' + files.length;
    render();
    var fd = new FormData();
    fd.append('file', files[index]);
    fetch(API_BASE + '/api/miniapp/orders/' + orderId + '/files', { method: 'POST', headers: { Authorization: 'Bearer ' + out.token }, body: fd })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) errors.push((x.j && (x.j.message || x.j.error)) ? String(x.j.message || x.j.error) : ('Файл ' + (index + 1)));
        uploadCheckoutFilesSequential(orderId, files, index + 1, errors, done);
      })
      .catch(function (err) {
        errors.push((err && err.message) ? String(err.message) : ('Файл ' + (index + 1)));
        uploadCheckoutFilesSequential(orderId, files, index + 1, errors, done);
      });
  }
  function finishCheckoutSuccess(orderNumber, fileErrors) {
    out.checkoutLoading = false;
    out.checkoutFileProgress = null;
    out.checkoutStagedFiles = null;
    out.cart = [];
    out.orders = null;
    if (fileErrors && fileErrors.length) {
      out.postCheckoutNotice = 'Заказ ' + (orderNumber || '') + ' создан. Не все файлы загрузились: ' + fileErrors.join('; ') + '. Прикрепите их в карточке заказа.';
    } else {
      out.postCheckoutNotice = null;
    }
    out.checkoutMsg = null;
    out.view = 'orders';
    loadOrders();
  }
  function doCheckout(e) {
    if (!out.token) { out.checkoutMsg = 'Нет сессии'; render(); return; }
    if (out.cart.length === 0) { out.checkoutMsg = 'Корзина пуста'; render(); return; }
    var f = e.currentTarget;
    if (!f) return;
    var fd = new FormData(f);
    var isLeg = String(fd.get('cust-type') || '') === 'legal';
    var phone = String(fd.get('phone') || '').trim();
    if (!phone && out.me && out.me.crm && out.me.crm.phone) phone = String(out.me.crm.phone).trim();
    var customer;
    if (isLeg) {
      customer = { type: 'legal', company_name: String(fd.get('co') || '').trim(), phone: phone, email: String(fd.get('email') || '').trim() || undefined, notes: String(fd.get('notes') || '').trim() || undefined };
      if (!customer.company_name) { out.checkoutMsg = 'Укажите компанию'; render(); return; }
    } else {
      customer = { type: 'individual', phone: phone, notes: String(fd.get('notes') || '').trim() || undefined };
    }
    if (!phone) { out.checkoutMsg = 'Укажите телефон'; render(); return; }
    var staged = out.checkoutStagedFiles;
    var files = (staged && staged.length) ? staged : [];
    var subBtn = f.querySelector('button[type=submit]');
    if (subBtn) subBtn.disabled = true;
    out.checkoutLoading = true;
    out.checkoutFileProgress = null;
    out.checkoutMsg = null;
    var orderNotes = String(fd.get('notes') || '').trim();
    var body = { customer: customer, order: { items: cartToItems(), order_notes: orderNotes } };
    fetch(API_BASE + '/api/miniapp/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + out.token, Accept: 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) {
          out.checkoutLoading = false;
          out.checkoutMsg = (x.j && (x.j.error || x.j.message)) ? String(x.j.error || x.j.message) : 'Оформление не удалось';
          render();
          return;
        }
        var ord = x.j && x.j.order;
        var oid = ord && ord.id != null ? ord.id : null;
        var num = (ord && ord.number) ? String(ord.number) : '';
        if (!oid) {
          out.checkoutLoading = false;
          out.checkoutMsg = (x.j && x.j.message) ? String(x.j.message) : 'Заказ создан';
          out.cart = [];
          out.orders = null;
          out.view = 'orders';
          loadOrders();
          return;
        }
        if (!files.length) {
          finishCheckoutSuccess(num, []);
          return;
        }
        var errs = [];
        uploadCheckoutFilesSequential(oid, files, 0, errs, function (fileErrors) {
          finishCheckoutSuccess(num, fileErrors);
        });
      })
      .catch(function (err) {
        out.checkoutLoading = false;
        out.checkoutFileProgress = null;
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
    else if (out.view === 'order_detail') main.appendChild(renderOrderDetail());
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
          if (me.telegram) out.me = { telegram: me.telegram, crm: me.crm != null ? me.crm : null };
          else if (me.me && me.me.telegram) out.me = { telegram: me.me.telegram, crm: me.crm != null ? me.crm : null };
          out.err = null;
        }
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
})();`;
