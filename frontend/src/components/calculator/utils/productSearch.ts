/** Нормализация для поиска продуктов: кириллица, ё→е, дефисы → пробел. */
export function normalizeProductSearchText(value: unknown): string {
  return String(value ?? '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[\u2010-\u2015\u2212\-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function productMatchesSearchQuery(
  product: {
    name?: unknown;
    description?: unknown;
    category_name?: unknown;
    route_key?: unknown;
  },
  rawQuery: string
): boolean {
  const needle = normalizeProductSearchText(rawQuery);
  if (!needle) return true;
  const haystack = [product.name, product.description, product.category_name, product.route_key]
    .map(normalizeProductSearchText)
    .filter(Boolean)
    .join(' ');
  const tokens = needle.split(' ').filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}
