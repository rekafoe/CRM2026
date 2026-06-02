/** Обложка многостраничного продукта: разрешённые материалы. */

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

export function resolveCoverMaterialIdForPricing(
  cover: MultipageCoverConfigLike | undefined,
  configuration: { cover_material_id?: number; material_id?: number }
): number {
  const allowed = getCoverAllowedMaterialIds(cover);
  const fromConfig =
    configuration.cover_material_id != null
      ? Number(configuration.cover_material_id)
      : NaN;
  if (Number.isFinite(fromConfig) && fromConfig > 0) {
    if (allowed.length === 0 || allowed.includes(fromConfig)) return fromConfig;
  }
  const templateDefault =
    cover?.material_id != null ? Number(cover.material_id) : NaN;
  if (
    Number.isFinite(templateDefault) &&
    templateDefault > 0 &&
    (allowed.length === 0 || allowed.includes(templateDefault))
  ) {
    return templateDefault;
  }
  if (allowed.length > 0) return allowed[0];
  return Number(configuration.material_id) || 0;
}
