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
    :root {
      --ipc-radius: 14px;
      --ipc-border: rgba(0,0,0,.1);
      --ipc-shadow: 0 4px 20px rgba(0,0,0,.08);
    }
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; margin: 0; padding: 12px 12px 88px;
      background: var(--tg-theme-bg-color, #f4f6f9); color: var(--tg-theme-text-color, #1a1d24);
      min-height: 100vh; }
    h1 { font-size: 1.2rem; font-weight: 700; margin: 0 0 4px; letter-spacing: -0.02em; }
    .sub { font-size: 13px; opacity: .82; margin-bottom: 14px; }
    #miniapp-main { min-height: 40vh; }
    #miniapp-nav { position: fixed; left: 0; right: 0; bottom: 0; display: flex; gap: 4px; padding: 8px; padding-bottom: max(8px, env(safe-area-inset-bottom));
      background: var(--tg-theme-secondary-bg-color, rgba(255,255,255,.92)); border-top: 1px solid var(--ipc-border);
      backdrop-filter: blur(8px); }
    .tab { flex: 1; padding: 10px 6px; font-size: 12px; border: none; border-radius: 10px; cursor: pointer;
      background: var(--tg-theme-button-color, #2563eb); color: var(--tg-theme-button-text-color, #fff); }
    .tab-on { filter: brightness(0.95); font-weight: 600; box-shadow: inset 0 0 0 1px rgba(255,255,255,.2); }
    .section { margin-bottom: 4px; }
    .section-head { font-size: 1.05rem; font-weight: 700; margin: 0 0 12px; color: var(--tg-theme-text-color, #111); letter-spacing: -0.02em; }
    .hint { color: #64748b; font-size: 13px; line-height: 1.4; }
    .line { font-size: 15px; margin: 4px 0; }
    .card { background: var(--tg-theme-secondary-bg-color, rgba(255,255,255,.9)); border-radius: var(--ipc-radius);
      padding: 12px; margin-bottom: 10px; border: 1px solid var(--ipc-border);
      box-shadow: var(--ipc-shadow); }
    .ipc-card { background: var(--tg-theme-secondary-bg-color, #fff); border: 1px solid var(--ipc-border);
      border-radius: var(--ipc-radius); box-shadow: var(--ipc-shadow); }
    .card-title { font-weight: 600; margin-bottom: 6px; line-height: 1.35; }
    .card-price, .muted { font-size: 14px; opacity: .88; }
    .catalog-grid { display: flex; flex-direction: column; gap: 10px; }
    .ipc-total { font-weight: 700; font-size: 1.05rem; padding: 12px 0 4px; }
    .ipc-result { margin-top: 12px; padding: 12px; }
    .row { margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap; }
    .primary { padding: 10px 16px; border: none; border-radius: 10px; background: var(--tg-theme-button-color, #2563eb);
      color: var(--tg-theme-button-text-color, #fff); font-size: 14px; font-weight: 600; cursor: pointer; }
    .small { padding: 6px 10px; font-size: 13px; border-radius: 8px; }
    .danger { background: #c33; }
    .total { font-weight: 600; margin: 8px 0; }
    .okmsg { color: #15803d; font-size: 14px; }
    .form .field { margin-bottom: 10px; }
    .form label { display: block; font-size: 13px; font-weight: 500; color: #475569; }
    .form input, .form textarea, .form select { width: 100%; margin-top: 4px; padding: 10px 10px; border-radius: 8px; border: 1px solid var(--ipc-border);
      font: inherit; background: var(--tg-theme-bg-color, #fff); }
    .form input[type="file"] { border: 1px dashed #94a3b8; padding: 8px; font-size: 13px; }
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
