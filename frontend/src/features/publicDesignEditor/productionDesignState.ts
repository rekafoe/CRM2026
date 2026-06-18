function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function replacePhotoFieldImageSources(value: unknown): void {
  if (!isRecord(value)) return;
  const originalSrc = typeof value.photoFieldOriginalSrc === 'string'
    ? value.photoFieldOriginalSrc.trim()
    : '';
  if (originalSrc && Array.isArray(value.objects)) {
    for (const child of value.objects) {
      if (!isRecord(child)) continue;
      if (child.type === 'image' || typeof child.src === 'string') {
        child.src = originalSrc;
      }
    }
    if (typeof value.photoFieldOriginalSize === 'number') {
      value.photoFieldFileSize = value.photoFieldOriginalSize;
    }
  }

  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      child.forEach(replacePhotoFieldImageSources);
    } else {
      replacePhotoFieldImageSources(child);
    }
  }
}

export function buildProductionDesignState<T>(designState: T): T {
  const production = cloneJson(designState);
  replacePhotoFieldImageSources(production);
  return production;
}
