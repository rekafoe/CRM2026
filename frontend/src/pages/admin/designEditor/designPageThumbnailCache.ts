import type { DesignPage } from './types';

const STORAGE_PREFIX = 'crm-de-page-thumb:v1:';
const MAX_STORAGE_BYTES = 4_500_000;

export interface DesignPageThumbnailCacheScope {
  templateId: number;
  draftToken: string | null;
  pageWidthPx: number;
  pageHeightPx: number;
}

const memoryCache = new Map<string, string>();

export function pageContentFingerprint(page: DesignPage | undefined): string {
  const raw = JSON.stringify(page?.fabricJSON ?? {});
  let hash = 2_166_136_261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 1_677_761_9);
  }
  return `${raw.length}:${(hash >>> 0).toString(36)}`;
}

function scopePrefix(scope: DesignPageThumbnailCacheScope): string {
  const draft = scope.draftToken ?? 'template';
  return `${STORAGE_PREFIX}${scope.templateId}:${draft}:${scope.pageWidthPx}x${scope.pageHeightPx}:`;
}

export function buildPageThumbnailCacheKey(
  scope: DesignPageThumbnailCacheScope,
  pageIndex: number,
  page: DesignPage | undefined,
): string {
  return `${scopePrefix(scope)}${pageIndex}:${pageContentFingerprint(page)}`;
}

export function getCachedPageThumbnail(
  scope: DesignPageThumbnailCacheScope,
  pageIndex: number,
  page: DesignPage | undefined,
): string | null {
  const key = buildPageThumbnailCacheKey(scope, pageIndex, page);
  const fromMemory = memoryCache.get(key);
  if (fromMemory) return fromMemory;
  try {
    const fromStorage = sessionStorage.getItem(key);
    if (!fromStorage) return null;
    memoryCache.set(key, fromStorage);
    return fromStorage;
  } catch {
    return null;
  }
}

function estimateEntryBytes(key: string, value: string): number {
  return (key.length + value.length) * 2;
}

function pruneScopeStorage(scope: DesignPageThumbnailCacheScope): void {
  const prefix = scopePrefix(scope);
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    keys.forEach((key) => sessionStorage.removeItem(key));
    keys.forEach((key) => memoryCache.delete(key));
  } catch {
    /* ignore */
  }
}

function trimStorageIfNeeded(nextKey: string, nextValue: string): void {
  try {
    let total = estimateEntryBytes(nextKey, nextValue);
    const entries: { key: string; size: number }[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (!key?.startsWith(STORAGE_PREFIX)) continue;
      const value = sessionStorage.getItem(key) ?? '';
      const size = estimateEntryBytes(key, value);
      entries.push({ key, size });
      total += size;
    }
    if (total <= MAX_STORAGE_BYTES) return;
    entries.sort((a, b) => b.size - a.size);
    for (const entry of entries) {
      if (total <= MAX_STORAGE_BYTES * 0.85) break;
      sessionStorage.removeItem(entry.key);
      memoryCache.delete(entry.key);
      total -= entry.size;
    }
  } catch {
    /* ignore */
  }
}

export function rememberPageThumbnail(
  scope: DesignPageThumbnailCacheScope,
  pageIndex: number,
  page: DesignPage | undefined,
  dataUrl: string,
): void {
  const key = buildPageThumbnailCacheKey(scope, pageIndex, page);
  memoryCache.set(key, dataUrl);
  try {
    trimStorageIfNeeded(key, dataUrl);
    sessionStorage.setItem(key, dataUrl);
  } catch {
    try {
      pruneScopeStorage(scope);
      sessionStorage.setItem(key, dataUrl);
    } catch {
      /* sessionStorage недоступен или переполнен — остаётся memoryCache */
    }
  }
}

export function loadCachedThumbnailsForPages(
  scope: DesignPageThumbnailCacheScope,
  pages: DesignPage[],
  pageCount: number,
): Record<number, string> {
  const result: Record<number, string> = {};
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const cached = getCachedPageThumbnail(scope, pageIndex, pages[pageIndex]);
    if (cached) result[pageIndex] = cached;
  }
  return result;
}

export function clearThumbnailCacheForScope(scope: DesignPageThumbnailCacheScope): void {
  pruneScopeStorage(scope);
}

export function clearThumbnailCacheForPage(scope: DesignPageThumbnailCacheScope, pageIndex: number): void {
  const pagePrefix = `${scopePrefix(scope)}${pageIndex}:`;
  for (const key of Array.from(memoryCache.keys())) {
    if (key.startsWith(pagePrefix)) memoryCache.delete(key);
  }
  try {
    const storageKeys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(pagePrefix)) storageKeys.push(key);
    }
    storageKeys.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    /* ignore */
  }
}
