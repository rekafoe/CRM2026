/**
 * Одностраничный каркас Mini App: проверка initData → /api/miniapp/auth → /api/miniapp/me
 */
export function renderMiniappIndexHtml(apiBase: string): string {
  const base = apiBase.replace(/\/+$/, '');
  const safe = JSON.stringify(base);
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>PrintCore — Mini App</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    body { font-family: system-ui, sans-serif; margin: 16px; background: var(--tg-theme-bg-color, #fff); color: var(--tg-theme-text-color, #111); }
    pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; background: rgba(0,0,0,.06); padding: 12px; border-radius: 8px; }
    h1 { font-size: 1.1rem; margin: 0 0 12px; }
    .muted { opacity: .75; font-size: 13px; }
  </style>
</head>
<body>
  <h1>PrintCore</h1>
  <p class="muted">Тест сессии: initData → авторизация → профиль</p>
  <pre id="out">Загрузка…</pre>
  <script>
(function () {
  var API_BASE = ${safe};
  var out = document.getElementById('out');
  function set(t) { out.textContent = t; }
  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready();
    try { tg.expand(); } catch (e) {}
  }
  var initData = (tg && tg.initData) ? tg.initData : '';
  if (!initData) {
    set('Откройте эту страницу из Telegram (кнопка с типом web_app). В браузере initData нет.');
    return;
  }
  fetch(API_BASE + '/api/miniapp/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ initData: initData })
  })
    .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
    .then(function (x) {
      if (!x.ok) {
        set(JSON.stringify(x.j, null, 2));
        return;
      }
      var token = x.j && x.j.token;
      if (!token) {
        set(JSON.stringify(x.j, null, 2));
        return;
      }
      return fetch(API_BASE + '/api/miniapp/me', {
        headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' }
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, me: j }; }); })
        .then(function (m) {
          set(JSON.stringify({ auth: x.j, me: m }, null, 2));
        });
    })
    .catch(function (e) {
      set('Ошибка: ' + (e && e.message ? e.message : String(e)));
    });
})();
  </script>
</body>
</html>`;
}
