import type { Canvas, FabricObject } from 'fabric';
import { FABRIC_CUSTOM_PROPS } from '../constants';
import { dehydrateTextObjectsInFabricJSON } from '../textStyleRuns';

const CUSTOM_PROPS = FABRIC_CUSTOM_PROPS;

function safeSerializeObject(obj: FabricObject): Record<string, unknown> | null {
  try {
    return obj.toObject(CUSTOM_PROPS) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function canvasToJSON(canvas: Canvas): Record<string, unknown> {
  let json: Record<string, unknown>;
  try {
    json = canvas.toObject(CUSTOM_PROPS) as Record<string, unknown>;
  } catch {
    const objects = (canvas.getObjects() as FabricObject[])
      .map((obj) => safeSerializeObject(obj))
      .filter((obj): obj is Record<string, unknown> => !!obj);
    json = {
      objects,
      backgroundColor: (canvas as unknown as { backgroundColor?: unknown }).backgroundColor,
    };
  }
  dehydrateTextObjectsInFabricJSON(json);
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
