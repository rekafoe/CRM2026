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
