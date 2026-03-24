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
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

/** Раздел сайдбара редактора */
export type SidebarSection =
  | 'photo'
  | 'text'
  | 'shapes'
  | 'templates'
  | 'background'
  | 'collages'
  | 'stickers'
  | 'cliparts'
  | 'frames';

/** Сериализуемое состояние макета (для сохранения в заказ) */
export interface DesignState {
  templateId: number | null;
  pageWidth: number;
  pageHeight: number;
  pageCount: number;
  pages: Array<{ fabricJSON: Record<string, unknown> }>;
}
