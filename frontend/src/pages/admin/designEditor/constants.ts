import type { SidebarSection } from './types';
import type { IconName } from '../../../components/ui/AppIcon';
import type { DesignPage } from './types';

/** Пустая страница по умолчанию */
export const EMPTY_PAGE: DesignPage = { images: [], texts: [], photoFields: [] };

/** Масштаб: 1 мм = N пикселей на экране (для превью) */
export const MM_TO_PX = 96 / 25.4;

/** Отступ области страницы от края Stage (px) */
export const PAGE_OFFSET = 40;

/** Отступ безопасной зоны от линии обрезки (мм) */
export const SAFE_ZONE_MM = 5;

/** На узких экранах снижаем разрешение экспорта (мобильные) */
export const getExportPixelRatio = () =>
  typeof window !== 'undefined' && window.innerWidth <= 768 ? 1 : 2;

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

/** Пункты меню сайдбара */
export const SIDEBAR_ITEMS: { id: SidebarSection; label: string; icon: IconName }[] = [
  { id: 'photo', label: 'Фото', icon: 'image' },
  { id: 'text', label: 'Текст', icon: 'edit' },
  { id: 'templates', label: 'Шаблоны', icon: 'layers' },
  { id: 'background', label: 'Фон', icon: 'camera' },
  { id: 'collages', label: 'Коллажи', icon: 'scissors' },
  { id: 'stickers', label: 'Стикеры', icon: 'tag' },
  { id: 'cliparts', label: 'Клипарты', icon: 'puzzle' },
  { id: 'frames', label: 'Рамки', icon: 'box' },
];
