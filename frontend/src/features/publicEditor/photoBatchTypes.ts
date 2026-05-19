export type PhotoBatchFitMode = 'cover' | 'contain';

export type PhotoBatchSizeOption = {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
};

export type PhotoBatchDraftItem = {
  id: string;
  file?: File;
  fileId?: number;
  previewUrl: string;
  fallbackPreviewUrl?: string;
  url?: string;
  thumbUrl?: string | null;
  originalName: string;
  size?: number | null;
  width?: number | null;
  height?: number | null;
  sizeId: string;
  quantity: number;
  fitMode: PhotoBatchFitMode;
  rotation: number;
  crop: { x: number; y: number; w: number; h: number };
  uploadStatus?: 'queued' | 'uploading' | 'ready' | 'error';
  uploadProgress?: number;
  uploadError?: string;
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
