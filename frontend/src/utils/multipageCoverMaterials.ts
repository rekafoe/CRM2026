/** Обложка многостраничного продукта: разрешённые материалы и выбор в калькуляторе. */

export type MultipageCoverConfigLike = {
  mode?: string;
  allowed_material_ids?: number[];
  material_id?: number;
};

export function isSeparateCoverMode(
  cover?: MultipageCoverConfigLike | null
): boolean {
  return cover?.mode === 'separate';
}

/** ID материалов, доступных для обложки (из шаблона). */
export function getCoverAllowedMaterialIds(
  cover?: MultipageCoverConfigLike | null
): number[] {
  if (!isSeparateCoverMode(cover)) return [];
  const fromList = (cover?.allowed_material_ids ?? [])
    .map((id) => Number(id))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (fromList.length > 0) return fromList;
  const legacy = cover?.material_id != null ? Number(cover.material_id) : NaN;
  return Number.isFinite(legacy) && legacy > 0 ? [legacy] : [];
}

export function pickDefaultCoverMaterialId(
  cover?: MultipageCoverConfigLike | null
): number | undefined {
  const allowed = getCoverAllowedMaterialIds(cover);
  if (allowed.length === 0) return undefined;
  const preferred =
    cover?.material_id != null ? Number(cover.material_id) : NaN;
  if (Number.isFinite(preferred) && allowed.includes(preferred)) {
    return preferred;
  }
  return allowed[0];
}
