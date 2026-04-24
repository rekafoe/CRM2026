import './miniappShellStyles.css';
import './miniappShellStylesMap.css';
import './miniappCalcSummaryStyles.css';
import { MINIAPP_CLIENT_PART_API } from './miniappClientScriptPartApi';
import { MINIAPP_CLIENT_PART1 } from './miniappClientScriptPart1';
import { MINIAPP_CLIENT_PART_CALC_SUMMARY } from './miniappClientScriptPartCalcSummary';
import { MINIAPP_CLIENT_PART_ORDER_DETAIL } from './miniappClientScriptPartOrderDetail';
import { MINIAPP_CLIENT_PART2 } from './miniappClientScriptPart2';
import { MINIAPP_CLIENT_PART2_CHECKOUT } from './miniappClientScriptPart2Checkout';
import { MINIAPP_CLIENT_PART_PRICE_TYPE_HELP } from './miniappClientScriptPartPriceTypeHelp';
import { MINIAPP_PRICE_TYPE_HELP_INNER_HTML } from './priceTypeHelpInnerHtml';
import { MINIAPP_CLIENT_PART_CALC } from '../../../backend/src/utils/miniapp/miniappClientScriptPartCalc';

declare global {
  interface Window {
    __MINIAPP_CONFIG__?: {
      apiBase?: string;
      catalogCategoryId?: number | null;
      priceTypeHelpHtml?: string;
    };
  }
}

function buildMiniappScript(): string {
  const runtime = window.__MINIAPP_CONFIG__ || {};
  const apiBase = JSON.stringify(String(runtime.apiBase || '').replace(/\/+$/, ''));
  const categoryId =
    runtime.catalogCategoryId != null &&
    Number.isFinite(Number(runtime.catalogCategoryId)) &&
    Number(runtime.catalogCategoryId) >= 1
      ? String(Math.floor(Number(runtime.catalogCategoryId)))
      : 'null';
  const priceTypeHelpHtml = JSON.stringify(runtime.priceTypeHelpHtml || MINIAPP_PRICE_TYPE_HELP_INNER_HTML);

  return (
    '(function () {\n  var API_BASE = ' +
    apiBase +
    ';\n  var CATALOG_CATEGORY_ID = ' +
    categoryId +
    ';\n  var MINIAPP_PRICE_TYPE_HELP_INNER = ' +
    priceTypeHelpHtml +
    ';\n' +
    MINIAPP_CLIENT_PART1 +
    MINIAPP_CLIENT_PART_API +
    MINIAPP_CLIENT_PART_CALC +
    MINIAPP_CLIENT_PART_PRICE_TYPE_HELP +
    MINIAPP_CLIENT_PART_CALC_SUMMARY +
    MINIAPP_CLIENT_PART_ORDER_DETAIL +
    MINIAPP_CLIENT_PART2_CHECKOUT +
    MINIAPP_CLIENT_PART2
  );
}

new Function(buildMiniappScript())();
