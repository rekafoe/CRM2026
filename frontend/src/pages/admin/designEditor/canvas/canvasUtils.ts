import type { FabricObject } from 'fabric';
import { isTextLikeFabricObject } from '../designEditorTextChrome';

export type AnyObj = Record<string, unknown>;

export type FabricDragTransform = {
  offsetX?: number;
  offsetY?: number;
};

export const KEYBOARD_NUDGE_FAST_MULTIPLIER = 10;
export const CLIPBOARD_PASTE_OFFSET_PX = 16;

export function asAny(obj: unknown): AnyObj {
  return obj as unknown as AnyObj;
}

export function isTextLikeObject(obj: FabricObject): boolean {
  return isTextLikeFabricObject(obj);
}
