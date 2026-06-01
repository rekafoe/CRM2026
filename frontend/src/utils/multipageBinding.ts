export type BindingPagesLimits = {
  minPages: number | null;
  maxPages: number | null;
};

export function readBindingPagesLimits(parameters: unknown): BindingPagesLimits {
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
    return { minPages: null, maxPages: null };
  }
  const p = parameters as Record<string, unknown>;
  const minRaw = p.min_pages ?? p.minPages;
  const maxRaw = p.max_pages ?? p.maxPages;
  const minPages =
    minRaw != null && Number.isFinite(Number(minRaw)) && Number(minRaw) > 0
      ? Math.floor(Number(minRaw))
      : null;
  const maxPages =
    maxRaw != null && Number.isFinite(Number(maxRaw)) && Number(maxRaw) > 0
      ? Math.floor(Number(maxRaw))
      : null;
  return { minPages, maxPages };
}

export function formatBindingPagesHint(limits: BindingPagesLimits): string | null {
  const { minPages, maxPages } = limits;
  if (minPages == null && maxPages == null) return null;
  if (minPages != null && maxPages != null) {
    return `Допустимо: от ${minPages} до ${maxPages} стр.`;
  }
  if (maxPages != null) return `Не более ${maxPages} стр.`;
  if (minPages != null) return `Не менее ${minPages} стр.`;
  return null;
}

export function validateBindingPagesForCalculator(
  pages: number,
  limits: BindingPagesLimits,
  bindingLabel?: string,
): string | null {
  const p = Math.floor(pages);
  if (!Number.isFinite(p) || p < 1) return null;
  const label = bindingLabel?.trim() ? ` «${bindingLabel.trim()}»` : '';
  const { minPages, maxPages } = limits;
  if (minPages != null && p < minPages) {
    return maxPages != null
      ? `Для переплёта${label} допустимо от ${minPages} до ${maxPages} страниц`
      : `Для переплёта${label} не менее ${minPages} страниц`;
  }
  if (maxPages != null && p > maxPages) {
    return minPages != null
      ? `Для переплёта${label} допустимо от ${minPages} до ${maxPages} страниц`
      : `Для переплёта${label} не более ${maxPages} страниц`;
  }
  return null;
}
