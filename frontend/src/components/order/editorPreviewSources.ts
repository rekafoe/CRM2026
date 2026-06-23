import { fetchOrderFileForPreview } from '../../api';
import type { OrderFile } from '../../types';

export type PagePreviewSource = {
  page: number;
  url: string;
};

export function extractFilenameFromEditorImageSrc(src: string): string | null {
  const raw = src.trim();
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return null;

  const withoutQuery = raw.split('?')[0] ?? raw;
  const uploadMatch = withoutQuery.match(/\/(?:api\/)?uploads\/([^/?#]+)$/i);
  if (uploadMatch?.[1]) return decodeURIComponent(uploadMatch[1]);

  if (!withoutQuery.includes('/') && !withoutQuery.includes('\\')) {
    return withoutQuery;
  }

  try {
    const pathname = new URL(withoutQuery, 'https://assets.local').pathname;
    const base = pathname.split('/').pop();
    return base ? decodeURIComponent(base) : null;
  } catch {
    const base = withoutQuery.split(/[/\\]/).pop();
    return base ? decodeURIComponent(base) : null;
  }
}

export function buildOrderFileByFilename(files: OrderFile[]): Map<string, OrderFile> {
  const map = new Map<string, OrderFile>();
  for (const file of files) {
    const filename = String(file.filename ?? '').trim();
    if (!filename) continue;
    map.set(filename, file);
    const base = filename.split(/[/\\]/).pop();
    if (base) map.set(base, file);
  }
  return map;
}

export function createOrderFileImageSrcResolver(
  orderId: number,
  files: OrderFile[],
  objectUrlsToRevoke: Set<string>,
): (src: string) => Promise<string | null> {
  const byFilename = buildOrderFileByFilename(files);
  const resolvedBySrc = new Map<string, string>();

  return async (src: string) => {
    const raw = src.trim();
    if (!raw) return null;
    if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
    if (resolvedBySrc.has(raw)) return resolvedBySrc.get(raw)!;

    const filename = extractFilenameFromEditorImageSrc(raw);
    const file = filename ? byFilename.get(filename) : undefined;
    if (!file?.id) return null;

    try {
      const blob = await fetchOrderFileForPreview(orderId, file.id);
      const objectUrl = URL.createObjectURL(blob);
      resolvedBySrc.set(raw, objectUrl);
      objectUrlsToRevoke.add(objectUrl);
      return objectUrl;
    } catch {
      return null;
    }
  };
}

export async function loadClientRenderedPagePreviews(
  orderId: number,
  orderItemId: number,
  files: OrderFile[],
  objectUrlsToRevoke: Set<string>,
): Promise<PagePreviewSource[] | null> {
  const rows = files
    .filter((file) => file.artifactType === 'client_rendered_page' && file.orderItemId === orderItemId)
    .sort((a, b) => {
      const partA = Number(a.partNumber ?? 0);
      const partB = Number(b.partNumber ?? 0);
      if (partA > 0 && partB > 0 && partA !== partB) return partA - partB;
      return a.id - b.id;
    });

  if (rows.length === 0) return null;

  const previews: PagePreviewSource[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const file = rows[index];
    try {
      const blob = await fetchOrderFileForPreview(orderId, file.id);
      const url = URL.createObjectURL(blob);
      objectUrlsToRevoke.add(url);
      previews.push({
        page: Number(file.partNumber) > 0 ? Number(file.partNumber) : index + 1,
        url,
      });
    } catch {
      return previews.length > 0 ? previews : null;
    }
  }

  return previews.length > 0 ? previews : null;
}

export function revokeEditorPreviewObjectUrls(objectUrlsToRevoke: Set<string>): void {
  for (const url of objectUrlsToRevoke) {
    URL.revokeObjectURL(url);
  }
  objectUrlsToRevoke.clear();
}
