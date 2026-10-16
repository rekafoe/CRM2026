export type ClientPrintTechnologyLink = {
  material_type_id: number;
  technology_name: string;
  is_default?: number;
  priority?: number;
  supports_indoor?: number;
  supports_outdoor?: number;
};

/**
 * Подпись технологии для клиентского селекта материала.
 * Берём технологию для помещения, если она есть: на сайте наклеек выбор «в помещении / на улице» скрыт
 * и расчёт идёт как для помещения. Среди них — отмеченная по умолчанию, затем с меньшим priority.
 */
export function chooseClientPrintTechnologyNames(
  links: ClientPrintTechnologyLink[],
): Map<number, string> {
  const grouped = new Map<number, ClientPrintTechnologyLink[]>();
  for (const link of links) {
    const materialTypeId = Number(link.material_type_id);
    const technologyName = String(link.technology_name ?? '').trim();
    if (!Number.isInteger(materialTypeId) || materialTypeId <= 0 || !technologyName) continue;
    const bucket = grouped.get(materialTypeId) ?? [];
    bucket.push(link);
    grouped.set(materialTypeId, bucket);
  }

  const chosen = new Map<number, string>();
  for (const [materialTypeId, bucket] of grouped) {
    const indoor = bucket.filter((link) => Number(link.supports_indoor) !== 0);
    const pool = indoor.length > 0 ? indoor : bucket;
    pool.sort((left, right) => {
      const byDefault = Number(right.is_default) - Number(left.is_default);
      if (byDefault !== 0) return byDefault;
      return Number(left.priority ?? 100) - Number(right.priority ?? 100);
    });
    chosen.set(materialTypeId, String(pool[0].technology_name).trim());
  }
  return chosen;
}
