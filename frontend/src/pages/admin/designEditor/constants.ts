import type { SidebarSection } from './types';
import type { IconName } from '../../../components/ui/AppIcon';
import type { DesignPage } from './types';

/** Пустая страница по умолчанию */
export const EMPTY_PAGE: DesignPage = { fabricJSON: {} };

/** Масштаб: 1 мм = N пикселей на экране (для превью) */
export const MM_TO_PX = 96 / 25.4;

/** Безопасная зона от линии обрезки (мм) */
export const SAFE_ZONE_MM = 5;

/** Множитель экспорта для PNG (2x = retina) */
export const getExportPixelRatio = () =>
  typeof window !== 'undefined' && window.innerWidth <= 768 ? 1 : 2;

/** Пресеты при добавлении текста с сайдбара */
export const TEXT_BLOCK_PRESETS = {
  heading: {
    label: 'Заголовок',
    defaultText: 'Заголовок',
    fontSize: 46,
    fontWeight: 'bold' as const,
    lineHeight: 1.12,
  },
  subtitle: {
    label: 'Подзаголовок',
    defaultText: 'Подзаголовок',
    fontSize: 30,
    fontWeight: 'bold' as const,
    lineHeight: 1.2,
  },
  body: {
    label: 'Обычный текст',
    defaultText: 'Текст',
    fontSize: 18,
    fontWeight: 'normal' as const,
    lineHeight: 1.45,
  },
} as const;

export type TextBlockPresetKind = keyof typeof TEXT_BLOCK_PRESETS;

/** Шрифты для текстовых блоков */
export const TEXT_FONTS: { value: string; label: string }[] = [
  { value: 'Arial', label: 'Arial' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Verdana', label: 'Verdana' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'PT Sans', label: 'PT Sans' },
  { value: 'PT Serif', label: 'PT Serif' },
];

/** Кастомные свойства Fabric-объектов, которые сохраняются в JSON */
export const FABRIC_CUSTOM_PROPS = ['id', 'isBackground', 'isPhotoField', 'locked'];

/** Пункты меню сайдбара */
export const SIDEBAR_ITEMS: { id: SidebarSection; label: string; icon: IconName }[] = [
  { id: 'photo', label: 'Фото', icon: 'image' },
  { id: 'text', label: 'Текст', icon: 'edit' },
  { id: 'shapes', label: 'Фигуры', icon: 'box' },
  { id: 'object', label: 'Объект', icon: 'layers' },
  { id: 'background', label: 'Фон', icon: 'camera' },
  { id: 'collages', label: 'Коллажи', icon: 'scissors' },
  { id: 'stickers', label: 'Стикеры', icon: 'tag' },
  { id: 'cliparts', label: 'Клипарты', icon: 'puzzle' },
  { id: 'frames', label: 'Рамки', icon: 'box' },
];
