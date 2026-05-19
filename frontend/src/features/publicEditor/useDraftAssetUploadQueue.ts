import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PublicEditorDraftFile } from '../../api';

export type DraftAssetUploadStatus = 'queued' | 'uploading' | 'ready' | 'error';

export interface DraftAssetUploadItem {
  id: string;
  file?: File;
  fileId?: number;
  originalName: string;
  previewUrl: string;
  fallbackPreviewUrl?: string;
  url?: string;
  thumbUrl?: string | null;
  size?: number | null;
  width?: number | null;
  height?: number | null;
  progress: number;
  status: DraftAssetUploadStatus;
  error?: string;
}

interface UseDraftAssetUploadQueueInput {
  uploadFile: (file: File, onProgress: (progress: number) => void) => Promise<PublicEditorDraftFile>;
  concurrency?: number;
  initialAssets?: PublicEditorDraftFile[];
}

function createLocalAsset(file: File): DraftAssetUploadItem {
  return {
    id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
    file,
    originalName: file.name,
    previewUrl: URL.createObjectURL(file),
    size: file.size,
    progress: 0,
    status: 'queued',
  };
}

function createReadyAsset(asset: PublicEditorDraftFile): DraftAssetUploadItem {
  return {
    id: `asset-${asset.id}`,
    fileId: asset.id,
    originalName: asset.originalName,
    previewUrl: asset.thumbUrl || asset.url,
    url: asset.url,
    thumbUrl: asset.thumbUrl,
    size: asset.size,
    width: asset.width,
    height: asset.height,
    progress: 100,
    status: 'ready',
  };
}

function revokeLocalPreview(item: DraftAssetUploadItem): void {
  if (item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
  if (item.fallbackPreviewUrl?.startsWith('blob:') && item.fallbackPreviewUrl !== item.previewUrl) {
    URL.revokeObjectURL(item.fallbackPreviewUrl);
  }
}

export function useDraftAssetUploadQueue({
  uploadFile,
  concurrency = 4,
  initialAssets = [],
}: UseDraftAssetUploadQueueInput) {
  const [items, setItems] = useState<DraftAssetUploadItem[]>(() => initialAssets.map(createReadyAsset));
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const uploadFileRef = useRef(uploadFile);
  uploadFileRef.current = uploadFile;

  useEffect(() => {
    setItems((current) => {
      const existing = new Set(current.filter((item) => item.fileId).map((item) => item.fileId));
      const next = initialAssets.filter((asset) => !existing.has(asset.id)).map(createReadyAsset);
      return next.length ? [...current, ...next] : current;
    });
  }, [initialAssets]);

  const addFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;
    setItems((current) => [...current, ...files.map(createLocalAsset)]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((current) => {
      const target = current.find((item) => item.id === id);
      if (target) revokeLocalPreview(target);
      return current.filter((item) => item.id !== id);
    });
  }, []);

  const retryItem = useCallback((id: string) => {
    setItems((current) => current.map((item) => (
      item.id === id && item.file
        ? { ...item, status: 'queued', progress: 0, error: undefined }
        : item
    )));
  }, []);

  const clear = useCallback(() => {
    setItems((current) => {
      current.forEach(revokeLocalPreview);
      return [];
    });
  }, []);

  useEffect(() => () => {
    itemsRef.current.forEach(revokeLocalPreview);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const uploading = items.filter((item) => item.status === 'uploading').length;
    const freeSlots = Math.max(0, concurrency - uploading);
    if (freeSlots === 0) return;
    const queued = items.filter((item) => item.status === 'queued' && item.file).slice(0, freeSlots);
    if (queued.length === 0) return;

    setItems((current) => current.map((item) => (
      queued.some((queuedItem) => queuedItem.id === item.id)
        ? { ...item, status: 'uploading', progress: Math.max(1, item.progress) }
        : item
    )));

    queued.forEach((item) => {
      if (!item.file) return;
      void uploadFileRef.current(item.file, (progress) => {
        setItems((current) => current.map((currentItem) => (
          currentItem.id === item.id
            ? { ...currentItem, progress: Math.max(1, Math.min(99, progress)) }
            : currentItem
        )));
      }).then((asset) => {
        setItems((current) => current.map((currentItem) => {
          if (currentItem.id !== item.id) return currentItem;
          const readyAsset = createReadyAsset(asset);
          return {
            ...readyAsset,
            id: currentItem.id,
            file: currentItem.file,
            fallbackPreviewUrl: currentItem.previewUrl.startsWith('blob:') ? currentItem.previewUrl : currentItem.fallbackPreviewUrl,
          };
        }));
      }).catch((err) => {
        setItems((current) => current.map((currentItem) => (
          currentItem.id === item.id
            ? {
              ...currentItem,
              status: 'error',
              progress: 0,
              error: err instanceof Error ? err.message : 'Не удалось загрузить файл',
            }
            : currentItem
        )));
      });
    });
  }, [concurrency, items]);

  const summary = useMemo(() => {
    const ready = items.filter((item) => item.status === 'ready').length;
    const uploading = items.filter((item) => item.status === 'uploading').length;
    const errors = items.filter((item) => item.status === 'error').length;
    const totalProgress = items.length === 0
      ? 0
      : Math.round(items.reduce((sum, item) => sum + item.progress, 0) / items.length);
    return { total: items.length, ready, uploading, errors, totalProgress };
  }, [items]);

  return {
    items,
    summary,
    addFiles,
    removeItem,
    retryItem,
    clear,
  };
}
