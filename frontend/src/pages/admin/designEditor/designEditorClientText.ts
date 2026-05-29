import { Textbox, type FabricObject } from 'fabric';
import { clientTextboxWidthInSafeZone } from './designEditorTextBounds';

type AnyObj = Record<string, unknown>;

function ax(obj: FabricObject): AnyObj {
  return obj as unknown as AnyObj;
}

export type CreateClientTextboxOpts = {
  text: string;
  pageWidthPx: number;
  pageHeightPx: number;
  safeZonePx: number;
  fontSize: number;
  fontWeight?: string | number;
  lineHeight?: number;
  fontFamily?: string;
  fill?: string;
  /** Центрировать блок в safe zone по вертикали/горизонтали */
  centerInSafeZone?: boolean;
};

/** Текст клиента — Textbox с переносом по ширине safe zone. */
export function createClientTextbox(opts: CreateClientTextboxOpts): FabricObject {
  const width = clientTextboxWidthInSafeZone(opts.pageWidthPx, opts.safeZonePx);
  const safeLeft = opts.safeZonePx;
  const safeTop = opts.safeZonePx;
  const safeHeight = Math.max(1, opts.pageHeightPx - opts.safeZonePx * 2);

  let left = safeLeft;
  let top = safeTop + Math.round(safeHeight * 0.35);

  if (opts.centerInSafeZone) {
    const estLines = Math.max(1, Math.ceil(opts.text.length / Math.max(8, width / (opts.fontSize * 0.52))));
    const estH = estLines * opts.fontSize * (opts.lineHeight ?? 1.2);
    left = safeLeft + Math.max(0, (opts.pageWidthPx - opts.safeZonePx * 2 - width) / 2);
    top = safeTop + Math.max(0, (safeHeight - estH) / 2);
  }

  const box = new Textbox(opts.text, {
    left,
    top,
    width,
    originX: 'left',
    originY: 'top',
    fontSize: opts.fontSize,
    fontWeight: opts.fontWeight ?? 'normal',
    lineHeight: opts.lineHeight ?? 1.2,
    fontFamily: opts.fontFamily ?? 'Arial',
    fill: opts.fill ?? '#111827',
    splitByGrapheme: false,
    objectCaching: false,
  });
  ax(box).textFieldClientAdded = true;
  return box;
}
