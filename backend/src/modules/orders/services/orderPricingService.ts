/**
 * Пересчёт цен позиций заказа с учётом тиражной скидки по группам (Σ sheetsNeeded).
 */

import { getDb } from '../../../config/database';
import { logger } from '../../../utils/logger';
import {
  configurationFromItemParams,
  isGroupableLine,
  isSimplifiedProduct,
  quoteLines,
  type PricingLineInput,
  type PricingGroupSummary,
} from '../../pricing/services/pricingGroupService';

export interface OrderPricingGroupView {
  groupKey: string;
  totalSheets: number;
  totalTierVolume: number;
  lineIds: number[];
  tierMinQty: number | null;
}

export class OrderPricingService {
  static extractPricingLineFromItem(item: {
    id: number;
    quantity: number;
    params: string | Record<string, unknown> | null;
  }): PricingLineInput | null {
    let params: Record<string, unknown> = {};
    try {
      params =
        typeof item.params === 'string'
          ? JSON.parse(item.params || '{}')
          : (item.params && typeof item.params === 'object' ? { ...item.params } : {});
    } catch {
      return null;
    }

    const { productId, configuration, sheetsNeeded } = configurationFromItemParams(params);
    if (productId == null) return null;

    const line: PricingLineInput = {
      lineId: item.id,
      productId,
      quantity: Math.max(1, Number(item.quantity) || 1),
      configuration,
      sheetsNeeded,
    };

    return isGroupableLine(line) ? line : null;
  }

  static async getPricingGroupsForOrder(orderId: number): Promise<OrderPricingGroupView[]> {
    const db = await getDb();
    const items = (await db.all(
      'SELECT id, quantity, params FROM items WHERE orderId = ? ORDER BY id ASC',
      orderId
    )) as Array<{ id: number; quantity: number; params: string | null }>;

    const lines: PricingLineInput[] = [];
    for (const item of items) {
      const line = this.extractPricingLineFromItem(item);
      if (line) {
        const simplified = await isSimplifiedProduct(line.productId);
        if (simplified) lines.push(line);
      }
    }

    if (lines.length === 0) return [];

    const quoted = await quoteLines(lines);
    return quoted.groups.map((g: PricingGroupSummary) => ({
      groupKey: g.groupKey,
      totalSheets: g.totalSheets,
      totalTierVolume: g.totalTierVolume,
      lineIds: g.lineIds.map((id) => Number(id)),
      tierMinQty: g.tierMinQty,
    }));
  }

  /**
   * Пересчитать цены всех groupable simplified-позиций заказа.
   * Позиции без productId / без ключа группы не меняются.
   */
  static async recalculateOrderPrices(orderId: number): Promise<{
    updatedCount: number;
    cartTotal: number;
    groups: OrderPricingGroupView[];
  }> {
    const db = await getDb();
    const items = (await db.all(
      'SELECT id, quantity, params, price FROM items WHERE orderId = ? ORDER BY id ASC',
      orderId
    )) as Array<{ id: number; quantity: number; params: string | null; price: number }>;

    const lines: PricingLineInput[] = [];
    const itemById = new Map<number, (typeof items)[0]>();

    for (const item of items) {
      itemById.set(item.id, item);
      const line = this.extractPricingLineFromItem(item);
      if (!line) continue;
      try {
        if (await isSimplifiedProduct(line.productId)) {
          lines.push(line);
        }
      } catch {
        // skip
      }
    }

    if (lines.length === 0) {
      return { updatedCount: 0, cartTotal: 0, groups: [] };
    }

    const quoted = await quoteLines(lines);
    let updatedCount = 0;

    for (const q of quoted.lines) {
      if (q.skipped || q.error || q.finalPrice <= 0) {
        if (q.error) {
          logger.warn('[OrderPricingService] позиция не пересчитана', {
            orderId,
            itemId: q.lineId,
            error: q.error,
          });
        }
        continue;
      }

      const itemId = Number(q.lineId);
      const existing = itemById.get(itemId);
      if (!existing) continue;

      let paramsObj: Record<string, unknown> = {};
      try {
        paramsObj = JSON.parse(existing.params || '{}');
      } catch {
        paramsObj = {};
      }

      paramsObj.pricingMeta = q.pricingMeta;
      paramsObj.sheetsNeeded = q.sheetsNeeded;
      if (paramsObj.specifications && typeof paramsObj.specifications === 'object') {
        (paramsObj.specifications as Record<string, unknown>).sheetsNeeded = q.sheetsNeeded;
      }
      paramsObj.storedTotalCost = q.finalPrice;

      await db.run(
        'UPDATE items SET price = ?, params = ? WHERE id = ? AND orderId = ?',
        [q.pricePerUnit, JSON.stringify(paramsObj), itemId, orderId]
      );
      updatedCount += 1;
    }

    const groups = await this.getPricingGroupsForOrder(orderId);

    logger.info('[OrderPricingService] пересчёт завершён', {
      orderId,
      updatedCount,
      cartTotal: quoted.cartTotal,
      groupsCount: groups.length,
    });

    return {
      updatedCount,
      cartTotal: quoted.cartTotal,
      groups,
    };
  }
}
