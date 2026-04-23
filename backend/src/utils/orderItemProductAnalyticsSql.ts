/**
 * Аналитика по позициям заказа: «товар» = каталог (productId) / productName в params / первая часть description / type строки.
 * Алиасы: i — items, pr — products (LEFT JOIN).
 */

export const ORDER_ITEM_PRODUCT_JOIN = `
  LEFT JOIN products pr ON pr.id = CAST(
    COALESCE(NULLIF(TRIM(COALESCE(CAST(json_extract(i.params, '$.productId') AS TEXT), '')), ''), '0') AS INTEGER
  ) AND CAST(
    COALESCE(NULLIF(TRIM(COALESCE(CAST(json_extract(i.params, '$.productId') AS TEXT), '')), ''), '0') AS INTEGER
  ) > 0
`.trim()

/** Стабильный ключ группировки (строка). */
export function orderItemProductGroupKeyExpr(): string {
  return `COALESCE(
  CASE WHEN pr.id IS NOT NULL AND pr.id > 0 THEN 'i:' || CAST(pr.id AS TEXT) END,
  CASE WHEN NULLIF(TRIM(COALESCE(json_extract(i.params, '$.productName'), '')), '') != ''
    THEN 'n:' || LOWER(TRIM(COALESCE(json_extract(i.params, '$.productName'), ''))) END,
  CASE WHEN NULLIF(TRIM(COALESCE(json_extract(i.params, '$.description'), '')), '') != ''
    THEN 'd:' || LOWER(SUBSTR(TRIM(COALESCE(json_extract(i.params, '$.description'), '')), 1, 64)) || ':' || LOWER(i.type) END,
  't:' || LOWER(i.type)
)`
}

/** Подпись для отчёта (как product_type в API). */
export function orderItemProductLabelExpr(): string {
  return `COALESCE(
  pr.name,
  NULLIF(TRIM(COALESCE(json_extract(i.params, '$.productName'), '')), ''),
  CASE
    WHEN NULLIF(TRIM(COALESCE(json_extract(i.params, '$.description'), '')), '') != ''
      AND INSTR(COALESCE(json_extract(i.params, '$.description'), ''), '•') > 0
    THEN TRIM(SUBSTR(
      json_extract(i.params, '$.description'),
      1,
      INSTR(COALESCE(json_extract(i.params, '$.description'), ''), '•') - 1
    ))
    WHEN NULLIF(TRIM(COALESCE(json_extract(i.params, '$.description'), '')), '') != ''
    THEN TRIM(SUBSTR(json_extract(i.params, '$.description'), 1, 100))
    ELSE NULL
  END,
  i.type
)`
}
