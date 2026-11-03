import { cssFontWeightToken } from '../../../utils/fontFileMetadata';

export const TEXT_PRESET_STYLE = [
  { id: 'normal', label: 'Обычный', fontWeight: 'normal' as const, fontStyle: 'normal' as const },
  { id: 'bold', label: 'Жирный', fontWeight: 'bold' as const, fontStyle: 'normal' as const },
  { id: 'italic', label: 'Курсив', fontWeight: 'normal' as const, fontStyle: 'italic' as const },
  { id: 'boldItalic', label: 'Жирный курсив', fontWeight: 'bold' as const, fontStyle: 'italic' as const },
] as const;

const LIGHT_WEIGHT_LABELS: Record<string, string> = {
  '100': 'Тонкое',
  '200': 'Сверхсветлое',
  '300': 'Светлое',
  '500': 'Среднее',
};

export function isBoldFontWeight(weight: unknown): boolean {
  return Number(cssFontWeightToken(weight)) >= 600;
}

export function textPresetIdFromSelection(o: { fontWeight?: unknown; fontStyle?: unknown }): string {
  const weight = cssFontWeightToken(o.fontWeight);
  const italic = o.fontStyle === 'italic';
  if (Number(weight) >= 600 && italic) return 'boldItalic';
  if (Number(weight) >= 600) return 'bold';
  if (italic && weight === '400') return 'italic';
  if (weight === '400') return 'normal';
  return `w${weight}${italic ? 'i' : ''}`;
}

export function fontVariantSelectOption(
  weight: unknown,
  style: unknown,
): { id: string; label: string; fontWeight: string; fontStyle: string } | null {
  const id = textPresetIdFromSelection({ fontWeight: weight, fontStyle: style });
  if (TEXT_PRESET_STYLE.some((preset) => preset.id === id)) return null;
  const token = cssFontWeightToken(weight);
  const base = LIGHT_WEIGHT_LABELS[token];
  if (!base) return null;
  const italic = style === 'italic';
  return {
    id,
    label: italic ? `${base} курсив` : base,
    fontWeight: token,
    fontStyle: italic ? 'italic' : 'normal',
  };
}
