import { useCallback } from 'react';
import { uploadDesignTemplateAsset } from '../../../api';

export function useDesignTemplateAssetUpload(templateId: number | null) {
  const resolveImageFileUrl = useCallback(async (
    file: File,
    onProgress?: (progress: number) => void,
  ) => {
    if (!templateId) {
      throw new Error('Не указан шаблон для загрузки изображения');
    }
    const response = await uploadDesignTemplateAsset(
      templateId,
      file,
      onProgress
        ? (event) => {
          const total = event.total ?? 0;
          if (total > 0) {
            onProgress(Math.round((event.loaded / total) * 100));
          }
        }
        : undefined,
    );
    return response.data.url;
  }, [templateId]);

  return { resolveImageFileUrl };
}
