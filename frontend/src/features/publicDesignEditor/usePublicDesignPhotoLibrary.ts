import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { fetchImageFromUrl } from '../../api';
import type { DesignEditorCanvasHandle } from '../../pages/admin/designEditor/DesignEditorCanvas';
import type { SidebarPhotoItem } from '../../pages/admin/designEditor/types';
import { filterLikelyImageFiles, looksLikeHttpUrl } from '../../utils/imageFile';

interface UsePublicDesignPhotoLibraryInput {
  canvasHandleRef: RefObject<DesignEditorCanvasHandle | null>;
  markDirty: () => void;
  setError: (message: string | null) => void;
}

function createSidebarPhotoId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function usePublicDesignPhotoLibrary({
  canvasHandleRef,
  markDirty,
  setError,
}: UsePublicDesignPhotoLibraryInput) {
  const [sidebarPhotos, setSidebarPhotos] = useState<SidebarPhotoItem[]>([]);
  const sidebarPhotosRef = useRef<SidebarPhotoItem[]>([]);
  sidebarPhotosRef.current = sidebarPhotos;

  const addSidebarPhotos = useCallback((files: File[]) => {
    const images = filterLikelyImageFiles(files, { trustOsPicker: true });
    if (images.length === 0) return;
    setSidebarPhotos((prev) => [
      ...prev,
      ...images.map((file) => ({
        id: createSidebarPhotoId(),
        name: file.name,
        previewUrl: URL.createObjectURL(file),
        file,
        addedAt: Date.now(),
      })),
    ]);
  }, []);

  const removeSidebarPhoto = useCallback((id: string) => {
    setSidebarPhotos((prev) => {
      const target = prev.find((photo) => photo.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((photo) => photo.id !== id);
    });
  }, []);

  const handleLibraryPhotoClick = useCallback(async (id: string) => {
    const photo = sidebarPhotosRef.current.find((item) => item.id === id);
    if (!photo) return;
    try {
      await canvasHandleRef.current?.addImageFromFile(photo.file);
      removeSidebarPhoto(id);
    } catch {
      setError('Не удалось поставить фото на макет.');
    }
  }, [canvasHandleRef, removeSidebarPhoto, setError]);

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
        await handle.addImageFromFile(photo.file);
      }
      await handle.autofillPhotoFields();
      setSidebarPhotos((prev) => {
        prev.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
        return [];
      });
      markDirty();
    } catch {
      setError('Не удалось разложить фото по полям.');
    }
  }, [canvasHandleRef, markDirty, setError]);

  useEffect(() => () => {
    sidebarPhotosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
  }, []);

  return {
    sidebarPhotos,
    addSidebarPhotos,
    removeSidebarPhoto,
    handleLibraryPhotoClick,
    handleImageUrlSubmit,
    handleAutofillPhotos,
  };
}
