import React, { useRef, useState } from 'react';
import { Button } from '../../components/common';
import { SIDEBAR_PHOTO_DRAG_MIME } from '../../pages/admin/designEditor/constants';
import type { SidebarPhotoItem } from '../../pages/admin/designEditor/types';

interface PublicDesignPhotoLibraryProps {
  photos: SidebarPhotoItem[];
  onFilesSelected: (files: File[]) => void;
  onImageUrlSubmit?: (url: string) => Promise<void>;
  onAutofill?: () => void | Promise<void>;
  onPhotoClick: (id: string) => void;
  onPhotoRemove: (id: string) => void;
}

export const PublicDesignPhotoLibrary: React.FC<PublicDesignPhotoLibraryProps> = ({
  photos,
  onFilesSelected,
  onImageUrlSubmit,
  onAutofill,
  onPhotoClick,
  onPhotoRemove,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [urlValue, setUrlValue] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);

  const handleFiles = (files: FileList | File[]) => {
    onFilesSelected(Array.from(files));
  };

  const handleUrlSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const url = urlValue.trim();
    if (!url || !onImageUrlSubmit) return;
    setUrlLoading(true);
    try {
      await onImageUrlSubmit(url);
      setUrlValue('');
    } finally {
      setUrlLoading(false);
    }
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
          <span>Фото</span>
          <strong>{photos.length ? `${photos.length} загружено` : 'Добавьте фото'}</strong>
        </div>
        <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
          + Фото
        </Button>
      </div>
      {onImageUrlSubmit && (
        <form className="public-design-editor__photo-url" onSubmit={(event) => void handleUrlSubmit(event)}>
          <input
            type="url"
            value={urlValue}
            onChange={(event) => setUrlValue(event.target.value)}
            placeholder="Ссылка на фото"
            disabled={urlLoading}
          />
          <Button type="submit" variant="secondary" size="sm" disabled={!urlValue.trim() || urlLoading}>
            {urlLoading ? '...' : 'OK'}
          </Button>
        </form>
      )}
      {photos.length > 0 && onAutofill && (
        <Button variant="secondary" size="sm" onClick={() => void onAutofill()}>
          Разложить автоматически
        </Button>
      )}
      {photos.length === 0 ? (
        <button
          type="button"
          className="public-design-editor__photo-dropzone"
          onClick={() => inputRef.current?.click()}
        >
          Перетащите изображения сюда или нажмите, чтобы выбрать
        </button>
      ) : (
        <ul className="public-design-editor__photo-grid">
          {photos.map((photo) => (
            <li key={photo.id} className="public-design-editor__photo-item">
              <button
                type="button"
                className="public-design-editor__photo-thumb"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(SIDEBAR_PHOTO_DRAG_MIME, JSON.stringify({ id: photo.id }));
                  event.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => onPhotoClick(photo.id)}
                title={`${photo.name} - кликните или перетащите на макет`}
              >
                <img src={photo.previewUrl} alt="" draggable={false} />
              </button>
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
