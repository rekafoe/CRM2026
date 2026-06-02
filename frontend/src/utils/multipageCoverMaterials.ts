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

export type CoverMaterialOptionLike = {
  id: number;
  name: string;
  density?: number | string;
  category_name?: string;
};

type PaperTypeDensityRow = {
  material_id?: number;
  value?: number;
  price?: number;
};

/** Опции для select обложки: склад + типы бумаги по allowed_material_ids из шаблона. */
export function resolveCoverMaterialsForAllowed(
  allowedIds: number[],
  allMaterials: CoverMaterialOptionLike[],
  paperTypes: Array<{
    id?: number | string;
    name: string;
    display_name?: string;
    densities?: PaperTypeDensityRow[];
  }>,
): CoverMaterialOptionLike[] {
  const ids = allowedIds
    .map((id) => Number(id))
    .filter((n) => Number.isFinite(n) && n > 0);
  const byApiId = new Map<number, CoverMaterialOptionLike>();
  for (const m of allMaterials) {
    const id = Number(m.id);
    if (Number.isFinite(id) && id > 0) byApiId.set(id, { ...m, id });
  }

  return ids.map((id) => {
    const fromApi = byApiId.get(id);
    if (fromApi) return fromApi;

    for (const pt of paperTypes) {
      const density = (pt.densities ?? []).find(
        (d) => Number(d.material_id) === id,
      );
      if (density) {
        const label = pt.display_name || pt.name;
        const dens =
          density.value != null && Number.isFinite(Number(density.value))
            ? `${density.value} г/м²`
            : '';
        return {
          id,
          name: dens ? `${label} · ${dens}` : label,
          density: density.value,
        };
      }
    }

    return { id, name: `Материал #${id}` };
  });
}
