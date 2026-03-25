import type { SelectedObjProps } from './types';

export const TEXT_PRESET_STYLE = [
  { id: 'normal', label: 'Обычный', fontWeight: 'normal' as const, fontStyle: 'normal' as const },
  { id: 'bold', label: 'Жирный', fontWeight: 'bold' as const, fontStyle: 'normal' as const },
  { id: 'italic', label: 'Курсив', fontWeight: 'normal' as const, fontStyle: 'italic' as const },
  { id: 'boldItalic', label: 'Жирный курсив', fontWeight: 'bold' as const, fontStyle: 'italic' as const },
] as const;

export function textPresetIdFromSelection(o: SelectedObjProps): string {
  const w = o.fontWeight === 'bold' ? 'bold' : 'normal';
  const s = o.fontStyle === 'italic' ? 'italic' : 'normal';
  const p = TEXT_PRESET_STYLE.find((x) => x.fontWeight === w && x.fontStyle === s);
  return p?.id ?? 'normal';
}
