import { MINIAPP_PRICE_TYPE_HELP_INNER_HTML } from './miniapp/miniappPriceTypeHelpInnerHtml';

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function escapeInlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function isSafeOrgLogoUrlForMiniappHeader(url: string): boolean {
  const t = url.trim();
  if (!t || t.length > 1_500_000) return false;
  if (/\0/.test(t) || t.includes('javascript:') || t.includes('data:text/html')) return false;
  if (t.startsWith('data:image/')) return true;
  try {
    const u = new URL(t);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Data URL / http(s) / относительный путь с тем же API origin, что и миниапп */
function resolveOrgLogoUrl(logo: string, apiBase: string): string {
  const t = logo.trim();
  if (t.startsWith('/') && !t.startsWith('//')) {
    return `${apiBase.replace(/\/+$/, '')}${t}`;
  }
  return t;
}

function miniappHeaderLogoBlock(logoUrl: string | null | undefined, apiBase: string): string {
  if (!logoUrl) {
    return '<div class="ipc-pm-header__icon" aria-hidden="true">🧩</div>';
  }
  const full = resolveOrgLogoUrl(logoUrl, apiBase);
  if (isSafeOrgLogoUrlForMiniappHeader(full)) {
    return `<div class="ipc-pm-header__logo-wrap"><img class="ipc-pm-header__logo-img" src="${escapeAttr(full)}" alt="" decoding="async" loading="eager" /></div>`;
  }
  return '<div class="ipc-pm-header__icon" aria-hidden="true">🧩</div>';
}

export function renderMiniappIndexHtml(
  apiBase: string,
  options?: { catalogCategoryId?: number | null; organizationLogoUrl?: string | null }
): string {
  const base = apiBase.replace(/\/+$/, '');
  const logo = miniappHeaderLogoBlock(options?.organizationLogoUrl, base);
  const runtimeConfig = escapeInlineJson({
    apiBase: base,
    catalogCategoryId: options?.catalogCategoryId ?? null,
    priceTypeHelpHtml: MINIAPP_PRICE_TYPE_HELP_INNER_HTML,
  });
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Ваша онлайн-типография</title>
  <link rel="stylesheet" href="/miniapp-assets/miniapp.css" />
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
</head>
<body>
  <div class="miniapp-wrap">
    <header class="ipc-pm-header">
      <div class="ipc-pm-header__left">
        ${logo}
        <div>
          <h1 class="ipc-pm-header__title">Ваша онлайн-типография</h1>
        </div>
      </div>
    </header>
    <div id="miniapp-main"></div>
  </div>
  <div id="miniapp-nav" class="miniapp-nav" aria-label="Навигация"></div>
  <script>window.__MINIAPP_CONFIG__ = ${runtimeConfig};</script>
  <script src="/miniapp-assets/miniapp.js"></script>
</body>
</html>`;
}
