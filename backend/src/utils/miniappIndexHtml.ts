/**
 * Одностраничный Mini App: сессия, каталог (как на сайте), корзина, заказы, оформление.
 */
import { getMiniappClientInlineScript } from './miniapp/miniappClientScript';

export function renderMiniappIndexHtml(
  apiBase: string,
  options?: { catalogCategoryId?: number | null }
): string {
  const base = apiBase.replace(/\/+$/, '');
  const script = getMiniappClientInlineScript(base, options?.catalogCategoryId);
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>PrintCore — Mini App</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 0; padding: 12px 12px 88px;
      background: var(--tg-theme-bg-color, #fff); color: var(--tg-theme-text-color, #111);
      min-height: 100vh; }
    h1 { font-size: 1.15rem; margin: 0 0 4px; }
    .sub { font-size: 13px; opacity: .8; margin-bottom: 12px; }
    #miniapp-main { min-height: 40vh; }
    #miniapp-nav { position: fixed; left: 0; right: 0; bottom: 0; display: flex; gap: 4px; padding: 8px; padding-bottom: max(8px, env(safe-area-inset-bottom));
      background: var(--tg-theme-secondary-bg-color, rgba(0,0,0,.08)); border-top: 1px solid rgba(0,0,0,.08); }
    .tab { flex: 1; padding: 10px 6px; font-size: 12px; border: none; border-radius: 8px; cursor: pointer;
      background: var(--tg-theme-button-color, #2481cc); color: var(--tg-theme-button-text-color, #fff); }
    .tab-on { filter: brightness(0.9); font-weight: 600; }
    .section h2 { font-size: 1rem; margin: 0 0 8px; }
    .hint { color: #666; font-size: 14px; }
    .line { font-size: 15px; margin: 4px 0; }
    .card { background: var(--tg-theme-secondary-bg-color, rgba(0,0,0,.05)); border-radius: 10px; padding: 12px; margin-bottom: 10px; }
    .card-title { font-weight: 600; margin-bottom: 4px; }
    .card-price, .muted { font-size: 14px; opacity: .85; }
    .row { margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap; }
    .primary { padding: 10px 16px; border: none; border-radius: 8px; background: var(--tg-theme-button-color, #2481cc);
      color: var(--tg-theme-button-text-color, #fff); font-size: 14px; cursor: pointer; }
    .small { padding: 6px 10px; font-size: 13px; }
    .danger { background: #c33; }
    .total { font-weight: 600; margin: 8px 0; }
    .okmsg { color: #0a0; }
    .form .field { margin-bottom: 10px; }
    .form label { display: block; font-size: 13px; }
    .form input, .form textarea, .form select { width: 100%; margin-top: 4px; padding: 8px; border-radius: 6px; border: 1px solid rgba(0,0,0,.15); font: inherit; }
  </style>
</head>
<body>
  <h1>PrintCore</h1>
  <p class="sub">Каталог, корзина и заказы. Войдите из Telegram (web_app).</p>
  <div id="miniapp-main"></div>
  <div id="miniapp-nav" aria-label="Навигация"></div>
  <script>${script}</script>
</body>
</html>`;
}
