import {
  clip,
  degrees,
  endPath,
  PDFDocument,
  PDFImage,
  PDFPage,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
} from 'pdf-lib';
import { embedMockupRasterInPdf } from './photoSra3PdfResolution';
import {
  layoutPhotoItemsOnSra3Grid,
  PHOTO_BLEED_MM,
  type PhotoLayoutItem,
  type PhotoPlacement,
  type PhotoSra3GridPage,
} from './photoSra3Grid';
import {
  resolvePhotoTrimMode,
  resolvePrintFormatMm,
  type PhotoTrimMode,
} from './photoFormatDimensions';

type PhotoOrderItem = {
  id?: string;
  mockupId?: string;
  bleedMockupId?: string;
  printSize?: string;
  trimWidthMm?: number;
  trimHeightMm?: number;
  quantity?: number;
  trimMode?: PhotoTrimMode;
  artisticMarginMm?: number;
  withWhiteBorders?: boolean;
};

type PhotoOrder = {
  orderType?: string;
  photoType?: string;
  items?: PhotoOrderItem[];
};

type PreparedPhoto = PhotoLayoutItem & {
  image: PDFImage;
  imageWidth: number;
  imageHeight: number;
  bleedImage?: PDFImage;
  bleedImageWidth?: number;
  bleedImageHeight?: number;
  trimMode: PhotoTrimMode;
  artisticMarginMm?: number;
};

export type PhotoSra3PdfV2Options = {
  signal?: AbortSignal;
  resolveMockupImage?: (mockupId: string, signal?: AbortSignal) => Promise<Blob | null>;
  rasterEmbed?: 'browser' | 'node';
};

type PdfBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const MM_TO_PT = 72 / 25.4;
const WHITE = rgb(1, 1, 1);
const ASPECT_EPSILON = 0.002;

export type FitBleedEdges = {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
};

export function resolveFitBleedEdges(input: {
  imageWidth: number;
  imageHeight: number;
  trimWidth: number;
  trimHeight: number;
}): FitBleedEdges {
  const imageIsLandscape = input.imageWidth >= input.imageHeight;
  const trimIsLandscape = input.trimWidth >= input.trimHeight;
  const orientedWidth = imageIsLandscape === trimIsLandscape ? input.imageWidth : input.imageHeight;
  const orientedHeight = imageIsLandscape === trimIsLandscape ? input.imageHeight : input.imageWidth;
  const sourceAspect = orientedWidth / orientedHeight;
  const trimAspect = input.trimWidth / input.trimHeight;
  if (Math.abs(sourceAspect - trimAspect) <= ASPECT_EPSILON) {
    return { left: true, right: true, top: true, bottom: true };
  }
  if (sourceAspect > trimAspect) {
    return { left: true, right: true, top: false, bottom: false };
  }
  return { left: false, right: false, top: true, bottom: true };
}

function missingPhotosError(
  loadedCount: number,
  expectedCount: number,
  missingIds: string[]
): Error {
  const uniqueIds = [...new Set(missingIds)].slice(0, 10);
  const suffix = uniqueIds.length > 0 ? ` Не загружены mockupId: ${uniqueIds.join(', ')}` : '';
  return new Error(
    `Не удалось загрузить все фото для SRA3 PDF: загружено ${loadedCount} из ${expectedCount}.${suffix}`
  );
}

function withClip(page: PDFPage, box: PdfBox, draw: () => void): void {
  page.pushOperators(
    pushGraphicsState(),
    rectangle(box.x, box.y, box.width, box.height),
    clip(),
    endPath()
  );
  draw();
  page.pushOperators(popGraphicsState());
}

function orientedImageSize(
  imageWidth: number,
  imageHeight: number,
  box: PdfBox
): { width: number; height: number; rotate: boolean } {
  const imageIsLandscape = imageWidth >= imageHeight;
  const boxIsLandscape = box.width >= box.height;
  const rotate = imageIsLandscape !== boxIsLandscape;
  return rotate
    ? { width: imageHeight, height: imageWidth, rotate }
    : { width: imageWidth, height: imageHeight, rotate };
}

function drawImageFitted(
  page: PDFPage,
  image: PDFImage,
  imageWidth: number,
  imageHeight: number,
  box: PdfBox,
  mode: 'cover' | 'contain'
): void {
  const oriented = orientedImageSize(imageWidth, imageHeight, box);
  const scale =
    mode === 'cover'
      ? Math.max(box.width / oriented.width, box.height / oriented.height)
      : Math.min(box.width / oriented.width, box.height / oriented.height);
  const originalDrawWidth = imageWidth * scale;
  const originalDrawHeight = imageHeight * scale;

  if (!oriented.rotate) {
    page.drawImage(image, {
      x: box.x + (box.width - originalDrawWidth) / 2,
      y: box.y + (box.height - originalDrawHeight) / 2,
      width: originalDrawWidth,
      height: originalDrawHeight,
    });
    return;
  }

  const rotatedDrawWidth = originalDrawHeight;
  const rotatedDrawHeight = originalDrawWidth;
  page.drawImage(image, {
    x: box.x + (box.width - rotatedDrawWidth) / 2 + originalDrawHeight,
    y: box.y + (box.height - rotatedDrawHeight) / 2,
    width: originalDrawWidth,
    height: originalDrawHeight,
    rotate: degrees(90),
  });
}

function placementTrimBox(
  placement: PhotoPlacement<PreparedPhoto>,
  sheetHeightMm: number
): PdfBox {
  return {
    x: placement.xMm * MM_TO_PT,
    y: (sheetHeightMm - placement.yMm - placement.heightMm) * MM_TO_PT,
    width: placement.widthMm * MM_TO_PT,
    height: placement.heightMm * MM_TO_PT,
  };
}

function expandBox(box: PdfBox, amount: number): PdfBox {
  return {
    x: box.x - amount,
    y: box.y - amount,
    width: box.width + amount * 2,
    height: box.height + amount * 2,
  };
}

function drawWhiteCell(page: PDFPage, bleedBox: PdfBox): void {
  page.drawRectangle({ ...bleedBox, color: WHITE });
}

function drawFitSelectiveBleed(
  page: PDFPage,
  photo: PreparedPhoto,
  trimBox: PdfBox,
  bleedBox: PdfBox,
  bleedPt: number
): void {
  if (!photo.bleedImage || !photo.bleedImageWidth || !photo.bleedImageHeight) return;

  const edges = resolveFitBleedEdges({
    imageWidth: photo.bleedImageWidth,
    imageHeight: photo.bleedImageHeight,
    trimWidth: trimBox.width,
    trimHeight: trimBox.height,
  });
  const drawBleedImage = () =>
    drawImageFitted(
      page,
      photo.bleedImage as PDFImage,
      photo.bleedImageWidth as number,
      photo.bleedImageHeight as number,
      bleedBox,
      'cover'
    );

  if (edges.left && edges.right && edges.top && edges.bottom) {
    withClip(page, bleedBox, drawBleedImage);
    return;
  }

  if (edges.left && edges.right) {
    // contain касается левого/правого края; верхний/нижний bleed остаётся белым.
    withClip(
      page,
      { x: bleedBox.x, y: trimBox.y, width: bleedPt, height: trimBox.height },
      drawBleedImage
    );
    withClip(
      page,
      {
        x: trimBox.x + trimBox.width,
        y: trimBox.y,
        width: bleedPt,
        height: trimBox.height,
      },
      drawBleedImage
    );
    return;
  }

  // contain касается верхнего/нижнего края; боковой bleed остаётся белым.
  withClip(
    page,
    { x: trimBox.x, y: bleedBox.y, width: trimBox.width, height: bleedPt },
    drawBleedImage
  );
  withClip(
    page,
    {
      x: trimBox.x,
      y: trimBox.y + trimBox.height,
      width: trimBox.width,
      height: bleedPt,
    },
    drawBleedImage
  );
}

function drawPreparedPhoto(
  page: PDFPage,
  placement: PhotoPlacement<PreparedPhoto>,
  sheetHeightMm: number
): void {
  const trimBox = placementTrimBox(placement, sheetHeightMm);
  const bleedPt = PHOTO_BLEED_MM * MM_TO_PT;
  const bleedBox = expandBox(trimBox, bleedPt);
  drawWhiteCell(page, bleedBox);
  const photo = placement.item;
  if (!photo || placement.isBlank) return;

  if (photo.trimMode === 'crop') {
    withClip(page, bleedBox, () =>
      drawImageFitted(
        page,
        photo.image,
        photo.imageWidth,
        photo.imageHeight,
        bleedBox,
        'cover'
      )
    );
    return;
  }

  if (photo.trimMode === 'fit') {
    drawFitSelectiveBleed(page, photo, trimBox, bleedBox, bleedPt);
  }

  // fit и artistic приходят как готовый composite точного trim-размера.
  withClip(page, trimBox, () =>
    drawImageFitted(
      page,
      photo.image,
      photo.imageWidth,
      photo.imageHeight,
      trimBox,
      'contain'
    )
  );
}

function drawExternalCropMarks(
  page: PDFPage,
  gridPage: PhotoSra3GridPage<PreparedPhoto>
): void {
  const placements = gridPage.placements;
  if (placements.length === 0) return;
  const sheetWidth = gridPage.config.sheetWidthMm * MM_TO_PT;
  const sheetHeight = gridPage.config.sheetHeightMm * MM_TO_PT;
  const markLength = 4 * MM_TO_PT;
  const markGap = 0.5 * MM_TO_PT;
  const minX = Math.min(...placements.map((placement) => placement.xMm)) * MM_TO_PT;
  const maxX =
    Math.max(...placements.map((placement) => placement.xMm + placement.widthMm)) *
    MM_TO_PT;
  const minTopMm = Math.min(...placements.map((placement) => placement.yMm));
  const maxBottomMm = Math.max(
    ...placements.map((placement) => placement.yMm + placement.heightMm)
  );
  const topY = (gridPage.config.sheetHeightMm - minTopMm) * MM_TO_PT;
  const bottomY = (gridPage.config.sheetHeightMm - maxBottomMm) * MM_TO_PT;
  const verticalCuts = new Set<number>();
  const horizontalCuts = new Set<number>();
  for (const placement of placements) {
    verticalCuts.add(Number(placement.xMm.toFixed(3)));
    verticalCuts.add(Number((placement.xMm + placement.widthMm).toFixed(3)));
    horizontalCuts.add(Number(placement.yMm.toFixed(3)));
    horizontalCuts.add(Number((placement.yMm + placement.heightMm).toFixed(3)));
  }

  const line = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const clampX = (x: number) => Math.max(0, Math.min(sheetWidth, x));
    const clampY = (y: number) => Math.max(0, Math.min(sheetHeight, y));
    page.drawLine({
      start: { x: clampX(start.x), y: clampY(start.y) },
      end: { x: clampX(end.x), y: clampY(end.y) },
      thickness: 0.3,
      color: rgb(0, 0, 0),
    });
  };

  for (const cutMm of verticalCuts) {
    const x = cutMm * MM_TO_PT;
    line({ x, y: bottomY - markGap - markLength }, { x, y: bottomY - markGap });
    line({ x, y: topY + markGap }, { x, y: topY + markGap + markLength });
  }
  for (const cutMm of horizontalCuts) {
    const y = (gridPage.config.sheetHeightMm - cutMm) * MM_TO_PT;
    line({ x: minX - markGap - markLength, y }, { x: minX - markGap, y });
    line({ x: maxX + markGap, y }, { x: maxX + markGap + markLength, y });
  }
}

type PhotoSlot = PhotoLayoutItem & {
  mockupId: string;
  bleedMockupId?: string;
  trimMode: PhotoTrimMode;
  artisticMarginMm?: number;
};

function pdfBytesToBlob(pdfBytes: Uint8Array): Blob {
  const buffer = pdfBytes.buffer.slice(
    pdfBytes.byteOffset,
    pdfBytes.byteOffset + pdfBytes.byteLength
  ) as ArrayBuffer;
  return new Blob([buffer], { type: 'application/pdf' });
}

function collectPhotoSlots(orders: PhotoOrder[]): PhotoSlot[] {
  const slots: PhotoSlot[] = [];
  for (const order of orders) {
    if (order.orderType !== 'photo') continue;
    for (const item of order.items ?? []) {
      if (!item.mockupId) continue;
      const quantity = Math.max(1, Math.floor(Number(item.quantity ?? 1)));
      const size = resolvePrintFormatMm(item);
      if (!size) {
        throw new Error(`Не удалось определить размер фото «${item.printSize ?? ''}»`);
      }
      const trimMode = order.photoType === 'polaroid' ? 'artistic' : resolvePhotoTrimMode(item);
      for (let i = 0; i < quantity; i++) {
        slots.push({
          mockupId: item.mockupId,
          ...(item.bleedMockupId ? { bleedMockupId: item.bleedMockupId } : {}),
          widthMm: size.widthMm,
          heightMm: size.heightMm,
          allowRotation: true,
          trimMode,
          ...(trimMode === 'artistic' ? { artisticMarginMm: item.artisticMarginMm ?? 5 } : {}),
        });
      }
    }
  }
  return slots;
}

export async function createPhotoSra3PdfBlobV2(
  orders: PhotoOrder[],
  options: PhotoSra3PdfV2Options = {}
): Promise<Blob> {
  const signal = options.signal;
  const rasterEmbed = options.rasterEmbed ?? 'browser';
  const resolveMockupImage =
    options.resolveMockupImage ??
    (async (mockupId: string, requestSignal?: AbortSignal) => {
      const response = await fetch(
        `/api/mockups/${encodeURIComponent(mockupId)}/full-image`,
        { signal: requestSignal ?? signal }
      );
      return response.ok ? response.blob() : null;
    });

  const slots = collectPhotoSlots(orders);
  if (slots.length === 0) throw new Error('Не удалось загрузить ни одного фото для PDF');

  // Раскладка до скачивания: смешанные форматы падают здесь, а не после сотен загрузок.
  const pages = layoutPhotoItemsOnSra3Grid(slots, {
    trimWidthMm: slots[0].widthMm,
    trimHeightMm: slots[0].heightMm,
    allowRotation: true,
    fillBlankSlots: true,
  });

  const renderSheet = async (gridPage: (typeof pages)[number]): Promise<Uint8Array> => {
    const pdfDoc = await PDFDocument.create();
    const imageCache = new Map<string, { image: PDFImage; width: number; height: number }>();
    const missingIds: string[] = [];

    const loadImage = async (mockupId: string) => {
      const cached = imageCache.get(mockupId);
      if (cached) return cached;
      const blob = await resolveMockupImage(mockupId, signal);
      if (!blob) return null;
      const image = await embedMockupRasterInPdf(pdfDoc, blob, rasterEmbed);
      if (!image) return null;
      const loaded = { image, width: image.width, height: image.height };
      imageCache.set(mockupId, loaded);
      return loaded;
    };

    const preparedPlacements: Array<PhotoPlacement<PreparedPhoto>> = [];
    for (const placement of gridPage.placements) {
      const slot = placement.item;
      if (!slot || placement.isBlank) {
        preparedPlacements.push(placement as unknown as PhotoPlacement<PreparedPhoto>);
        continue;
      }
      const main = await loadImage(slot.mockupId);
      if (!main) {
        missingIds.push(slot.mockupId);
        continue;
      }
      const needsBleed =
        slot.trimMode === 'fit' &&
        Boolean(slot.bleedMockupId) &&
        slot.bleedMockupId !== slot.mockupId;
      const bleed = needsBleed && slot.bleedMockupId ? await loadImage(slot.bleedMockupId) : null;
      if (needsBleed && !bleed) {
        missingIds.push(slot.bleedMockupId as string);
        continue;
      }
      preparedPlacements.push({
        ...placement,
        item: {
          image: main.image,
          imageWidth: main.width,
          imageHeight: main.height,
          ...(bleed
            ? {
                bleedImage: bleed.image,
                bleedImageWidth: bleed.width,
                bleedImageHeight: bleed.height,
              }
            : {}),
          widthMm: slot.widthMm,
          heightMm: slot.heightMm,
          allowRotation: true,
          trimMode: slot.trimMode,
          ...(slot.artisticMarginMm != null ? { artisticMarginMm: slot.artisticMarginMm } : {}),
        },
      });
    }

    const expectedOnSheet = gridPage.placements.filter(
      (placement) => placement.item && !placement.isBlank
    ).length;
    const loadedOnSheet = preparedPlacements.filter(
      (placement) => placement.item && !placement.isBlank
    ).length;
    if (missingIds.length > 0 || loadedOnSheet !== expectedOnSheet) {
      throw missingPhotosError(loadedOnSheet, expectedOnSheet, missingIds);
    }

    const page = pdfDoc.addPage([
      gridPage.config.sheetWidthMm * MM_TO_PT,
      gridPage.config.sheetHeightMm * MM_TO_PT,
    ]);
    for (const placement of preparedPlacements) {
      drawPreparedPhoto(page, placement, gridPage.config.sheetHeightMm);
    }
    drawExternalCropMarks(page, { ...gridPage, placements: preparedPlacements });
    return pdfDoc.save();
  };

  // Каждый лист — отдельный документ: JPEG предыдущего листа можно отпустить до следующего.
  // Иначе тираж в сотни фото держит все оригиналы в одном PDF до save() и процесс умирает по памяти,
  // а в CRM файл так и остаётся в статусе processing («Готовится»).
  const merged = await PDFDocument.create();
  for (let index = 0; index < pages.length; index++) {
    if (pages.length > 4 && (index === 0 || (index + 1) % 10 === 0 || index + 1 === pages.length)) {
      console.info('[photoSra3Pdf] лист', index + 1, 'из', pages.length);
    }
    const sheetBytes = await renderSheet(pages[index]);
    const sheet = await PDFDocument.load(sheetBytes);
    const [copied] = await merged.copyPages(sheet, [0]);
    merged.addPage(copied);
  }

  merged.setTitle('PrintCore SRA3 photo imposition');
  return pdfBytesToBlob(await merged.save());
}
