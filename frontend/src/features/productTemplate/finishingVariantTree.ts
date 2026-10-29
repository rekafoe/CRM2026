import type { ServiceVariant } from '../../types/pricing';

export type FinishingLeafOption = {
  id: number;
  typeLabel: string;
  subtypeLabel: string;
  label: string;
  variantName: string;
  subtype: string;
  density: string;
};

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function parentIdOf(variant: ServiceVariant): number | null {
  const raw = variant.parentVariantId ?? variant.parameters?.parentVariantId;
  const id = Number(raw);
  return raw != null && raw !== '' && Number.isFinite(id) && id > 0 ? id : null;
}

/** Листья дерева услуги: тип и подтип отдельно, без общего имени группы «Рулонная». */
export function finishingLeafOptions(variants: ServiceVariant[]): FinishingLeafOption[] {
  const byId = new Map<number, ServiceVariant>();
  const childCount = new Map<number, number>();
  for (const variant of variants) {
    const id = Number(variant.id);
    if (Number.isFinite(id)) byId.set(id, variant);
  }
  for (const variant of byId.values()) {
    const parentId = parentIdOf(variant);
    if (parentId != null && byId.has(parentId)) {
      childCount.set(parentId, (childCount.get(parentId) ?? 0) + 1);
    }
  }

  const namesWithDetail = new Set<string>();
  for (const variant of byId.values()) {
    const params = variant.parameters ?? {};
    if (text(params.type) || text(params.subType) || text(params.density)) {
      namesWithDetail.add(text(variant.variantName));
    }
  }

  const leaves = [...byId.values()].filter((variant) => {
    if ((childCount.get(Number(variant.id)) ?? 0) > 0) return false;
    const params = variant.parameters ?? {};
    const hasDetail =
      text(params.type) || text(params.subType) || text(params.density) || parentIdOf(variant) != null;
    if (hasDetail) return true;
    return !namesWithDetail.has(text(variant.variantName));
  });

  return leaves
    .map((variant) => {
      const params = variant.parameters ?? {};
      const parent = (() => {
        const parentId = parentIdOf(variant);
        return parentId != null ? byId.get(parentId) : undefined;
      })();
      const parentParams = parent?.parameters ?? {};
      const typeLabel =
        text(params.type) || text(parentParams.type) || text(parent?.variantName) || text(variant.variantName);
      const subtypeLabel = text(params.subType) || text(parentParams.subType);
      const density = text(params.density);
      const detail = subtypeLabel || (density && density !== typeLabel ? density : '');
      const label =
        typeLabel && detail && detail !== typeLabel ? `${typeLabel} — ${detail}` : typeLabel || detail || text(variant.variantName);
      return {
        id: Number(variant.id),
        typeLabel: typeLabel || label,
        subtypeLabel: detail && detail !== typeLabel ? detail : '',
        label,
        variantName: text(variant.variantName),
        subtype: detail || typeLabel,
        density: density || detail,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
}

export function groupFinishingLeaves(options: FinishingLeafOption[]): Array<{
  typeLabel: string;
  leaves: FinishingLeafOption[];
}> {
  const groups = new Map<string, FinishingLeafOption[]>();
  for (const option of options) {
    const key = option.typeLabel || option.label;
    const list = groups.get(key) ?? [];
    list.push(option);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([typeLabel, leaves]) => ({ typeLabel, leaves }))
    .sort((a, b) => a.typeLabel.localeCompare(b.typeLabel, 'ru'));
}
