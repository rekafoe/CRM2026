/**
 * Mini App: логика POST checkout и поочерёдная загрузка макетов.
 */
export const MINIAPP_CLIENT_PART2_CHECKOUT = `
  function uploadCheckoutFilesSequential(orderId, tasks, index, errors, done) {
    if (!tasks || index >= tasks.length) { done(errors); return; }
    out.checkoutFileProgress = 'Прикрепляем файлы: ' + (index + 1) + ' / ' + tasks.length;
    render();
    var t = tasks[index];
    var fd = new FormData();
    fd.append('file', t.file);
    if (t.orderItemId != null && t.orderItemId !== '') fd.append('orderItemId', String(t.orderItemId));
    fetch(API_BASE + '/api/miniapp/orders/' + orderId + '/files', { method: 'POST', headers: { Authorization: 'Bearer ' + out.token }, body: fd })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) errors.push((x.j && (x.j.message || x.j.error)) ? String(x.j.message || x.j.error) : ('Файл ' + (index + 1)));
        uploadCheckoutFilesSequential(orderId, tasks, index + 1, errors, done);
      })
      .catch(function (err) {
        errors.push((err && err.message) ? String(err.message) : ('Файл ' + (index + 1)));
        uploadCheckoutFilesSequential(orderId, tasks, index + 1, errors, done);
      });
  }
  function finishCheckoutSuccess(orderNumber, fileErrors) {
    out.checkoutLoading = false;
    out.checkoutFileProgress = null;
    out.checkoutFileByK = null;
    out.checkoutDesignHelp = false;
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
    out.checkoutDesignHelp = String(fd.get('design_help') || '') === '1';
    if (!out.checkoutDesignHelp) {
      out.checkoutFileByK = out.checkoutFileByK || {};
      for (var vi = 0; vi < out.cart.length; vi++) {
        if (!out.checkoutFileByK[out.cart[vi].k]) {
          out.checkoutMsg = 'Прикрепите макет к каждой позиции в корзине или отметьте «Нет макета — требуется помощь с его разработкой».';
          render();
          return;
        }
      }
    }
    var subBtn = f.querySelector('button[type=submit]');
    if (subBtn) subBtn.disabled = true;
    out.checkoutLoading = true;
    out.checkoutFileProgress = null;
    out.checkoutMsg = null;
    var orderNotes = String(fd.get('notes') || '').trim();
    var body = { customer: customer, order: { items: cartToItems(), order_notes: orderNotes, design_help_requested: !!out.checkoutDesignHelp } };
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
          out.checkoutFileByK = null;
          out.checkoutDesignHelp = false;
          out.orders = null;
          out.view = 'orders';
          loadOrders();
          return;
        }
        var itemIds = (x.j && Array.isArray(x.j.itemIds)) ? x.j.itemIds : [];
        var byK = out.checkoutFileByK || {};
        var tasks = [];
        for (var ti = 0; ti < out.cart.length; ti++) {
          var ck = out.cart[ti].k;
          var fid = itemIds[ti];
          var one = byK[ck];
          if (one && fid != null && fid !== '') tasks.push({ file: one, orderItemId: fid });
        }
        if (!tasks.length) {
          finishCheckoutSuccess(num, []);
          return;
        }
        var errs = [];
        uploadCheckoutFilesSequential(oid, tasks, 0, errs, function (fileErrors) {
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
`;
