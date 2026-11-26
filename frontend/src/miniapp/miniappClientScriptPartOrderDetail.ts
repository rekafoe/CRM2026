export const MINIAPP_CLIENT_PART_ORDER_DETAIL = `
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
  function repeatCurrentOrderFromDetail() {
    var d = out.orderDetailData;
    if (!d || !d.order || !Array.isArray(d.items)) return;
    if (typeof clearDraftCheckoutState === 'function') clearDraftCheckoutState();
    out.cart = d.items.map(function (it) {
      var params = {};
      try { params = it.params ? JSON.parse(JSON.stringify(it.params)) : {}; } catch (e) { params = {}; }
      var productId = Number(params.productId || it.type);
      var productName = params.productName || params.description || it.type || 'Товар';
      return {
        k: 'repeat-' + it.id,
        pid: productId,
        name: productName,
        price: Number(it.price) || 0,
        qty: Math.max(1, Number(it.quantity) || 1),
        type: String(productId || it.type),
        params: params,
        components: Array.isArray(params.components) ? params.components : undefined
      };
    });
    out.checkoutFileByK = null;
    out.checkoutDesignHelp = false;
    out.repeatOrderId = null;
    out.orderDetailId = null;
    out.orderDetailData = null;
    out.orderDetailErr = null;
    out.orderFileMsg = null;
    out.view = 'cart';
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
        if (out.repeatOrderId && out.orderDetailData && out.orderDetailData.order && Number(out.orderDetailData.order.id) === Number(out.repeatOrderId)) {
          repeatCurrentOrderFromDetail();
        }
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
  function createOrderPaymentLink(orderId) {
    if (!out.token || !orderId || out.orderPaymentLoading) return;
    out.orderPaymentLoading = true;
    out.orderFileMsg = null;
    render();
    miniappRequestJson('/api/miniapp/orders/' + orderId + '/payment-link', {
      method: 'POST',
      headers: { Accept: 'application/json' }
    })
      .then(function (x) {
        out.orderPaymentLoading = false;
        if (!x.ok || !x.j || !x.j.paymentUrl) {
          out.orderFileMsg = (x.j && (x.j.error || x.j.message)) ? String(x.j.error || x.j.message) : 'Не удалось сформировать ссылку на оплату';
          render();
          return;
        }
        var paymentUrl = String(x.j.paymentUrl);
        var tg = window.Telegram && window.Telegram.WebApp;
        if (tg && typeof tg.openLink === 'function') tg.openLink(paymentUrl);
        else window.location.href = paymentUrl;
      })
      .catch(function (err) {
        out.orderPaymentLoading = false;
        out.orderFileMsg = (err && err.message) || String(err);
        render();
      });
  }
  function orderIsSettled(order) {
    return ['paid', 'successful', 'bank'].includes(String(order.prepaymentStatus || '').toLowerCase());
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
    var orderActions = h('div', '', 'ipc-order-actions');
    var repeatButton = h('button', 'Повторить заказ', 'small');
    repeatButton.type = 'button';
    repeatButton.onclick = function () {
      out.repeatOrderId = ord.id;
      repeatCurrentOrderFromDetail();
    };
    orderActions.appendChild(repeatButton);
    if (!orderIsSettled(ord)) {
      var payButton = h('button', out.orderPaymentLoading ? 'Формируем ссылку…' : 'Оплатить заказ', 'primary');
      payButton.type = 'button';
      if (out.orderPaymentLoading) payButton.disabled = true;
      payButton.onclick = function () { createOrderPaymentLink(ord.id); };
      orderActions.appendChild(payButton);
    }
    box.appendChild(orderActions);
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
    box.appendChild(h('p', 'После оформления добавлять файлы нельзя. Состав заказа и уже прикреплённые макеты доступны для просмотра и скачивания.', 'hint ipc-order-files-note'));
    return box;
  }
`;
