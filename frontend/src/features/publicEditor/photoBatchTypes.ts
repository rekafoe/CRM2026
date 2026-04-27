export type PhotoBatchFitMode = 'cover' | 'contain';

export type PhotoBatchSizeOption = {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
};

export type PhotoBatchDraftItem = {
  id: string;
  file: File;
  previewUrl: string;
  originalName: string;
  sizeId: string;
  quantity: number;
  fitMode: PhotoBatchFitMode;
  rotation: number;
  crop: { x: number; y: number; w: number; h: number };
};

export type PhotoBatchSavedItem = {
  fileId: number;
  originalName: string;
  quantity: number;
  fitMode: PhotoBatchFitMode;
  rotation: number;
  crop: { x: number; y: number; w: number; h: number };
};

export type PhotoBatchGroup = {
  groupSizeId: string;
  groupLabel: string;
  targetSizeMm: { width: number; height: number };
  quantity: number;
  items: PhotoBatchSavedItem[];
};
