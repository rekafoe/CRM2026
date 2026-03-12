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
  /** Масштаб после ресайза через Transformer */
  scaleX?: number;
  scaleY?: number;
}

/** Поле для фото: пустая область, в которую можно перетащить изображение */
export interface CanvasPhotoField {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** После дропа/выбора фото — URL изображения */
  src?: string;
}

/** Данные одной страницы макета */
export interface DesignPage {
  images: CanvasImage[];
  texts: CanvasText[];
  photoFields: CanvasPhotoField[];
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
    photoFields: Array<Pick<CanvasPhotoField, 'id' | 'x' | 'y' | 'width' | 'height'> & { src?: string }>;
  }>;
}
