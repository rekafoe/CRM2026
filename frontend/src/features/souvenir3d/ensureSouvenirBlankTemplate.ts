import {
  addSubtypeDesign,
  createDesignTemplate,
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

function resolveTypeId(simplified: SimplifiedConfig): number {
  const types = simplified.types;
  if (Array.isArray(types) && types.length > 0) {
    const def = types.find((t) => t.default) ?? types[0];
    const id = Number(def?.id);
    if (Number.isFinite(id)) return id;
  }
  return 0;
}

/**
 * Гарантирует size под printArea и пустой design_template, привязанный к продукту.
 * Вызывать при design_editor_mode === souvenir_3d.
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

  const typeId = resolveTypeId(simplified);
  let sizeAdded = false;

  let sizes = Array.isArray(simplified.sizes) ? [...simplified.sizes] : [];
  let size = sizes.find((s) => sizeMatchesArea(s, area));
  if (!size && simplified.types?.length && simplified.typeConfigs) {
    const typeKey = String(typeId);
    const tc = simplified.typeConfigs[typeKey];
    const typeSizes = tc?.sizes ?? [];
    size = typeSizes.find((s) => sizeMatchesArea(s, area));
    if (!size && typeSizes[0]) size = typeSizes[0];
  }
  if (!size && sizes[0]) size = sizes[0];

  if (!size) {
    size = buildSizeFromArea(area);
    sizes = [...sizes, size];
    simplified = { ...simplified, sizes };
    sizeAdded = true;
  }

  const sizeId = String(size.id);

  const existing = await getSubtypeDesigns(productId, typeId, sizeId);
  const linked = existing.data ?? [];
  if (linked.length > 0) {
    const templateId = Number(linked[0].design_template_id);
    return {
      templateId,
      created: false,
      sizeId,
      typeId,
      simplified,
      sizeAdded,
    };
  }

  const designState = buildEmptyDesignState({
    pageWidth: area.widthMm,
    pageHeight: area.heightMm,
    pageCount: 1,
  });

  const nameBase = (productName || 'Сувенир').trim() || 'Сувенир';
  const { data: created } = await createDesignTemplate({
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

  const templateId = Number(created.id);
  await addSubtypeDesign(productId, typeId, templateId, sizeId);

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
