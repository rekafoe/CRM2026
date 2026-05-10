/** Формат числа порога для подписей «до …» (без лишних нулей справа). */
export function formatTierQuantity(n: number, fractionDigits: number): string {
  const p = 10 ** fractionDigits;
  const rounded = Math.round(n * p) / p;
  return String(parseFloat(rounded.toFixed(fractionDigits)));
}
