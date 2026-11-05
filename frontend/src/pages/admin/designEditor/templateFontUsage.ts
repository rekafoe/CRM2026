import { isFabricTextObjectType } from './patchFabricTextObjects';
import { collectFontFamiliesFromTextField } from './textStyleRuns';

export interface TemplateFontUsage {
  family: string;
  objectCount: number;
  pages: number[];
}

interface UsageBucket {
  objectCount: number;
  pages: Set<number>;
}

function walkTextObjects(
  objects: unknown[],
  pageNo: number,
  acc: Map<string, UsageBucket>,
): void {
  for (const obj of objects) {
    if (!obj || typeof obj !== 'object') continue;
    const record = obj as Record<string, unknown>;
    if (isFabricTextObjectType(record.type)) {
      const families = new Set<string>();
      collectFontFamiliesFromTextField(record, families);
      for (const family of families) {
        const bucket = acc.get(family) ?? { objectCount: 0, pages: new Set<number>() };
        bucket.objectCount += 1;
        bucket.pages.add(pageNo);
        acc.set(family, bucket);
      }
    }
    if (Array.isArray(record.objects)) {
      walkTextObjects(record.objects, pageNo, acc);
    }
  }
}

/** Шрифты макета: сколько текстовых объектов и на каких страницах. Только чтение JSON. */
export function summarizeTemplateFontUsage(
  pages: Array<{ fabricJSON?: Record<string, unknown> | null }>,
): TemplateFontUsage[] {
  const acc = new Map<string, UsageBucket>();
  pages.forEach((page, index) => {
    const objects = page?.fabricJSON?.objects;
    if (Array.isArray(objects)) walkTextObjects(objects, index + 1, acc);
  });
  return [...acc.entries()]
    .map(([family, bucket]) => ({
      family,
      objectCount: bucket.objectCount,
      pages: [...bucket.pages].sort((a, b) => a - b),
    }))
    .sort((a, b) => a.family.localeCompare(b.family, 'ru'));
}

export function formatTemplateFontPages(pages: number[]): string {
  if (pages.length === 0) return '';
  const sorted = [...pages].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i += 1) {
    const next = sorted[i];
    if (next === prev + 1) {
      prev = next;
      continue;
    }
    parts.push(start === prev ? String(start) : `${start}–${prev}`);
    start = next;
    prev = next;
  }
  return `стр. ${parts.join(', ')}`;
}

export function formatTemplateFontObjectCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 === 1 && mod100 !== 11
    ? 'объект'
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? 'объекта'
      : 'объектов';
  return `${count} ${word}`;
}
