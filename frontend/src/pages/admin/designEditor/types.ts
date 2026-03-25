/** Данные одной страницы макета (Fabric.js JSON snapshot) */
export interface DesignPage {
  fabricJSON: Record<string, unknown>;
}

/** Свойства выбранного объекта на холсте (для тулбара / панелей) */
export interface SelectedObjProps {
  type: 'IText' | 'image' | 'rect' | 'circle' | 'line' | 'triangle' | 'photoField' | 'other';
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  underline?: boolean;
  textAlign?: string;
  /** Множитель межстрочного интервала (Fabric IText) */
  lineHeight?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  flipX?: boolean;
  flipY?: boolean;
  locked?: boolean;
}

/** Эффекты текста (панель сайдбара / модалка) */
export interface TextEffectsValues {
  opacity: number;
  stroke: string;
  strokeWidth: number;
  /** Мягкая тень (только для выделенного блока; в проект по JSON не дублируем сложную тень) */
  softShadow: boolean;
}

/** Фото в проекте, ещё не на макете (превью + файл — по клику ставится на страницу) */
export interface SidebarPhotoItem {
  id: string;
  name: string;
  previewUrl: string;
  file: File;
  addedAt: number;
}

/** Раздел сайдбара редактора */
export type SidebarSection =
  | 'photo'
  | 'text'
  | 'shapes'
  | 'object'
  | 'templates'
  | 'background'
  | 'collages'
  | 'stickers'
  | 'cliparts'
  | 'frames';

/** Сериализуемое состояние макета (заказ, spec шаблона) */
export interface DesignState {
  templateId: number | null;
  pageWidth: number;
  pageHeight: number;
  pageCount: number;
  pages: Array<{ fabricJSON: Record<string, unknown> }>;
  spread_mode?: boolean;
  cover_pages?: number;
}
