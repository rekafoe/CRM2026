export type MaterialShortageLine = {
  materialId?: number;
  name?: string;
  available?: number;
  required?: number;
};

export function readMaterialShortage(params: unknown): MaterialShortageLine[] {
  let record = params;
  if (typeof record === 'string') {
    try {
      record = JSON.parse(record);
    } catch {
      return [];
    }
  }
  if (!record || typeof record !== 'object') return [];
  const shortage = (record as { materialShortage?: { items?: unknown } }).materialShortage;
  if (!shortage || typeof shortage !== 'object' || !Array.isArray(shortage.items)) return [];
  return shortage.items.filter((item) => item && typeof item === 'object') as MaterialShortageLine[];
}

export function formatMaterialShortage(items: MaterialShortageLine[]): string {
  if (items.length === 0) return '';
  const details = items.map((item) => {
    const name = String(item.name || 'материал');
    const available = Number(item.available);
    const required = Number(item.required);
    const availableText = Number.isFinite(available) ? available.toLocaleString('ru-RU') : '—';
    const requiredText = Number.isFinite(required) ? required.toLocaleString('ru-RU') : '—';
    return `${name}: доступно ${availableText}, нужно ${requiredText}`;
  });
  return `На складе может не хватить материала. ${details.join('; ')}`;
}
