/**
 * Клиент Mini App (inline, ES5) — каталог, корзина, заказы, оформление.
 */
import { MINIAPP_CLIENT_PART1 } from './miniappClientScriptPart1';
import { MINIAPP_CLIENT_PART_CALC } from './miniappClientScriptPartCalc';
import { MINIAPP_CLIENT_PART_CALC_SUMMARY } from './miniappClientScriptPartCalcSummary';
import { MINIAPP_CLIENT_PART_ORDER_DETAIL } from './miniappClientScriptPartOrderDetail';
import { MINIAPP_CLIENT_PART2 } from './miniappClientScriptPart2';
import { MINIAPP_CLIENT_PART2_CHECKOUT } from './miniappClientScriptPart2Checkout';
import { MINIAPP_CLIENT_PART_PRICE_TYPE_HELP } from './miniappClientScriptPartPriceTypeHelp';
import { MINIAPP_PRICE_TYPE_HELP_INNER_HTML } from './miniappPriceTypeHelpInnerHtml';

/** Опционально: только товары категории (GET /api/products/category/:id), см. MINIAPP_CATALOG_CATEGORY_ID. */
export function getMiniappClientInlineScript(
  apiBase: string,
  catalogCategoryId?: number | null
): string {
  const API = JSON.stringify(apiBase.replace(/\/+$/, ''));
  const cat =
    catalogCategoryId != null &&
    Number.isFinite(Number(catalogCategoryId)) &&
    Number(catalogCategoryId) >= 1
      ? Math.floor(Number(catalogCategoryId))
      : null;
  const catJs = cat == null ? 'null' : String(cat);
  const helpInnerJson = JSON.stringify(MINIAPP_PRICE_TYPE_HELP_INNER_HTML);
  return (
    '(function () {\n  var API_BASE = ' +
    API +
    ';\n  var CATALOG_CATEGORY_ID = ' +
    catJs +
    ';\n  var MINIAPP_PRICE_TYPE_HELP_INNER = ' +
    helpInnerJson +
    ';\n' +
    MINIAPP_CLIENT_PART1 +
    MINIAPP_CLIENT_PART_CALC +
    MINIAPP_CLIENT_PART_PRICE_TYPE_HELP +
    MINIAPP_CLIENT_PART_CALC_SUMMARY +
    MINIAPP_CLIENT_PART_ORDER_DETAIL +
    MINIAPP_CLIENT_PART2_CHECKOUT +
    MINIAPP_CLIENT_PART2
  );
}
