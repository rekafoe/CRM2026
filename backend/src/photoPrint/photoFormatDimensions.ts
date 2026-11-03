/**
 * Размеры печати из подписи формата (калькулятор / CRM / статический справочник).
 * Примеры: "21×30 см", "8.5×10.8 см (стандарт)", "89×108 мм".
 */

/** Убирает пояснения в скобках — иначе «мм» в «(50×70 мм)» ломает парсинг всей строки. */
export function stripParentheticalFormatNotes(label: string): string {
  return label.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Предпочитает основную часть подписи: «5×7 см» из «5×7 см (50×70 мм)».
 */
export function parsePrintFormatCmDimensionsPreferMainCm(label: string): { w: number; h: number } | null {
  const stripped = stripParentheticalFormatNotes(label);
  if (stripped.length > 0) {
    const fromMain = parsePrintFormatCmDimensions(stripped);
    if (fromMain) return fromMain;
  }
  return parsePrintFormatCmDimensions(label);
}

export function parsePrintFormatCmDimensions(label: string): { w: number; h: number } | null {
  if (!label || typeof label !== 'string') return null;
  const hasMm = /мм/i.test(label);
  const normalized = label.replace(/мм/g, '').replace(/см/g, '').trim();
  // × U+00D7, лат. x/X, кирил. х/Х, «на», звёздочка
  const m = normalized.match(
    /(\d+(?:[.,]\d+)?)\s*(?:[×xXхХ*]|\s+на\s+)\s*(\d+(?:[.,]\d+)?)/i
  );
  if (!m) return null;
  const w = parseFloat(m[1].replace(',', '.'));
  const h = parseFloat(m[2].replace(',', '.'));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  if (hasMm) {
    return { w: w / 10, h: h / 10 };
  }
  return { w, h };
}

export type PhotoAspectOption = {
  label: string;
  value: number;
  description: string;
};

/**
 * Строит вариант для редактора: подпись как в заказе, value = ширина/высота в см.
 */
export function aspectRatioOptionFromCmFormatLabel(
  displayLabel: string,
  dimensionSourceLabel?: string
): PhotoAspectOption | null {
  const source = (dimensionSourceLabel ?? displayLabel).replace(/\s*с белыми полями\s*/gi, '').trim();
  const dims = parsePrintFormatCmDimensions(source);
  if (!dims) return null;
  return {
    label: displayLabel.trim(),
    value: dims.w / dims.h,
    description: 'Размер из параметров заказа',
  };
}

/** Две подписи задают один физический размер (10x15 vs 10×15 см и т.д.) */
export function printFormatLabelsSameSize(a: string, b: string): boolean {
  const sa = a.replace(/\s*с белыми полями\s*/gi, '').trim();
  const sb = b.replace(/\s*с белыми полями\s*/gi, '').trim();
  if (sa === sb) return true;
  const da = parsePrintFormatCmDimensions(sa);
  const db = parsePrintFormatCmDimensions(sb);
  if (!da || !db) return false;
  const eps = 1e-4;
  return Math.abs(da.w - db.w) < eps && Math.abs(da.h - db.h) < eps;
}

export type PhotoTrimMode = 'crop' | 'fit' | 'artistic';

export type PrintFormatMm = {
  widthMm: number;
  heightMm: number;
};

function normalizeMm(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function validMm(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Физический trim в мм. Числовые поля CRM имеют приоритет над подписью. */
export function resolvePrintFormatMm(input: {
  printSize?: string;
  trimWidthMm?: number;
  trimHeightMm?: number;
}): PrintFormatMm | null {
  if (validMm(input.trimWidthMm) && validMm(input.trimHeightMm)) {
    return {
      widthMm: normalizeMm(input.trimWidthMm),
      heightMm: normalizeMm(input.trimHeightMm),
    };
  }
  const parsed = parsePrintFormatCmDimensionsPreferMainCm(
    String(input.printSize ?? '').replace(/\s*с белыми полями\s*/gi, '').trim()
  );
  if (!parsed) return null;
  return {
    widthMm: normalizeMm(parsed.w * 10),
    heightMm: normalizeMm(parsed.h * 10),
  };
}

function mmKeyPart(value: number): string {
  return normalizeMm(value).toFixed(3).replace(/\.?0+$/, '');
}

/** Ориентация не входит в ключ: готовый отпечаток можно целиком повернуть на листе. */
export function canonicalPhysicalSizeKey(size: PrintFormatMm): string {
  const min = Math.min(size.widthMm, size.heightMm);
  const max = Math.max(size.widthMm, size.heightMm);
  return `${mmKeyPart(min)}x${mmKeyPart(max)}mm`;
}

export function physicalSizeFilenamePart(size: PrintFormatMm): string {
  const min = Math.min(size.widthMm, size.heightMm);
  const max = Math.max(size.widthMm, size.heightMm);
  const bothWholeCm =
    Math.abs(min / 10 - Math.round(min / 10)) < 1e-6 &&
    Math.abs(max / 10 - Math.round(max / 10)) < 1e-6;
  if (bothWholeCm) {
    return `${mmKeyPart(min / 10)}x${mmKeyPart(max / 10)}_cm`;
  }
  return `${mmKeyPart(min)}x${mmKeyPart(max)}_mm`;
}

function orientedAspectFromSides(
  width: number,
  height: number,
  cropMode: 'horizontal' | 'vertical'
): number | undefined {
  const min = Math.min(width, height);
  const max = Math.max(width, height);
  if (!(min > 0) || !(max > 0)) return undefined;
  return cropMode === 'horizontal' ? max / min : min / max;
}

export function orientedPrintSidesMm(input: {
  printSize?: string;
  cropMode: 'horizontal' | 'vertical';
}): { widthMm: number; heightMm: number } | null {
  const physical = resolvePrintFormatMm({ printSize: input.printSize });
  if (!physical) return null;
  const min = Math.min(physical.widthMm, physical.heightMm);
  const max = Math.max(physical.widthMm, physical.heightMm);
  if (!(min > 0) || !(max > 0)) return null;
  return input.cropMode === 'horizontal'
    ? { widthMm: max, heightMm: min }
    : { widthMm: min, heightMm: max };
}

export function artisticMatteInsetPercent(input: {
  printSize?: string;
  cropMode: 'horizontal' | 'vertical';
  marginMm?: number;
}): { xPercent: number; yPercent: number } | null {
  const sides = orientedPrintSidesMm(input);
  const marginMm = input.marginMm ?? 5;
  if (!sides || sides.widthMm <= marginMm * 2 || sides.heightMm <= marginMm * 2) {
    return null;
  }
  return {
    xPercent: (marginMm / sides.widthMm) * 100,
    yPercent: (marginMm / sides.heightMm) * 100,
  };
}

/**
 * Соотношение сторон готового отпечатка: альбом = длинная/короткая, книжка = короткая/длинная.
 * Для 10×15 это 1.5 (15×10) или 2/3 (10×15), без растягивания рамки превью под фото.
 */
export function orientedPrintAspectRatio(input: {
  printSize?: string;
  cropMode: 'horizontal' | 'vertical';
  fallbackValue?: number;
}): number | undefined {
  const sides = orientedPrintSidesMm(input);
  if (sides) {
    return sides.widthMm / sides.heightMm;
  }
  const value = input.fallbackValue;
  if (value == null || !Number.isFinite(value) || value <= 0) return undefined;
  return orientedAspectFromSides(value, 1, input.cropMode);
}

/** Внутреннее окно кропа для художественной рамки 5 мм. */
export function artisticInnerCropAspectRatio(input: {
  printSize?: string;
  cropMode: 'horizontal' | 'vertical';
  marginMm?: number;
  fallbackValue?: number;
}): number | undefined {
  const physical = resolvePrintFormatMm({ printSize: input.printSize });
  const marginMm = input.marginMm ?? 5;
  if (physical) {
    const min = Math.min(physical.widthMm, physical.heightMm);
    const max = Math.max(physical.widthMm, physical.heightMm);
    const widthMm = input.cropMode === 'horizontal' ? max : min;
    const heightMm = input.cropMode === 'horizontal' ? min : max;
    if (widthMm > marginMm * 2 && heightMm > marginMm * 2) {
      return (widthMm - marginMm * 2) / (heightMm - marginMm * 2);
    }
  }
  return orientedPrintAspectRatio(input);
}

export function resolvePhotoTrimMode(input: {
  trimMode?: unknown;
  withWhiteBorders?: unknown;
  printSize?: unknown;
}): PhotoTrimMode {
  if (input.trimMode === 'crop' || input.trimMode === 'fit' || input.trimMode === 'artistic') {
    return input.trimMode;
  }
  const printSizeLabel =
    typeof input.printSize === 'string'
      ? input.printSize
      : input.printSize &&
          typeof input.printSize === 'object' &&
          'label' in input.printSize &&
          typeof (input.printSize as { label?: unknown }).label === 'string'
        ? String((input.printSize as { label: string }).label)
        : '';
  if (
    input.withWhiteBorders === true ||
    /с\s+белыми\s+полями|white\s+borders?/i.test(printSizeLabel)
  ) {
    return 'fit';
  }
  return 'crop';
}
