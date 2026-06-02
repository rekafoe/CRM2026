/**
 * SQL-фрагменты для сумм заказа (storedTotalCost ?? price×qty).
 * Отдельный файл, чтобы не дублировать в raw-запросах.
 */

const SQL_ITEM_LINE_TOTAL_INNER = `
  CASE
    WHEN json_valid(i.params) = 1
      AND json_type(json_extract(i.params, '$.storedTotalCost')) IN ('integer', 'real')
    THEN CAST(json_extract(i.params, '$.storedTotalCost') AS REAL)
    ELSE CAST(i.price AS REAL) * CAST(MAX(1, COALESCE(i.quantity, 1)) AS REAL)
  END
`;

/** Подытог заказа: `orderIdSqlRef` — например `o.id` или `orders.id`. */
export function sqlOrderSubtotalSubquery(orderIdSqlRef: string): string {
  return `(SELECT COALESCE(SUM(${SQL_ITEM_LINE_TOTAL_INNER}), 0) FROM items i WHERE i.orderId = ${orderIdSqlRef})`;
}

/** Итог после скидки; `discountRef` — например `COALESCE(o.discount_percent, 0)`. */
export function sqlOrderTotalAfterDiscount(
  orderIdSqlRef: string,
  discountRef = 'COALESCE(discount_percent, 0)'
): string {
  return `ROUND(${sqlOrderSubtotalSubquery(orderIdSqlRef)} * (1.0 - ${discountRef} / 100.0), 2)`;
}

/** Агрегация подытога по orderId (для JOIN в списках заказов). */
export const SQL_ITEMS_SUBTOTAL_BY_ORDER = `
  SELECT orderId, COALESCE(SUM(
    CASE
      WHEN json_valid(params) = 1
        AND json_type(json_extract(params, '$.storedTotalCost')) IN ('integer', 'real')
      THEN CAST(json_extract(params, '$.storedTotalCost') AS REAL)
      ELSE CAST(price AS REAL) * CAST(MAX(1, COALESCE(quantity, 1)) AS REAL)
    END
  ), 0) as totalAmount
  FROM items
  GROUP BY orderId
`;
