/**
 * Ссылки на клиентский редактор на сайте printcore.by (актуальный UI).
 * CRM UI master/sandbox скрыты; исходники редактора в CRM — vendor source для сайта.
 */

export const PUBLIC_SITE_BASE = (
  (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim()
  || 'https://printcore.by'
).replace(/\/$/, '');

export type SiteEditorOpenParams = {
  /** products.route_key или numeric id как fallback */
  productSlug: string;
  /** types[].key или numeric typeId; `0` / `single` — продукт без подтипа */
  typeIdParam: string;
  /** ID шаблона из галереи; если не передан (или <= 0) — открывается чистый конструктор */
  templateId?: number | null;
  /** sizeId из калькулятора подтипа (для конструктора с нуля или выбранного формата) */
  sizeId?: string;
  /** single | multipage | souvenir_3d — сайт может пока игнорировать неизвестные */
  mode?: string;
};

/** URL сайтового редактора: /services/poligrafy/{slug}/{type}/order/editor?templateId= */
export function buildSitePoligrafyEditorUrl(params: SiteEditorOpenParams): string {
  const slug = String(params.productSlug || '').trim() || String(params.templateId || '0');
  const typeSeg = String(params.typeIdParam || '').trim() || '0';
  const q = new URLSearchParams();
  if (params.templateId != null && Number.isFinite(params.templateId) && params.templateId > 0) {
    q.set('templateId', String(params.templateId));
  }
  if (params.sizeId && params.sizeId.trim()) {
    q.set('sizeId', params.sizeId.trim());
  }
  if (params.mode && params.mode !== 'single') {
    q.set('mode', params.mode);
  }
  const qs = q.toString();
  return `${PUBLIC_SITE_BASE}/services/poligrafy/${encodeURIComponent(slug)}/${encodeURIComponent(typeSeg)}/order/editor${qs ? `?${qs}` : ''}`;
}

export function openSiteClientEditor(params: SiteEditorOpenParams): void {
  const url = buildSitePoligrafyEditorUrl(params);
  window.open(url, '_blank', 'noopener,noreferrer');
}
