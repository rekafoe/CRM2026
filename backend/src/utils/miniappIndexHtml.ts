/**
 * Одностраничный Mini App: сессия, каталог, корзина, заказы, оформление.
 * Стили: `miniapp/miniappShellStyles.ts` (как /adminpanel/products).
 */
import { getMiniappClientInlineScript } from './miniapp/miniappClientScript';
import { MINIAPP_SHELL_CALC_SUMMARY_CSS } from './miniapp/miniappCalcSummaryStyles';
import { MINIAPP_SHELL_CSS } from './miniapp/miniappShellStyles';

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
  <style>${MINIAPP_SHELL_CSS}${MINIAPP_SHELL_CALC_SUMMARY_CSS}</style>
</head>
<body>
  <div class="miniapp-wrap">
    <header class="ipc-pm-header">
      <div class="ipc-pm-header__left">
        <div class="ipc-pm-header__icon" aria-hidden="true">🧩</div>
        <div>
          <h1 class="ipc-pm-header__title">PrintCore</h1>
          <p class="ipc-pm-header__sub">Каталог, корзина и заказы. Войдите из Telegram (web_app).</p>
        </div>
      </div>
    </header>
    <div id="miniapp-main"></div>
  </div>
  <div id="miniapp-nav" class="miniapp-nav" aria-label="Навигация"></div>
  <script>${script}</script>
</body>
</html>`;
}
