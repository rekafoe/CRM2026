import type { Canvas, FabricObject } from 'fabric';
import { FABRIC_CUSTOM_PROPS } from '../constants';
import {
  applyDesignedTextLayoutToFabricJsonRecord,
  dehydrateTextObjectsInFabricJSON,
  isDesignedTemplateText,
  prepareTextObjectsInFabricJSON,
  readDesignedTextboxPersistedWidth,
} from '../textStyleRuns';
import { dehydrateEmptyPhotoFieldJsonObject, dehydrateEmptyPhotoFieldsInFabricJSON } from '../photoFieldEmpty';
import { resolvePhotoFieldFrameSize, resolvePhotoFieldFrameSceneTL } from '../photoFieldGeometry';
import { deduplicateFabricJsonObjectsById } from '../fabricSnapshotReconcile';
import { isTextLikeObject } from './canvasUtils';

const CUSTOM_PROPS = FABRIC_CUSTOM_PROPS;

function isPhotoFieldObject(obj: FabricObject): boolean {
  return (obj as { isPhotoField?: unknown }).isPhotoField === true;
}

function serializePhotoFieldFallback(obj: FabricObject): Record<string, unknown> {
  const meta = obj as {
    id?: unknown;
    photoFieldFilled?: unknown;
    photoFieldClientAdded?: unknown;
    importStackIndex?: unknown;
    angle?: number;
  };
  if (meta.photoFieldFilled === true) {
    throw new Error('filled photo field serialize fallback unavailable');
  }
  const { fw, fh } = resolvePhotoFieldFrameSize(obj);
  const tl = resolvePhotoFieldFrameSceneTL(obj);
  return dehydrateEmptyPhotoFieldJsonObject({
    type: 'rect',
    id: meta.id,
    left: tl.x,
    top: tl.y,
    width: fw,
    height: fh,
    photoFieldFw: fw,
    photoFieldFh: fh,
    angle: meta.angle ?? 0,
    isPhotoField: true,
    photoFieldFilled: false,
    photoFieldClientAdded: meta.photoFieldClientAdded === true,
    importStackIndex: meta.importStackIndex,
  });
}

function safeSerializeObject(obj: FabricObject): Record<string, unknown> | null {
  try {
    return obj.toObject(CUSTOM_PROPS) as Record<string, unknown>;
  } catch {
    if (isPhotoFieldObject(obj)) {
      try {
        return serializePhotoFieldFallback(obj);
      } catch {
        return null;
      }
    }
    if (isTextLikeObject(obj)) {
      try {
        return obj.toObject(CUSTOM_PROPS) as Record<string, unknown>;
      } catch {
        const fallback = obj as { text?: string; fontSize?: number; fontFamily?: string; id?: unknown };
        return {
          type: obj.type,
          text: fallback.text ?? '',
          left: obj.left,
          top: obj.top,
          fontSize: fallback.fontSize,
          fontFamily: fallback.fontFamily,
          fill: (obj as { fill?: unknown }).fill,
          id: fallback.id,
        };
      }
    }
    return null;
  }
}

function isSyntheticTemplatePreviewBackground(obj: Record<string, unknown>): boolean {
  return obj.isBackground === true && obj.backgroundFit === 'page';
}

function collectLiveDesignedTextWidths(canvas: Canvas): Map<string, number> {
  const out = new Map<string, number>();
  const visit = (objects: FabricObject[]) => {
    for (const obj of objects) {
      if (isTextLikeObject(obj) && isDesignedTemplateText(obj as never)) {
        const id = String((obj as { id?: unknown }).id ?? '').trim();
        const width = readDesignedTextboxPersistedWidth(obj as never);
        if (id && width != null) out.set(id, width);
      }
      const group = obj as { getObjects?: () => FabricObject[] };
      if (typeof group.getObjects === 'function') visit(group.getObjects());
    }
  };
  visit(canvas.getObjects());
  return out;
}

function walkFabricJsonApplyLiveDesignedTextWidths(
  objects: unknown[],
  liveById: Map<string, number>,
): void {
  for (const item of objects) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const id = String(record.id ?? '').trim();
    if (id && isDesignedTemplateText(record)) {
      const liveWidth = liveById.get(id);
      if (liveWidth != null) applyDesignedTextLayoutToFabricJsonRecord(record, liveWidth);
    }
    if (Array.isArray(record.objects)) {
      walkFabricJsonApplyLiveDesignedTextWidths(record.objects as unknown[], liveById);
    }
  }
}

function syncDesignedTextLayoutFromLiveCanvas(
  canvas: Canvas,
  json: Record<string, unknown>,
): void {
  const liveWidths = collectLiveDesignedTextWidths(canvas);
  if (liveWidths.size === 0 || !Array.isArray(json.objects)) return;
  walkFabricJsonApplyLiveDesignedTextWidths(json.objects as unknown[], liveWidths);
}

function stripSyntheticTemplatePreviewBackgrounds(json: Record<string, unknown>): void {
  if (!Array.isArray(json.objects)) return;
  json.objects = json.objects.filter((obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return true;
    return !isSyntheticTemplatePreviewBackground(obj as Record<string, unknown>);
  });
}

function isEphemeralBlobUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('blob:');
}

function isStablePersistableUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!v || v.startsWith('blob:')) return false;
  return (
    v.startsWith('http://')
    || v.startsWith('https://')
    || v.startsWith('data:')
    || v.startsWith('/')
  );
}

/**
 * Mobile safe-mode даунскейлит фото в blob: для отрисовки, но blob revoke’ится.
 * В page snapshot нельзя хранить blob — иначе после flip loadFromJSON даёт пустые поля.
 */
export function rewriteEphemeralPhotoFieldBlobSources(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(rewriteEphemeralPhotoFieldBlobSources);
    return;
  }
  const record = value as Record<string, unknown>;
  const originalSrc = typeof record.photoFieldOriginalSrc === 'string'
    ? record.photoFieldOriginalSrc.trim()
    : '';
  const previewSrc = typeof record.photoFieldPreviewSrc === 'string'
    ? record.photoFieldPreviewSrc.trim()
    : '';
  const stableSrc = isStablePersistableUrl(originalSrc)
    ? originalSrc
    : (isStablePersistableUrl(previewSrc) ? previewSrc : '');

  if (stableSrc) {
    let rewroteBlob = false;
    if (isEphemeralBlobUrl(record.photoFieldPreviewSrc)) {
      record.photoFieldPreviewSrc = stableSrc;
      rewroteBlob = true;
    }
    if (Array.isArray(record.objects)) {
      for (const child of record.objects) {
        if (!child || typeof child !== 'object' || Array.isArray(child)) continue;
        const image = child as Record<string, unknown>;
        if (isEphemeralBlobUrl(image.src)) {
          image.src = stableSrc;
          // Размеры были от blob-preview — иначе Fabric crop’ит левый верх full-res.
          delete image.width;
          delete image.height;
          delete image.cropX;
          delete image.cropY;
          rewroteBlob = true;
        }
      }
    }
    if (isEphemeralBlobUrl(record.src) && (record.isPhotoField === true || record.type === 'image')) {
      record.src = stableSrc;
      delete record.width;
      delete record.height;
      rewroteBlob = true;
    }
    if (rewroteBlob && record.isPhotoField === true) {
      delete record.photoFieldIntrinsicW;
      delete record.photoFieldIntrinsicH;
    }
  }

  for (const nested of Object.values(record)) {
    if (nested && typeof nested === 'object') {
      rewriteEphemeralPhotoFieldBlobSources(nested);
    }
  }
}

function serializeCanvasObjectsIndividually(canvas: Canvas): Record<string, unknown>[] {
  return (canvas.getObjects() as FabricObject[])
    .map((obj) => safeSerializeObject(obj))
    .filter((obj): obj is Record<string, unknown> => !!obj)
    .filter((obj) => !isSyntheticTemplatePreviewBackground(obj));
}

export function canvasToJSON(canvas: Canvas): Record<string, unknown> {
  let json: Record<string, unknown>;
  try {
    json = canvas.toObject(CUSTOM_PROPS) as Record<string, unknown>;
  } catch {
    const objects = serializeCanvasObjectsIndividually(canvas);
    json = {
      objects,
      backgroundColor: (canvas as unknown as { backgroundColor?: unknown }).backgroundColor,
    };
  }
  // Template preview background is derived data; persisting it in page snapshots
  // can produce stale/broken image state after page transitions.
  stripSyntheticTemplatePreviewBackgrounds(json);
  const serializedObjects = Array.isArray(json.objects) ? json.objects : [];
  const liveObjects = serializeCanvasObjectsIndividually(canvas);
  if (liveObjects.length > serializedObjects.length) {
    json = { ...json, objects: liveObjects };
  }
  if (Array.isArray(json.objects)) {
    json = {
      ...json,
      objects: deduplicateFabricJsonObjectsById(
        json.objects.filter(
          (obj): obj is Record<string, unknown> => !!obj && typeof obj === 'object' && !Array.isArray(obj),
        ),
      ),
    };
  }
  syncDesignedTextLayoutFromLiveCanvas(canvas, json);
  prepareTextObjectsInFabricJSON(json);
  dehydrateTextObjectsInFabricJSON(json);
  rewriteEphemeralPhotoFieldBlobSources(json);
  dehydrateEmptyPhotoFieldsInFabricJSON(json);
  return json;
}

export function parsePageLoadKey(
  key: string,
): { type: 'single'; index: number } | { type: 'spread'; left: number; right: number } | null {
  const m = key.match(/^single-(\d+)$/);
  if (m) return { type: 'single', index: parseInt(m[1], 10) };
  const s = key.match(/^spread-(\d+)-(\d+)$/);
  if (s) return { type: 'spread', left: parseInt(s[1], 10), right: parseInt(s[2], 10) };
  return null;
}
