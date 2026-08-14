export interface ServiceVariantTreeRow {
  id: number;
  variant_name: string;
  parameters?: unknown;
  parent_variant_id?: number | string | null;
}

function parseParameters(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function resolveServiceVariantParentId(row: ServiceVariantTreeRow): number | null {
  const parameters = parseParameters(row.parameters);
  const raw = row.parent_variant_id ?? parameters.parentVariantId;
  const id = Number(raw);
  return raw != null && raw !== '' && Number.isFinite(id) && id > 0 ? id : null;
}

function hasLevelParameters(row: ServiceVariantTreeRow): boolean {
  const parameters = parseParameters(row.parameters);
  return ['type', 'density'].some((key) => String(parameters[key] ?? '').trim().length > 0);
}

/**
 * Повторяет модель CRM-редактора:
 * - level 0 — один корень группы variant_name;
 * - level 1 — остальные варианты группы без parent_variant_id;
 * - level 2 — варианты с parent_variant_id.
 *
 * Цену может иметь только лист: узел без более глубокого варианта.
 */
export function collectNonLeafVariantIds(rows: ServiceVariantTreeRow[]): Set<number> {
  const nonLeaf = new Set<number>();
  const ids = new Set(rows.map((row) => Number(row.id)).filter(Number.isFinite));

  for (const row of rows) {
    const parent = resolveServiceVariantParentId(row);
    if (parent != null && ids.has(parent)) nonLeaf.add(parent);
  }

  const groups = new Map<string, ServiceVariantTreeRow[]>();
  for (const row of rows) {
    const key = String(row.variant_name || '').trim();
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const roots = group.filter((row) => resolveServiceVariantParentId(row) == null);
    if (roots.length === 0) continue;
    // Только явный заголовок группы (без type/density) — non-leaf.
    // Плоские peers с type/density без заголовка — все листья с ценой.
    // Иначе миграция/clearNonLeafVariantPrices стирают тарифы у реального
    // продаваемого варианта, а калькулятор падает на base rate услуги.
    const explicitRoots = roots.filter((row) => !hasLevelParameters(row));
    if (explicitRoots.length === 0) continue;
    const root = [...explicitRoots].sort((left, right) => Number(left.id) - Number(right.id))[0];
    if (root) nonLeaf.add(Number(root.id));
  }

  return nonLeaf;
}

export function collectLeafVariantIds(rows: ServiceVariantTreeRow[]): number[] {
  const nonLeaf = collectNonLeafVariantIds(rows);
  return rows
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id) && !nonLeaf.has(id));
}
