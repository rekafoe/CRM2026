/**
 * Mini App: детали заказа, список файлов, загрузка вложения (multipart, поле file).
 */
export const MINIAPP_CLIENT_PART_ORDER_DETAIL = `
  function downloadOrderFile(fileId, suggestedName) {
    if (!out.token || !out.orderDetailId) return;
    out.orderFileMsg = null;
    fetch(API_BASE + '/api/miniapp/orders/' + out.orderDetailId + '/files/' + fileId, { headers: { Authorization: 'Bearer ' + out.token } })
      .then(function (r) {
        if (r.ok) return r.blob();
        return r.json().then(function (j) { throw new Error((j && (j.error || j.message)) ? String(j.error || j.message) : ('HTTP ' + r.status)); });
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
    fetch(API_BASE + '/api/miniapp/orders/' + out.orderDetailId, { headers: { Authorization: 'Bearer ' + out.token, Accept: 'application/json' } })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
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
    box.appendChild(h('h2', 'Заказ'));
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
    var line1 = esc(ord.number || '—') + (ord.status_name ? ' — ' + esc(ord.status_name) : ' (статус ' + ord.status + ')');
    box.appendChild(h('p', line1, 'line'));
    if (ord.created_at) box.appendChild(h('p', esc(ord.created_at), 'muted'));
    if (ord.notes) box.appendChild(h('p', 'Комментарий: ' + esc(ord.notes), 'line'));
    box.appendChild(h('h3', 'Позиции'));
    var items = d.items && d.items.length ? d.items : [];
    if (items.length === 0) {
      box.appendChild(rowHint('Нет позиций.'));
    } else {
      for (var i = 0; i < items.length; i++) {
        (function (it) {
          var t = '#' + it.id + ' ' + esc(it.type) + ' × ' + it.quantity + ' — ' + it.price + ' Br';
          box.appendChild(h('p', t, 'line'));
        })(items[i]);
      }
    }
    box.appendChild(h('h3', 'Файлы'));
    var files = d.files && d.files.length ? d.files : [];
    if (files.length === 0) {
      box.appendChild(rowHint('Пока нет вложений.'));
    } else {
      for (var f = 0; f < files.length; f++) {
        (function (fl) {
          var fn = fl.originalName || fl.filename || 'файл';
          var sub = (fl.orderItemId != null ? 'к позиции #' + fl.orderItemId : 'к заказу') + ' · ' + fmtFileSize(fl.size);
          var rowF = h('div', '', 'row');
          var p1 = h('p', esc(fn) + ' — ' + sub, 'line');
          p1.style.cssText = 'margin:0;flex:1;min-width:0;';
          rowF.appendChild(p1);
          var db = h('button', 'Скачать', 'small');
          db.type = 'button';
          db.onclick = function () { downloadOrderFile(fl.id, fn); };
          rowF.appendChild(db);
          box.appendChild(rowF);
        })(files[f]);
      }
    }
    if (out.orderFileMsg) box.appendChild(h('p', esc(out.orderFileMsg), out.orderFileMsg.indexOf('прикреп') >= 0 || out.orderFileMsg.indexOf('успе') >= 0 ? 'okmsg' : 'hint'));
    var form = document.createElement('form');
    form.className = 'form';
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
      fetch(API_BASE + '/api/miniapp/orders/' + out.orderDetailId + '/files', { method: 'POST', headers: { Authorization: 'Bearer ' + out.token }, body: fd })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
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
    box.appendChild(form);
    return box;
  }
`;
