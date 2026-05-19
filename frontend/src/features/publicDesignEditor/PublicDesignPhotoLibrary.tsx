import React, { useRef, useState } from 'react';
import { Button } from '../../components/common';
import { SIDEBAR_PHOTO_DRAG_MIME } from '../../pages/admin/designEditor/constants';
import type { SidebarPhotoItem } from '../../pages/admin/designEditor/types';

interface PublicDesignPhotoLibraryProps {
  photos: SidebarPhotoItem[];
  selectedPhotoId?: string | null;
  onFilesSelected: (files: File[]) => void;
  onPhotoClick: (id: string) => void;
  onPhotoSelect?: (id: string) => void;
  onPhotoRemove: (id: string) => void;
  onPhotoRetry?: (id: string) => void;
}

export const PublicDesignPhotoLibrary: React.FC<PublicDesignPhotoLibraryProps> = ({
  photos,
  selectedPhotoId,
  onFilesSelected,
  onPhotoClick,
  onPhotoSelect,
  onPhotoRemove,
  onPhotoRetry,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [failedPreviewIds, setFailedPreviewIds] = useState<Set<string>>(() => new Set());
  const readyCount = photos.filter((photo) => photo.uploadStatus === 'ready').length;
  const uploadingCount = photos.filter((photo) => photo.uploadStatus === 'queued' || photo.uploadStatus === 'uploading').length;
  const errorCount = photos.filter((photo) => photo.uploadStatus === 'error').length;
  const usedCount = photos.filter((photo) => photo.used).length;

  const handleFiles = (files: FileList | File[]) => {
    onFilesSelected(Array.from(files));
  };

  return (
    <section
      className="public-design-editor__photo-library"
      onDrop={(event) => {
        event.preventDefault();
        handleFiles(event.dataTransfer.files);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      aria-label="Фото для макета"
    >
      <input
        ref={inputRef}
        className="visually-hidden-file-input"
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        onChange={(event) => {
          if (event.target.files) handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <div className="public-design-editor__photo-library-head">
        <div>
          <span>Загрузка фото</span>
          <strong>{photos.length ? `${photos.length} фото в проекте` : 'Добавьте изображения'}</strong>
        </div>
        <Button variant="primary" size="sm" onClick={() => inputRef.current?.click()}>
          Загрузить
        </Button>
      </div>
      <p className="public-design-editor__photo-library-hint">
        Перетащите файлы сюда или выберите с компьютера. Потом кликните фото или перетащите его на макет.
      </p>
      <button
        type="button"
        className={`public-design-editor__photo-dropzone${photos.length > 0 ? ' public-design-editor__photo-dropzone--compact' : ''}`}
        onClick={() => inputRef.current?.click()}
      >
        <span>{photos.length > 0 ? 'Добавить ещё фото' : 'Перетащите фото сюда'}</span>
        <strong>{photos.length > 0 ? 'или нажмите для выбора файлов' : 'или нажмите, чтобы выбрать файлы'}</strong>
      </button>
      <div className="public-design-editor__photo-library-status" aria-label="Очередь загрузки фото">
        <span>{readyCount} готово</span>
        {uploadingCount > 0 && <span>{uploadingCount} загружается</span>}
        {errorCount > 0 && <span className="public-design-editor__photo-library-status-error">{errorCount} ошибок</span>}
        {usedCount > 0 && <span>{usedCount} использовано</span>}
      </div>
      {photos.length > 0 && (
        <ul className="public-design-editor__photo-grid">
          {photos.map((photo) => (
            <li
              key={photo.id}
              className={`public-design-editor__photo-item${selectedPhotoId === photo.id ? ' public-design-editor__photo-item--selected' : ''}`}
            >
              <button
                type="button"
                className="public-design-editor__photo-thumb"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(SIDEBAR_PHOTO_DRAG_MIME, JSON.stringify({ id: photo.id }));
                  event.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => onPhotoClick(photo.id)}
                title={`${photo.name} - кликните или перетащите на макет. Фото останется в библиотеке для повторного использования.`}
              >
                <img
                  src={failedPreviewIds.has(photo.id) && photo.fallbackPreviewUrl ? photo.fallbackPreviewUrl : photo.previewUrl}
                  alt=""
                  draggable={false}
                  onError={() => {
                    if (!photo.fallbackPreviewUrl || failedPreviewIds.has(photo.id)) return;
                    setFailedPreviewIds((current) => new Set(current).add(photo.id));
                  }}
                />
                {photo.uploadStatus && photo.uploadStatus !== 'ready' && (
                  <span className="public-design-editor__photo-upload-state">
                    {photo.uploadStatus === 'error' ? 'Ошибка' : `${photo.uploadProgress ?? 0}%`}
                  </span>
                )}
              </button>
              {photo.uploadStatus === 'ready' && (
                <span className={`public-design-editor__photo-ready${photo.used ? ' public-design-editor__photo-ready--used' : ''}`}>
                  {photo.used ? 'Использовано' : 'Готово'}
                </span>
              )}
              {photo.uploadStatus === 'ready' && onPhotoSelect && (
                <button
                  type="button"
                  className="public-design-editor__photo-select"
                  onClick={() => onPhotoSelect(photo.id)}
                >
                  {selectedPhotoId === photo.id ? 'Выбрано' : 'Для поля'}
                </button>
              )}
              {photo.uploadStatus === 'error' && onPhotoRetry && (
                <button
                  type="button"
                  className="public-design-editor__photo-retry"
                  onClick={() => onPhotoRetry(photo.id)}
                >
                  Повторить
                </button>
              )}
              <button
                type="button"
                className="public-design-editor__photo-remove"
                onClick={() => onPhotoRemove(photo.id)}
                aria-label={`Убрать ${photo.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
