/**
 * Продолжение inline-скрипта Mini App (часть 2 / 2) — оформление, boot, конец IIFE.
 */
export const MINIAPP_CLIENT_PART2 = `
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
          ? 'Макеты в корзине не требуются. Сумма заказа — печать; дизайн согласуем отдельно.'
          : 'Файлы макетов, выбранные в калькуляторе, после отправки заказа прикрепляются к позициям (до 25 МБ).',
        'hint'
      )
    );
    var sub = h('button', out.checkoutLoading ? (out.checkoutFileProgress || 'Отправка…') : 'Отправить заказ', 'primary');
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
})();`;
