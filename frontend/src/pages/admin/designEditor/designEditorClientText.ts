import { Textbox, type FabricObject } from 'fabric';
import { clientTextboxWidthInSafeZone } from './designEditorTextBounds';

type AnyObj = Record<string, unknown>;

function ax(obj: FabricObject): AnyObj {
  return obj as unknown as AnyObj;
}

const TEXTBOX_MIN_WIDTH_PX = 120;
const TEXTBOX_MAX_INITIAL_WIDTH_PX = 460;
const TEXTBOX_COMFORT_WIDTH_RATIO = 0.58;
const TEXTBOX_MAX_INITIAL_WIDTH_RATIO = 0.82;

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

function resolveInitialTextboxWidth(opts: CreateClientTextboxOpts): number {
  const safeWidth = clientTextboxWidthInSafeZone(opts.pageWidthPx, opts.safeZonePx);
  const longestLineLength = Math.max(1, ...opts.text.split('\n').map((line) => line.length));
  const textWidth = Math.ceil(longestLineLength * opts.fontSize * 0.56 + opts.fontSize);
  const comfortableWidth = Math.round(safeWidth * TEXTBOX_COMFORT_WIDTH_RATIO);
  const maxInitialWidth = Math.min(
    safeWidth,
    TEXTBOX_MAX_INITIAL_WIDTH_PX,
    Math.round(safeWidth * TEXTBOX_MAX_INITIAL_WIDTH_RATIO),
  );

  return Math.max(
    Math.min(safeWidth, TEXTBOX_MIN_WIDTH_PX),
    Math.min(maxInitialWidth, Math.max(comfortableWidth, textWidth)),
  );
}

/** Текст клиента — компактный Textbox внутри safe zone, который можно растянуть углами. */
export function createClientTextbox(opts: CreateClientTextboxOpts): FabricObject {
  const width = resolveInitialTextboxWidth(opts);
  const safeWidth = clientTextboxWidthInSafeZone(opts.pageWidthPx, opts.safeZonePx);
  const safeLeft = opts.safeZonePx;
  const safeTop = opts.safeZonePx;
  const safeHeight = Math.max(1, opts.pageHeightPx - opts.safeZonePx * 2);

  let left = safeLeft + Math.max(0, (safeWidth - width) / 2);
  let top = safeTop + Math.round(safeHeight * 0.35);

  if (opts.centerInSafeZone) {
    const estLines = Math.max(1, Math.ceil(opts.text.length / Math.max(8, width / (opts.fontSize * 0.52))));
    const estH = estLines * opts.fontSize * (opts.lineHeight ?? 1.2);
    left = safeLeft + Math.max(0, (safeWidth - width) / 2);
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
    textAlign: 'center',
    splitByGrapheme: false,
    objectCaching: false,
  });
  ax(box).textFieldClientAdded = true;
  return box;
}
