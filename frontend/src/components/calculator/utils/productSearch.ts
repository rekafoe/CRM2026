/** Нормализация для поиска продуктов: кириллица, ё→е, дефисы → пробел. */
export function normalizeProductSearchText(value: unknown): string {
  return String(value ?? '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[\u2010-\u2015\u2212]/g, ' ')
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Поиск по названию (и route_key).
 * Описание/категорию не трогаем — иначе «печать» в категории тянет половину каталога.
 */
export function productMatchesSearchQuery(
  product: {
    name?: unknown;
    route_key?: unknown;
  },
  rawQuery: string
): boolean {
  const needle = normalizeProductSearchText(rawQuery);
  if (!needle) return false;
  const tokens = needle.split(' ').filter(Boolean);
  if (tokens.length === 0) return false;

  const haystack = [product.name, product.route_key]
    .map(normalizeProductSearchText)
    .filter(Boolean)
    .join(' ');
  if (!haystack) return false;

  return tokens.every((token) => haystack.includes(token));
}
