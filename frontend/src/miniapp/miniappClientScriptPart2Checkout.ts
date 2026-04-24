export const MINIAPP_CLIENT_PART2_CHECKOUT = `
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
`;
