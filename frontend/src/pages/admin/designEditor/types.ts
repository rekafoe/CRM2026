/** Элемент канваса: изображение */
export interface CanvasImage {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
}

/** Элемент канваса: текст */
export interface CanvasText {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize?: number;
  fontFamily?: string;
}

/** Данные одной страницы макета */
export interface DesignPage {
  images: CanvasImage[];
  texts: CanvasText[];
}

/** Раздел сайдбара редактора */
export type SidebarSection =
  | 'photo'
  | 'text'
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
  pages: Array<{
    images: Array<Pick<CanvasImage, 'id' | 'x' | 'y' | 'width' | 'height'>>;
    texts: Array<Pick<CanvasText, 'id' | 'x' | 'y' | 'text' | 'fontSize' | 'fontFamily'>>;
  }>;
}
