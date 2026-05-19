import { useCallback, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { fetchImageFromUrl } from '../../api';
import type { PublicEditorDraftFile } from '../../api';
import type { DesignEditorCanvasHandle } from '../../pages/admin/designEditor/DesignEditorCanvas';
import type { SidebarPhotoItem } from '../../pages/admin/designEditor/types';
import { filterLikelyImageFiles, looksLikeHttpUrl } from '../../utils/imageFile';
import { useDraftAssetUploadQueue, type DraftAssetUploadItem } from '../publicEditor';

interface UsePublicDesignPhotoLibraryInput {
  canvasHandleRef: RefObject<DesignEditorCanvasHandle | null>;
  resolveImageAsset?: (file: File, onProgress?: (progress: number) => void) => Promise<PublicEditorDraftFile>;
  markDirty: () => void;
  setError: (message: string | null) => void;
}

export function usePublicDesignPhotoLibrary({
  canvasHandleRef,
  resolveImageAsset,
  markDirty,
  setError,
}: UsePublicDesignPhotoLibraryInput) {
  const [usedPhotoIds, setUsedPhotoIds] = useState<Set<string>>(() => new Set());
  const uploadQueue = useDraftAssetUploadQueue({
    uploadFile: async (file, onProgress) => {
      if (!resolveImageAsset) throw new Error('Загрузка фото пока недоступна.');
      return resolveImageAsset(file, onProgress);
    },
  });
  const sidebarPhotos = useMemo<SidebarPhotoItem[]>(() => uploadQueue.items
    .filter((item): item is DraftAssetUploadItem & { file: File } => Boolean(item.file))
    .map((item) => ({
      id: item.id,
      name: item.originalName,
      previewUrl: item.thumbUrl || item.previewUrl,
      fallbackPreviewUrl: item.fallbackPreviewUrl,
      file: item.file,
      fileId: item.fileId,
      url: item.url,
      thumbUrl: item.thumbUrl,
      uploadStatus: item.status,
      uploadProgress: item.progress,
      uploadError: item.error,
      used: usedPhotoIds.has(item.id),
      addedAt: 0,
    })), [uploadQueue.items, usedPhotoIds]);
  const sidebarPhotosRef = useRef<SidebarPhotoItem[]>([]);
  sidebarPhotosRef.current = sidebarPhotos;

  const addSidebarPhotos = useCallback((files: File[]) => {
    const images = filterLikelyImageFiles(files, { trustOsPicker: true });
    if (images.length === 0) return;
    uploadQueue.addFiles(images);
  }, [uploadQueue]);

  const removeSidebarPhoto = useCallback((id: string) => {
    uploadQueue.removeItem(id);
    setUsedPhotoIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, [uploadQueue]);

  const retrySidebarPhoto = useCallback((id: string) => {
    uploadQueue.retryItem(id);
  }, [uploadQueue]);

  const clearErroredPhotos = useCallback(() => {
    sidebarPhotosRef.current
      .filter((photo) => photo.uploadStatus === 'error')
      .forEach((photo) => uploadQueue.removeItem(photo.id));
  }, [uploadQueue]);

  const clearUsedPhotos = useCallback(() => {
    const usedIds = sidebarPhotosRef.current.filter((photo) => photo.used).map((photo) => photo.id);
    usedIds.forEach((id) => uploadQueue.removeItem(id));
    setUsedPhotoIds((current) => {
      const next = new Set(current);
      usedIds.forEach((id) => next.delete(id));
      return next;
    });
  }, [uploadQueue]);

  const markSidebarPhotoUsed = useCallback((id: string) => {
    setUsedPhotoIds((current) => new Set(current).add(id));
  }, []);

  const handleLibraryPhotoClick = useCallback(async (id: string) => {
    const photo = sidebarPhotosRef.current.find((item) => item.id === id);
    if (!photo) return;
    try {
      if (photo.url && photo.uploadStatus === 'ready') {
        await canvasHandleRef.current?.addImageFromUrl(photo.url);
      } else {
        await canvasHandleRef.current?.addImageFromFile(photo.file);
      }
      setUsedPhotoIds((current) => new Set(current).add(id));
      markDirty();
    } catch {
      setError('Не удалось поставить фото на макет.');
    }
  }, [canvasHandleRef, markDirty, setError]);

  const handleImageUrlSubmit = useCallback(async (url: string) => {
    const value = url.trim();
    if (!value) return;
    if (!looksLikeHttpUrl(value)) {
      setError('Нужна ссылка https:// или http:// на изображение.');
      return;
    }
    try {
      setError(null);
      const res = await fetchImageFromUrl(value);
      const blob = res.data;
      const contentType = blob.type || 'image/jpeg';
      const ext = (contentType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      const file = new File([blob], `photo-${Date.now()}.${ext}`, { type: contentType });
      addSidebarPhotos([file]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить фото по ссылке.');
    }
  }, [addSidebarPhotos, setError]);

  const handleAutofillPhotos = useCallback(async () => {
    const photos = sidebarPhotosRef.current;
    const handle = canvasHandleRef.current;
    if (!handle || photos.length === 0) return;
    try {
      for (const photo of photos) {
        if (photo.url && photo.uploadStatus === 'ready') await handle.addImageFromUrl(photo.url);
        else await handle.addImageFromFile(photo.file);
      }
      await handle.autofillPhotoFields();
      setUsedPhotoIds((current) => {
        const next = new Set(current);
        photos.forEach((photo) => next.add(photo.id));
        return next;
      });
      markDirty();
    } catch {
      setError('Не удалось разложить фото по полям.');
    }
  }, [canvasHandleRef, markDirty, setError, uploadQueue]);

  return {
    sidebarPhotos,
    addSidebarPhotos,
    removeSidebarPhoto,
    retrySidebarPhoto,
    clearErroredPhotos,
    clearUsedPhotos,
    markSidebarPhotoUsed,
    handleLibraryPhotoClick,
    handleImageUrlSubmit,
    handleAutofillPhotos,
  };
}
