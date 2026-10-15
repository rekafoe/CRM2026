/**
 * Упрощённый конфиг по типам продукта.
 * Если у продукта есть types + typeConfigs, возвращаем конфиг выбранного типа;
 * иначе — legacy sizes/pages из корня.
 * Для подтипов размеры возвращаются с уже подставленными эффективными allowed_material_ids
 * (общие типа или свои размера по флагу use_own_materials).
 */
export interface EffectiveSimplifiedConfig {
  sizes: Array<{ id: string; label?: string; width_mm: number; height_mm: number; [key: string]: any }>;
  pages?: {
    options?: number[];
    default?: number;
    allowCustom?: boolean;
    min?: number;
    max?: number;
    step?: number;
  };
}

/**
 * Эффективный список id материалов для размера подтипа:
 * свои (use_own_materials) или общие типа (common_allowed_material_ids).
 * Экспорт для калькулятора: при смене подтипа не подставлять initial.material_id вне этого списка.
 */
export function getEffectiveAllowedMaterialIds(
  typeConfig: { common_allowed_material_ids?: number[] } | null | undefined,
  size: { use_own_materials?: boolean; allowed_material_ids?: number[] } | null | undefined
): number[] {
  if (!size) return [];
  const common = typeConfig?.common_allowed_material_ids;
  if (size.use_own_materials === true) return size.allowed_material_ids ?? [];
  if (size.use_own_materials === false) return common ?? [];
  return common != null && common.length > 0 ? common : (size.allowed_material_ids ?? []);
}

/**
 * ID услуг (post_processing_services), явно заданные для подтипа:
 * `sizes[].finishing[].service_id` и `initial.operations`.
 * В схеме API операции продукта — объединение по всем подтипам; без этой выборки
 * в калькулятор подмешиваются чужие is_default и остаются лишние чекбоксы.
 */
export function collectAllowedOperationIdsForTypeConfig(
  cfg: { sizes?: any[]; initial?: { operations?: any[] } } | null | undefined
): Set<number> {
  const ids = new Set<number>();
  if (!cfg || typeof cfg !== 'object') return ids;
  const sizes = Array.isArray(cfg.sizes) ? cfg.sizes : [];
  for (const size of sizes) {
    const fin = Array.isArray(size?.finishing) ? size.finishing : [];
    for (const f of fin) {
      const sid = f?.service_id ?? f?.operation_id;
      if (sid != null && sid !== '' && Number.isFinite(Number(sid))) {
        ids.add(Number(sid));
      }
    }
  }
  const initialOps = Array.isArray(cfg.initial?.operations) ? cfg.initial.operations : [];
  for (const op of initialOps) {
    const oid = op?.operation_id ?? op?.service_id ?? op?.id;
    if (oid != null && oid !== '' && Number.isFinite(Number(oid))) {
      ids.add(Number(oid));
    }
  }
  return ids;
}

/** Строковые ключи из неизвестного значения (для JSON с шаблона). */
function filterStringKeys(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

/**
 * Эффективные ключи типа цены: сначала ограничение продукта, затем пересечение с allowed_price_types подтипа (если задано).
 */
export function getEffectiveAllowedPriceTypes(params: {
  productAllowed: string[] | null | undefined;
  subtypeAllowed: string[] | null | undefined;
}): string[] {
  const product = filterStringKeys(params.productAllowed);
  const sub = filterStringKeys(params.subtypeAllowed);
  if (sub.length === 0) return product;
  if (product.length === 0) return sub;
  const subSet = new Set(sub);
  return product.filter((k) => subSet.has(k));
}

export function subtypePriceTypesMatchProduct(
  subtypeAllowed: string[] | null | undefined,
  productAllowed: string[] | null | undefined
): boolean {
  const base = filterStringKeys(productAllowed);
  const sub = filterStringKeys(subtypeAllowed);
  if (sub.length === 0) return true;
  if (base.length === 0) return false;
  return sameStringSet(orderedKeys(sub, base), base);
}

function orderedKeys(keys: string[], orderRef: string[]): string[] {
  const set = new Set(keys);
  return orderRef.filter((k) => set.has(k));
}

/** Выборка и накатка в калькуляторе продукта не показываются. */
const PLOTTER_ROLL_FIN_CALC_FIELD_NAMES = ['plotter_weeding', 'plotter_mounting'] as const;

export function getHiddenPlotterRollFinFieldNamesForCalculator(): Set<string> {
  return new Set(PLOTTER_ROLL_FIN_CALC_FIELD_NAMES);
}

/** У выбранного подтипа включена плоттерная резка (рулон, лист или авто). */
export function isProductPlotterEnabled(
  simplified:
    | {
        typeConfigs?: Record<string, { plotter?: { enabled?: boolean } }>;
      }
    | null
    | undefined,
  selectedTypeId: number | null | undefined,
): boolean {
  if (selectedTypeId == null || !Number.isFinite(Number(selectedTypeId))) return false;
  const cfg = simplified?.typeConfigs?.[String(selectedTypeId)];
  return cfg?.plotter?.enabled === true;
}

function mergeSimplifiedPagesConfig(
  root?: EffectiveSimplifiedConfig['pages'],
  typePages?: EffectiveSimplifiedConfig['pages'],
): EffectiveSimplifiedConfig['pages'] | undefined {
  if (!root && !typePages) return undefined;
  return { ...(root ?? {}), ...(typePages ?? {}) };
}

export function getEffectiveSimplifiedConfig(
  simplified: {
    sizes?: EffectiveSimplifiedConfig['sizes'];
    pages?: EffectiveSimplifiedConfig['pages'];
    types?: Array<{ id: number; name: string; default?: boolean }>;
    typeConfigs?: Record<string, { sizes?: any[]; pages?: any; common_allowed_material_ids?: number[] }>;
  } | null | undefined,
  selectedTypeId: number | null
): EffectiveSimplifiedConfig {
  if (!simplified) {
    return { sizes: [], pages: undefined };
  }
  if (simplified.types?.length && simplified.typeConfigs && selectedTypeId) {
    const typeConfig = simplified.typeConfigs[String(selectedTypeId)];
    const rawSizes = typeConfig?.sizes ?? [];
    const sizesWithEffectiveMaterials = rawSizes.map((s: any) => ({
      ...s,
      allowed_material_ids: getEffectiveAllowedMaterialIds(typeConfig as any, s),
    }));
    return {
      sizes: sizesWithEffectiveMaterials,
      pages: mergeSimplifiedPagesConfig(simplified.pages, typeConfig?.pages),
    };
  }
  return {
    sizes: simplified.sizes ?? [],
    pages: simplified.pages,
  };
}

export function isFinishingRequiredFlag(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

export type RequiredOperationSeed = {
  operationId: number;
  variantId?: number;
  subtype?: string;
  quantity: number;
  required: true;
};

type FinishingTemplateRow = {
  service_id?: number;
  operation_id?: number;
  units_per_item?: number;
  variant_id?: unknown;
  subtype?: string;
  is_required?: unknown;
};

type SizeWithFinishing = { finishing?: unknown; [key: string]: any } | null | undefined;

function finishingRowsOf(size: SizeWithFinishing): FinishingTemplateRow[] {
  return Array.isArray(size?.finishing) ? (size.finishing as FinishingTemplateRow[]) : [];
}

function positiveUnits(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const units = Number(raw);
  if (!Number.isFinite(units) || units < 0) return undefined;
  return units;
}

/** Обязательные услуги выбранного размера: всегда в расчёте, с количеством из шаблона. */
export function requiredOperationsFromSizeFinishing(size: SizeWithFinishing): RequiredOperationSeed[] {
  const out: RequiredOperationSeed[] = [];
  const seen = new Set<number>();
  for (const row of finishingRowsOf(size)) {
    if (!isFinishingRequiredFlag(row?.is_required)) continue;
    const id = Number(row.service_id ?? row.operation_id);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    const variantRaw = row.variant_id;
    const variantId =
      variantRaw != null && variantRaw !== '' && Number.isFinite(Number(variantRaw)) && Number(variantRaw) > 0
        ? Number(variantRaw)
        : undefined;
    out.push({
      operationId: id,
      quantity: positiveUnits(row.units_per_item) ?? 1,
      required: true,
      ...(variantId != null ? { variantId } : {}),
      ...(row.subtype ? { subtype: String(row.subtype) } : {}),
    });
  }
  return out;
}

type SelectedOp = {
  operationId: number;
  quantity?: number;
  required?: boolean;
  variantId?: number;
  subtype?: string;
};

/** Снимает обязательные услуги прошлого размера и ставит текущие с их количеством. */
export function mergeRequiredSelectedOperations<T extends SelectedOp>(
  current: T[] | null | undefined,
  required: RequiredOperationSeed[],
): T[] {
  const list = Array.isArray(current) ? current : [];
  const requiredIds = new Set(required.map((row) => Number(row.operationId)));
  const kept = list.filter((op) => !op.required || requiredIds.has(Number(op.operationId)));
  let changed = kept.length !== list.length;
  const next = [...kept];
  for (const req of required) {
    const index = next.findIndex((op) => Number(op.operationId) === Number(req.operationId));
    if (index === -1) {
      next.push(req as T);
      changed = true;
      continue;
    }
    const prev = next[index];
    const variantId = req.variantId ?? prev.variantId;
    const subtype = req.subtype ?? prev.subtype;
    if (
      !prev.required ||
      prev.quantity !== req.quantity ||
      prev.variantId !== variantId ||
      prev.subtype !== subtype
    ) {
      next[index] = { ...prev, ...req, required: true, quantity: req.quantity, variantId, subtype };
      changed = true;
    }
  }
  if (!changed) return list;
  return next;
}

/** Если калькулятор ещё не прислал количество, берём его из шаблона размера. */
export function withTemplateFinishingQuantities<T extends SelectedOp>(
  ops: T[] | null | undefined,
  size: SizeWithFinishing,
): T[] {
  const list = Array.isArray(ops) ? ops : [];
  const byId = new Map<number, FinishingTemplateRow>();
  for (const row of finishingRowsOf(size)) {
    const id = Number(row?.service_id ?? row?.operation_id);
    if (Number.isFinite(id) && id > 0) byId.set(id, row);
  }
  let changed = false;
  const next = list.map((op) => {
    if (op.quantity != null && Number.isFinite(Number(op.quantity)) && Number(op.quantity) >= 0) {
      return op;
    }
    const units = positiveUnits(byId.get(Number(op.operationId))?.units_per_item);
    if (units == null) return op;
    changed = true;
    return { ...op, quantity: units };
  });
  return changed ? next : list;
}

export function templateUnitsForOperation(
  simplified: { sizes?: any[]; typeConfigs?: Record<string, { sizes?: any[] }> } | null | undefined,
  typeId: number | string | null | undefined,
  sizeId: number | string | null | undefined,
  operationId: number,
): number | undefined {
  const sizes =
    typeId != null && simplified?.typeConfigs
      ? simplified.typeConfigs[String(typeId)]?.sizes
      : simplified?.sizes;
  const sizeList = Array.isArray(sizes) ? sizes : [];
  const size =
    sizeList.find((row) => String(row?.id) === String(sizeId)) ??
    (sizeId == null || sizeId === '' ? sizeList[0] : undefined);
  const row = finishingRowsOf(size).find((item) => Number(item.service_id ?? item.operation_id) === Number(operationId));
  return positiveUnits(row?.units_per_item);
}
