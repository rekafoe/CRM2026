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
  templateId: number;
  /** single | multipage | souvenir_3d — сайт может пока игнорировать неизвестные */
  mode?: string;
};

/** URL сайтового редактора: /services/poligrafy/{slug}/{type}/order/editor?templateId= */
export function buildSitePoligrafyEditorUrl(params: SiteEditorOpenParams): string {
  const slug = String(params.productSlug || '').trim() || String(params.templateId);
  const typeSeg = String(params.typeIdParam || '').trim() || '0';
  const q = new URLSearchParams({
    templateId: String(params.templateId),
  });
  if (params.mode && params.mode !== 'single') {
    q.set('mode', params.mode);
  }
  return `${PUBLIC_SITE_BASE}/services/poligrafy/${encodeURIComponent(slug)}/${encodeURIComponent(typeSeg)}/order/editor?${q.toString()}`;
}

export function openSiteClientEditor(params: SiteEditorOpenParams): void {
  const url = buildSitePoligrafyEditorUrl(params);
  window.open(url, '_blank', 'noopener,noreferrer');
}
