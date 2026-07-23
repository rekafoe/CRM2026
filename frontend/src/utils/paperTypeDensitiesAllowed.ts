/** Хелперы для UX «тип бумаги → плотности → material_ids». */

export type PaperTypeDensityRow = {
  material_id?: number;
  value?: number;
  price?: number;
};

export type PaperTypeDensitiesLike = {
  id?: number | string;
  name: string;
  display_name?: string;
  densities?: PaperTypeDensityRow[];
};

export function paperTypeLabel(pt: PaperTypeDensitiesLike): string {
  return String(pt.display_name || pt.name || '').trim() || 'Тип бумаги';
}

/** Плотности типа с валидным material_id, по возрастанию. */
export function densitiesWithMaterialId(
  pt: PaperTypeDensitiesLike
): Array<{ materialId: number; value: number; price?: number }> {
  const rows = (pt.densities ?? [])
    .map((d) => {
      const materialId = Number(d.material_id);
      const value = Number(d.value);
      if (!Number.isFinite(materialId) || materialId <= 0) return null;
      if (!Number.isFinite(value) || value <= 0) return null;
      return {
        materialId,
        value,
        ...(d.price != null && Number.isFinite(Number(d.price))
          ? { price: Number(d.price) }
          : {}),
      };
    })
    .filter((x): x is { materialId: number; value: number; price?: number } => x != null);
  return rows.sort((a, b) => a.value - b.value);
}

export function toggleMaterialIdInAllowed(
  allowedIds: number[],
  materialId: number,
  checked: boolean
): number[] {
  const id = Number(materialId);
  if (!Number.isFinite(id) || id <= 0) return allowedIds;
  if (checked) {
    return allowedIds.includes(id) ? allowedIds : [...allowedIds, id];
  }
  return allowedIds.filter((x) => x !== id);
}

/** Сводка: «Мелованная · 160/200; Полуматовая · 300». */
export function summarizeAllowedPaperTypeDensities(
  paperTypes: PaperTypeDensitiesLike[],
  allowedIds: number[]
): string {
  const allowed = new Set(
    allowedIds.map(Number).filter((n) => Number.isFinite(n) && n > 0)
  );
  if (allowed.size === 0) return '';

  const parts: string[] = [];
  for (const pt of paperTypes) {
    const dens = densitiesWithMaterialId(pt)
      .filter((d) => allowed.has(d.materialId))
      .map((d) => d.value);
    if (dens.length === 0) continue;
    parts.push(`${paperTypeLabel(pt)} · ${dens.join('/')}`);
  }
  return parts.join('; ');
}
