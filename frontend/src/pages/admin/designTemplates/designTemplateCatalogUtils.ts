import type { DesignTemplate } from '../../../api';
import {
  getEffectiveConfig,
  type ProductTypeId,
  type SimplifiedConfig,
} from '../../../features/productTemplate/hooks/useProductTemplate';

export type ProductBindingLabels = {
  productName?: string;
  typeName?: string;
  sizeLabel?: string;
};

export type TemplateCatalogStatus = 'active' | 'inactive' | 'draft';

export type RequiredFontSpecEntry = {
  family: string;
  source: 'global' | 'bundled' | 'missing';
  fontId?: number;
  url?: string;
};

export type ParsedTemplateCatalogSpec = {
  width_mm?: number;
  height_mm?: number;
  page_count?: number;
  productId?: number;
  typeId?: number;
  sizeId?: string;
  /** Клиентский редактор: flat | souvenir_3d */
  editorKind?: 'flat' | 'souvenir_3d';
  hasDesignState: boolean;
  importStatus?: string;
  importWarnings: string[];
  importerVersion?: number;
  requiredFonts: RequiredFontSpecEntry[];
  fontsResolved: boolean;
};

export type DesignTemplateImportApiError = {
  message: string;
  errors: string[];
  warnings: string[];
};

/** Разбор ошибки импорта (axios interceptor сохраняет responseData на thrown Error). */
export function parseDesignTemplateImportError(err: unknown, fallback = 'Ошибка импорта шаблона'): DesignTemplateImportApiError {
  const withData = err as Error & {
    responseData?: { message?: string; error?: string; errors?: string[]; warnings?: string[] };
    response?: { data?: { message?: string; error?: string; errors?: string[]; warnings?: string[] } };
  };
  const data = withData.responseData ?? withData.response?.data;
  if (data) {
    const errors = Array.isArray(data.errors)
      ? data.errors.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
      : [];
    const warnings = Array.isArray(data.warnings)
      ? data.warnings.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
      : [];
    const message = String(data.message || data.error || errors[0] || fallback).trim() || fallback;
    return { message, errors: errors.length > 0 ? errors : [message], warnings };
  }
  if (err instanceof Error) {
    const message = err.message.replace(/^\d{3}:\s*/, '').trim() || fallback;
    return { message, errors: [message], warnings: [] };
  }
  return { message: fallback, errors: [fallback], warnings: [] };
}

export function parseTemplateSpec(template: DesignTemplate): ParsedTemplateCatalogSpec {
  const empty: ParsedTemplateCatalogSpec = {
    hasDesignState: false,
    importWarnings: [],
    requiredFonts: [],
    fontsResolved: true,
  };
  if (!template.spec) return empty;
  try {
    const spec = typeof template.spec === 'string'
      ? (JSON.parse(template.spec) as Record<string, unknown>)
      : (template.spec as Record<string, unknown>);
    const importMeta = spec.import as Record<string, unknown> | undefined;
    const designState = spec.designState as Record<string, unknown> | undefined;
    const warnings = Array.isArray(importMeta?.warnings)
      ? importMeta.warnings.filter((w): w is string => typeof w === 'string')
      : [];
    const requiredFonts = Array.isArray(spec.requiredFonts)
      ? spec.requiredFonts.filter((f): f is RequiredFontSpecEntry => (
        f != null && typeof f === 'object' && typeof (f as RequiredFontSpecEntry).family === 'string'
      ))
      : [];
    return {
      width_mm: Number(spec.width_mm ?? designState?.pageWidth) || undefined,
      height_mm: Number(spec.height_mm ?? designState?.pageHeight) || undefined,
      page_count: Number(spec.page_count ?? designState?.pageCount) || undefined,
      productId: spec.productId != null ? Number(spec.productId) : undefined,
      typeId: spec.typeId != null ? Number(spec.typeId) : undefined,
      sizeId: spec.sizeId != null ? String(spec.sizeId) : undefined,
      editorKind: spec.editorKind === 'souvenir_3d' ? 'souvenir_3d' : 'flat',
      hasDesignState: Boolean(designState && Array.isArray(designState.pages) && designState.pages.length > 0),
      importStatus: typeof importMeta?.status === 'string' ? importMeta.status : undefined,
      importWarnings: warnings,
      importerVersion: typeof importMeta?.importerVersion === 'number' ? importMeta.importerVersion : undefined,
      requiredFonts,
      fontsResolved: spec.fontsResolved !== false && !requiredFonts.some((f) => f.source === 'missing'),
    };
  } catch {
    return empty;
  }
}

export function getTemplateCatalogStatus(template: DesignTemplate): TemplateCatalogStatus {
  const parsed = parseTemplateSpec(template);
  if (!parsed.hasDesignState) return 'draft';
  return template.is_active === 1 ? 'active' : 'inactive';
}

export function resolveTemplatePreviewUrl(previewUrl: string | null | undefined, apiBaseUrl: string): string | null {
  if (!previewUrl) return null;
  if (previewUrl.startsWith('http')) return previewUrl;
  const origin = apiBaseUrl.replace(/\/api\/?$/, '');
  return `${origin}${previewUrl.startsWith('/') ? '' : '/'}${previewUrl}`;
}

export function formatTemplateSize(parsed: ParsedTemplateCatalogSpec): string | null {
  if (parsed.width_mm && parsed.height_mm) {
    const pages = parsed.page_count && parsed.page_count > 1 ? ` · ${parsed.page_count} стр.` : '';
    return `${parsed.width_mm}×${parsed.height_mm} мм${pages}`;
  }
  if (parsed.page_count && parsed.page_count > 1) return `${parsed.page_count} стр.`;
  return null;
}

export function lookupProductBindingLabels(
  parsed: Pick<ParsedTemplateCatalogSpec, 'productId' | 'typeId' | 'sizeId'>,
  ctx: { productName?: string; simplified?: SimplifiedConfig | null },
): ProductBindingLabels {
  const labels: ProductBindingLabels = {};
  if (parsed.productId != null && ctx.productName) {
    labels.productName = ctx.productName;
  }
  const simplified = ctx.simplified;
  if (!simplified) return labels;

  if (parsed.typeId != null && Array.isArray(simplified.types) && simplified.types.length > 0) {
    const type = simplified.types.find((t) => String(t.id) === String(parsed.typeId));
    if (type?.name) labels.typeName = type.name;
  }

  const typeId = parsed.typeId != null ? (parsed.typeId as ProductTypeId) : null;
  const effective = getEffectiveConfig(simplified, simplified.types?.length ? typeId : null);
  const sizes = effective.sizes ?? simplified.sizes ?? [];
  if (parsed.sizeId && sizes.length > 0) {
    const size = sizes.find((s) => String(s.id) === String(parsed.sizeId));
    if (size?.label) labels.sizeLabel = size.label;
  }

  return labels;
}

export function formatProductBinding(
  parsed: ParsedTemplateCatalogSpec,
  labels?: ProductBindingLabels,
): string | null {
  if (!parsed.productId && !parsed.typeId && !parsed.sizeId) return null;
  const parts = [
    parsed.productId != null
      ? (labels?.productName ?? `продукт #${parsed.productId}`)
      : null,
    parsed.typeId != null
      ? (labels?.typeName ?? `подтип #${parsed.typeId}`)
      : null,
    parsed.sizeId
      ? (labels?.sizeLabel ?? `размер ${parsed.sizeId}`)
      : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

/** Сумма в белорусских рублях для подписей каталога и ЗП автора. */
export function formatBynAmount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(2)} бел. руб.`;
}

export function calcAuthorPayoutPerUnit(template: DesignTemplate): number | null {
  const fee = Number(template.usage_fee) || 0;
  const pct = Number(template.author_percent) || 0;
  if (fee <= 0 || pct <= 0) return null;
  return Math.round((fee * pct / 100) * 100) / 100;
}

export function formatAuthorRoyaltyLine(template: DesignTemplate): string | null {
  const fee = Number(template.usage_fee) || 0;
  const pct = Number(template.author_percent) || 0;
  if (fee <= 0 && pct <= 0) return null;
  const payout = calcAuthorPayoutPerUnit(template);
  if (payout == null) return `${formatBynAmount(fee)} · ${pct}%`;
  return `${formatBynAmount(fee)} · ${pct}% → ${formatBynAmount(payout)}/ед.`;
}

/** Семья вариантов одного design_code (размеры). */
export type DesignTemplateFamily = {
  /** Код семьи или fallback `id:N` для legacy без кода */
  key: string;
  design_code: string | null;
  /** Представитель семьи (первый после сортировки) */
  primary: DesignTemplate;
  variants: DesignTemplate[];
};

export function resolveDesignCode(template: Pick<DesignTemplate, 'design_code' | 'id'>): string | null {
  const code = template.design_code?.trim();
  return code && /^\d{6}$/.test(code) ? code : null;
}

export function formatDesignCodeLabel(template: Pick<DesignTemplate, 'design_code' | 'id' | 'name'>): string {
  return resolveDesignCode(template) ?? template.name?.trim() ?? `#${template.id}`;
}

function compareVariantsBySize(a: DesignTemplate, b: DesignTemplate): number {
  const pa = parseTemplateSpec(a);
  const pb = parseTemplateSpec(b);
  const wa = pa.width_mm ?? 0;
  const wb = pb.width_mm ?? 0;
  if (wa !== wb) return wa - wb;
  const ha = pa.height_mm ?? 0;
  const hb = pb.height_mm ?? 0;
  if (ha !== hb) return ha - hb;
  return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;
}

/** Группирует шаблоны по design_code; варианты без кода — по одному на карточку. */
export function groupTemplatesIntoFamilies(templates: DesignTemplate[]): DesignTemplateFamily[] {
  const buckets = new Map<string, DesignTemplate[]>();
  for (const t of templates) {
    const code = resolveDesignCode(t);
    const key = code ?? `id:${t.id}`;
    const list = buckets.get(key) ?? [];
    list.push(t);
    buckets.set(key, list);
  }

  const families: DesignTemplateFamily[] = [];
  for (const [key, items] of buckets) {
    const variants = [...items].sort(compareVariantsBySize);
    const design_code = key.startsWith('id:') ? null : key;
    families.push({
      key,
      design_code,
      primary: variants[0],
      variants,
    });
  }

  families.sort((a, b) => {
    const codeA = a.design_code ?? '';
    const codeB = b.design_code ?? '';
    if (codeA && codeB && codeA !== codeB) return codeA.localeCompare(codeB, 'ru');
    if (codeA && !codeB) return -1;
    if (!codeA && codeB) return 1;
    return (a.primary.sort_order ?? 0) - (b.primary.sort_order ?? 0)
      || a.primary.id - b.primary.id;
  });

  return families;
}

/** Превью семьи: site_preview с любого варианта, иначе preview_url. */
export function resolveFamilyPreviewUrl(family: DesignTemplateFamily): string | null {
  const site = family.variants.find((t) => String(t.site_preview_url ?? '').trim())?.site_preview_url
  if (site?.trim()) return site.trim()
  const preview = family.variants.find((t) => String(t.preview_url ?? '').trim())?.preview_url
  return preview?.trim() || null
}

export function familyCatalogStatus(family: DesignTemplateFamily): TemplateCatalogStatus {
  if (family.variants.some((t) => getTemplateCatalogStatus(t) === 'active')) return 'active';
  if (family.variants.every((t) => getTemplateCatalogStatus(t) === 'draft')) return 'draft';
  return 'inactive';
}
