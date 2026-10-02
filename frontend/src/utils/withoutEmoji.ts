/** Убирает эмодзи из подписи. Иконки продуктов и категорий в базе часто хранятся как эмодзи. */
export function withoutEmoji(value: string | null | undefined): string {
  if (!value) return '';
  return [...value]
    .filter((ch) => !/\p{Extended_Pictographic}/u.test(ch) && ch !== '\uFE0F' && ch !== '\u200D')
    .join('')
    .replace(/ {2,}/g, ' ')
    .trim();
}
