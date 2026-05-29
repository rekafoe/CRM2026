import type { FabricObject } from 'fabric';
import type { IText } from 'fabric';
import { isTextLikeFabricObject } from './designEditorTextChrome';

type AnyObj = Record<string, unknown>;

function ax(obj: unknown): AnyObj {
  return obj as AnyObj;
}

function normScale(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v ?? 1);
  if (!Number.isFinite(n) || n === 0) return 1;
  return Math.abs(n);
}

export type TextScaleBakeDraft = {
  fieldId: string;
  fontSize: number;
  width?: number;
};

/** Размер после углового scale (до сброса Fabric на object:modified). */
export function captureTextScaleDraft(obj: FabricObject): TextScaleBakeDraft | null {
  if (!isTextLikeFabricObject(obj)) return null;
  const sx = normScale(obj.scaleX);
  const sy = normScale(obj.scaleY);
  const baseFs = Math.max(6, Math.round(Number(ax(obj).fontSize) || 24));
  const scaleFactor = Math.max(sx, sy);
  const fontSize = Math.max(6, Math.min(200, Math.round(baseFs * scaleFactor)));
  const draft: TextScaleBakeDraft = {
    fieldId: String(ax(obj).id ?? '').trim(),
    fontSize,
  };
  if (obj.type === 'textbox') {
    const baseW = Math.max(20, Number(obj.width) || 120);
    draft.width = Math.max(40, Math.round(baseW * sx));
  }
  return draft;
}

/** Запекает scaleX/scaleY в fontSize (и width у textbox). */
export function bakeTextObjectScaleInPlace(
  obj: FabricObject,
  draft?: TextScaleBakeDraft | null,
): boolean {
  if (!isTextLikeFabricObject(obj)) return false;

  const sx = normScale(obj.scaleX);
  const sy = normScale(obj.scaleY);
  const hasScale = sx > 1.004 || sy > 1.004;
  if (!hasScale && !draft) return false;

  const text = obj as IText;
  const baseFs = Math.max(6, Math.round(Number(ax(text).fontSize) || 24));
  const scaleFactor = Math.max(sx, sy);
  const nextFontSize = draft?.fontSize
    ?? Math.max(6, Math.min(200, Math.round(baseFs * scaleFactor)));

  const patch: Record<string, unknown> = {
    fontSize: nextFontSize,
    scaleX: 1,
    scaleY: 1,
  };

  const nextWidth =
    text.type === 'textbox'
      ? (draft?.width ?? Math.max(40, Math.round((Math.max(20, Number(text.width) || 120)) * sx)))
      : undefined;

  const fontUnchanged = Math.abs(baseFs - nextFontSize) < 0.5;
  const widthUnchanged =
    text.type !== 'textbox'
    || Math.abs((Number(text.width) || 0) - (nextWidth ?? 0)) < 1;
  if (fontUnchanged && widthUnchanged && !hasScale && !draft) {
    return false;
  }

  if (nextWidth != null) {
    patch.width = nextWidth;
  }

  text.set(patch as Parameters<typeof text.set>[0]);
  text.setCoords();
  return true;
}
