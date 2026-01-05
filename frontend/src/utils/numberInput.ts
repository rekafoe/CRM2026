export type NumberInputValue = number | '';

export function numberInputFromString(raw: string): NumberInputValue {
  if (raw === '') return '';
  const n = Number(raw);
  return Number.isFinite(n) ? n : '';
}

export function numberInputToNumber(value: NumberInputValue, fallback = 0): number {
  return value === '' ? fallback : value;
}

export function numberInputToNullable(value: NumberInputValue): number | null {
  return value === '' ? null : value;
}

export function normalizeEmptyStringsToNull<T extends Record<string, any>>(obj: T): T {
  const out: any = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key of Object.keys(out)) {
    if (out[key] === '') out[key] = null;
  }
  return out;
}


