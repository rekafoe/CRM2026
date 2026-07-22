import {
  addSubtypeDesign,
  createDesignTemplate,
  getDesignTemplate,
  getSubtypeDesigns,
} from '../../api';
import { buildEmptyDesignState } from '../../pages/admin/designEditor/designEditorState';
import type { ProductPrintAreaConfig, SimplifiedConfig, SimplifiedSizeConfig } from '../productTemplate/hooks/useProductTemplate';
import { DEFAULT_PRINT_AREA_TSHIRT, parsePrintAreas } from './types';

export type EnsureSouvenirBlankResult = {
  templateId: number;
  created: boolean;
  sizeId: string;
  typeId: number;
  /** Если в simplified добавили размер — вернуть патч для сохранения. */
  simplified: SimplifiedConfig;
  sizeAdded: boolean;
};

/** Стабильный id автосозданного подтипа «Основной» (не Date.now — иначе каждый save плодит typeId). */
const STABLE_DEFAULT_TYPE_ID = 1;

function resolvePrintArea(simplified: SimplifiedConfig): ProductPrintAreaConfig {
  const fromConfig = Array.isArray(simplified.printAreas) ? simplified.printAreas : [];
  if (fromConfig.length > 0 && fromConfig[0].widthMm > 0 && fromConfig[0].heightMm > 0) {
    return fromConfig[0];
  }
  const parsed = parsePrintAreas(simplified.printAreas);
  if (parsed[0]) {
    return {
      id: parsed[0].id,
      label: parsed[0].label,
      widthMm: parsed[0].widthMm,
      heightMm: parsed[0].heightMm,
      meshName: parsed[0].meshName,
      modelUrl: parsed[0].modelUrl,
      procedural: parsed[0].procedural,
    };
  }
  return {
    id: DEFAULT_PRINT_AREA_TSHIRT.id,
    label: DEFAULT_PRINT_AREA_TSHIRT.label,
    widthMm: DEFAULT_PRINT_AREA_TSHIRT.widthMm,
    heightMm: DEFAULT_PRINT_AREA_TSHIRT.heightMm,
    meshName: DEFAULT_PRINT_AREA_TSHIRT.meshName,
    procedural: DEFAULT_PRINT_AREA_TSHIRT.procedural,
  };
}

function sizeMatchesArea(size: SimplifiedSizeConfig, area: ProductPrintAreaConfig): boolean {
  return Math.abs(Number(size.width_mm) - area.widthMm) <= 1
    && Math.abs(Number(size.height_mm) - area.heightMm) <= 1;
}

function buildSizeFromArea(area: ProductPrintAreaConfig): SimplifiedSizeConfig {
  return {
    id: String(area.id || `${area.widthMm}x${area.heightMm}`),
    label: area.label || `${area.widthMm}×${area.heightMm}`,
    width_mm: area.widthMm,
    height_mm: area.heightMm,
    print_prices: [],
    allowed_material_ids: [],
    material_prices: [],
    finishing: [],
  };
}

function resolveTypeId(simplified: SimplifiedConfig): number | null {
  const types = simplified.types;
  if (Array.isArray(types) && types.length > 0) {
    const def = types.find((t) => t.default) ?? types[0];
    const id = Number(def?.id);
    if (Number.isFinite(id) && id > 0) return id;
  }
  const configKeys = Object.keys(simplified.typeConfigs ?? {});
  for (const key of configKeys) {
    const id = Number(key);
    if (Number.isFinite(id) && id > 0) return id;
  }
  return null;
}

/** Подтип обязателен для product_subtype_designs (typeId > 0). */
function ensureDefaultType(
  simplified: SimplifiedConfig,
  area: ProductPrintAreaConfig,
): { simplified: SimplifiedConfig; typeId: number; typeAdded: boolean } {
  const existingId = resolveTypeId(simplified);
  if (existingId != null) {
    return { simplified, typeId: existingId, typeAdded: false };
  }

  const typeId = STABLE_DEFAULT_TYPE_ID;
  const size = buildSizeFromArea(area);
  const sizes = Array.isArray(simplified.sizes) && simplified.sizes.length > 0
    ? simplified.sizes
    : [size];

  return {
    typeId,
    typeAdded: true,
    simplified: {
      ...simplified,
      types: [{ id: typeId, name: 'Основной', default: true }],
      typeConfigs: {
        ...(simplified.typeConfigs ?? {}),
        [String(typeId)]: {
          sizes,
          ...(simplified.typeConfigs?.[String(typeId)] ?? {}),
        },
      },
      sizes,
    },
  };
}

function listFromAxios<T>(response: unknown): T[] {
  if (Array.isArray(response)) return response as T[];
  if (response && typeof response === 'object' && Array.isArray((response as { data?: unknown }).data)) {
    return (response as { data: T[] }).data;
  }
  return [];
}

async function tryReadTemplateId(templateId: number): Promise<number | null> {
  if (!(templateId > 0)) return null;
  try {
    const res = await getDesignTemplate(templateId);
    const row = (res as { data?: { id?: number } }).data ?? (res as { id?: number });
    const id = Number(row?.id);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

async function findExistingBlankTemplateId(
  productId: number,
  typeId: number,
): Promise<number | null> {
  try {
    // Без sizeId: любой уже привязанный макет подтипа — не плодим второй.
    const existing = await getSubtypeDesigns(productId, typeId);
    const linked = listFromAxios<{ design_template_id?: number }>(existing);
    for (const row of linked) {
      const id = Number(row.design_template_id);
      if (Number.isFinite(id) && id > 0) return id;
    }
  } catch {
    // ignore — ниже попробуем создать только если совсем ничего нет
  }
  return null;
}

async function ensureSubtypeLink(
  productId: number,
  typeId: number,
  templateId: number,
  sizeId: string,
): Promise<void> {
  try {
    await addSubtypeDesign(productId, typeId, templateId, sizeId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Уже привязан к этому размеру / unique — ок.
    if (msg.includes('409') || msg.includes('UNIQUE') || msg.includes('уже привязан')) return;
    throw err;
  }
}

/**
 * Гарантирует size под printArea и пустой design_template, привязанный к продукту.
 * Идемпотентно: повторные save/autosave не создают новый шаблон.
 */
export async function ensureSouvenirBlankDesignTemplate(input: {
  productId: number;
  productName?: string;
  simplified: SimplifiedConfig;
}): Promise<EnsureSouvenirBlankResult | null> {
  const { productId, productName } = input;
  let simplified: SimplifiedConfig = {
    ...input.simplified,
    printAreas: input.simplified.printAreas?.length
      ? input.simplified.printAreas
      : undefined,
  };

  if (simplified.design_editor_mode !== 'souvenir_3d') return null;

  const area = resolvePrintArea(simplified);
  if (!simplified.printAreas?.length) {
    simplified = { ...simplified, printAreas: [area] };
  }

  const typeEnsured = ensureDefaultType(simplified, area);
  simplified = typeEnsured.simplified;
  const typeId = typeEnsured.typeId;
  let sizeAdded = typeEnsured.typeAdded;

  let sizes = Array.isArray(simplified.sizes) ? [...simplified.sizes] : [];
  const typeKey = String(typeId);
  const typeSizes = simplified.typeConfigs?.[typeKey]?.sizes ?? [];

  let size =
    sizes.find((s) => sizeMatchesArea(s, area))
    ?? typeSizes.find((s) => sizeMatchesArea(s, area));

  // Размер калькулятора ≠ зона печати (часто A4 vs 297×420) — добавляем size под printArea,
  // а не клеим макет к чужому sizeId.
  if (!size) {
    size = buildSizeFromArea(area);
    sizes = [...sizes, size];
    simplified = {
      ...simplified,
      sizes,
      typeConfigs: {
        ...(simplified.typeConfigs ?? {}),
        [typeKey]: {
          ...(simplified.typeConfigs?.[typeKey] ?? {}),
          sizes: [...(simplified.typeConfigs?.[typeKey]?.sizes ?? []), size],
        },
      },
    };
    sizeAdded = true;
  }

  const sizeId = String(size.id);

  const rememberedId = Number(simplified.souvenirBlankTemplateId);
  const rememberedOk = await tryReadTemplateId(rememberedId);
  if (rememberedOk != null) {
    await ensureSubtypeLink(productId, typeId, rememberedOk, sizeId);
    return {
      templateId: rememberedOk,
      created: false,
      sizeId,
      typeId,
      simplified: {
        ...simplified,
        souvenirBlankTemplateId: rememberedOk,
      },
      sizeAdded,
    };
  }

  const existingId = await findExistingBlankTemplateId(productId, typeId);
  if (existingId != null) {
    await ensureSubtypeLink(productId, typeId, existingId, sizeId);
    return {
      templateId: existingId,
      created: false,
      sizeId,
      typeId,
      simplified: {
        ...simplified,
        souvenirBlankTemplateId: existingId,
      },
      sizeAdded,
    };
  }

  const designState = buildEmptyDesignState({
    pageWidth: area.widthMm,
    pageHeight: area.heightMm,
    pageCount: 1,
  });

  const nameBase = (productName || 'Сувенир').trim() || 'Сувенир';
  const createdRes = await createDesignTemplate({
    name: `${nameBase} — пустой (${area.widthMm}×${area.heightMm})`,
    description: 'Автосозданный пустой макет под зону печати сувенира',
    is_active: true,
    spec: {
      width_mm: area.widthMm,
      height_mm: area.heightMm,
      page_count: 1,
      editorKind: 'souvenir_3d',
      productId,
      typeId,
      sizeId,
      designState: {
        ...designState,
        templateId: null,
      },
    },
  });
  const created = (createdRes as { data?: { id?: number } }).data
    ?? (createdRes as { id?: number });
  const templateId = Number(created?.id);
  if (!Number.isFinite(templateId) || templateId <= 0) {
    throw new Error('Не удалось создать пустой макет сувенира');
  }
  await ensureSubtypeLink(productId, typeId, templateId, sizeId);

  return {
    templateId,
    created: true,
    sizeId,
    typeId,
    simplified: {
      ...simplified,
      souvenirBlankTemplateId: templateId,
    },
    sizeAdded,
  };
}
