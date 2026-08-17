import { useEffect, useMemo, useState } from 'react';
import { getDesignAssets, getPublicDesignAssets, type DesignAsset, type DesignAssetKind } from '../api';

const cache = new Map<string, DesignAsset[]>();
const inflight = new Map<string, Promise<DesignAsset[]>>();

function cacheKey(kind?: DesignAssetKind): string {
  return kind || 'all';
}

async function loadDesignAssetsList(kind?: DesignAssetKind): Promise<DesignAsset[]> {
  const key = cacheKey(kind);
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;
  const request = (async () => {
    try {
      const res = await getDesignAssets(kind);
      return (Array.isArray(res.data) ? res.data : []).filter((asset) => asset.is_active);
    } catch {
      const res = await getPublicDesignAssets(kind);
      return Array.isArray(res.data) ? res.data : [];
    }
  })();
  inflight.set(key, request);
  try {
    const list = await request;
    cache.set(key, list);
    return list;
  } finally {
    inflight.delete(key);
  }
}

export function invalidateCrmDesignAssetsCache(): void {
  cache.clear();
  inflight.clear();
}

export function useCrmDesignAssets(kind?: DesignAssetKind) {
  const [assets, setAssets] = useState<DesignAsset[]>(cache.get(cacheKey(kind)) ?? []);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await loadDesignAssetsList(kind);
      if (cancelled) return;
      setAssets(list);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const categories = useMemo(
    () => [...new Set(assets.map((asset) => asset.category).filter((value): value is string => Boolean(value)))],
    [assets],
  );

  return { assets, categories, ready };
}
