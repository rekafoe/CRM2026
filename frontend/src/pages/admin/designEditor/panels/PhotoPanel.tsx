import React, { useMemo, useState } from 'react';
import { AppIcon } from '../../../../components/ui/AppIcon';
import { Button } from '../../../../components/common';
import type { SidebarPhotoItem } from '../types';

interface PhotoPanelProps {
  onAddImage: () => void;
  onAddPhotoField?: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  /** Загрузка по прямой ссылке (прокси на сервере) */
  onImageUrlSubmit?: (url: string) => Promise<void>;
  sortBy: 'name' | 'date';
  onSortChange: (value: 'name' | 'date') => void;
  /** Подставить загруженные на макет фото в пустые поля для фото */
  onAutofillPhotoFields?: () => void | Promise<void>;
  /** Загружены в проект, ещё не на макете (превью) */
  libraryPhotos?: SidebarPhotoItem[];
  onLibraryPhotoClick?: (id: string) => void;
  onLibraryPhotoRemove?: (id: string) => void;
  onClose: () => void;
}

function UploadZoneIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

export const PhotoPanel: React.FC<PhotoPanelProps> = ({
  onAddImage,
  onAddPhotoField,
  onDrop,
  onDragOver,
  onImageUrlSubmit,
  sortBy,
  onSortChange,
  onAutofillPhotoFields,
  libraryPhotos = [],
  onLibraryPhotoClick,
  onLibraryPhotoRemove,
  onClose,
}) => {
  const [urlValue, setUrlValue] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);

  const sortedLibrary = useMemo(() => {
    const list = [...libraryPhotos];
    if (sortBy === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    } else {
      list.sort((a, b) => b.addedAt - a.addedAt);
    }
    return list;
  }, [libraryPhotos, sortBy]);

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onImageUrlSubmit || !urlValue.trim()) return;
    setUrlLoading(true);
    try {
      await onImageUrlSubmit(urlValue.trim());
      setUrlValue('');
    } finally {
      setUrlLoading(false);
    }
  };

  return (
    <div className="photo-panel">
      <div className="photo-panel__header">
        <h3 className="photo-panel__title">Фото</h3>
        <button type="button" className="photo-panel__close" onClick={onClose} aria-label="Закрыть">
          <AppIcon name="x" size="sm" />
        </button>
      </div>

      <div className="photo-panel__body">
        <section className="photo-panel__section" aria-label="Добавить на макет">
          <Button variant="primary" onClick={onAddImage} className="photo-panel__btn-primary">
            <AppIcon name="plus" size="xs" /> Добавить изображение
          </Button>
          {onAddPhotoField && (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={onAddPhotoField}
                className="photo-panel__btn-outline"
              >
                <AppIcon name="camera" size="xs" /> Поле для фото
              </Button>
              <p className="photo-panel__hint">
                Рамка на макете: перетащите сюда фото или дважды кликните по рамке. Изображение вписывается без
                искажения.
              </p>
            </>
          )}
          <div className="photo-panel__tool-row">
            <button type="button" className="photo-panel__icon-btn" title="Галерея / сетка" aria-label="Галерея">
              <AppIcon name="layers" size="sm" />
            </button>
          </div>
        </section>

        {onImageUrlSubmit && (
          <section className="photo-panel__section" aria-label="Загрузка по ссылке">
            <form className="photo-panel__url-card" onSubmit={(e) => void handleUrlSubmit(e)}>
              <label className="photo-panel__url-label" htmlFor="design-editor-photo-url">
                По ссылке (Я.Диск, Google Drive, прямой URL)
              </label>
              <div className="photo-panel__url-row">
                <input
                  id="design-editor-photo-url"
                  type="url"
                  className="photo-panel__url-input"
                  placeholder="https://..."
                  value={urlValue}
                  onChange={(e) => setUrlValue(e.target.value)}
                  disabled={urlLoading}
                  autoComplete="off"
                />
                <Button type="submit" variant="secondary" disabled={urlLoading || !urlValue.trim()}>
                  {urlLoading ? '…' : 'OK'}
                </Button>
              </div>
              <p className="photo-panel__url-hint">
                Нужна прямая ссылка на файл или открытая папка. Для Google: «Ссылка на просмотр» подойдёт — мы
                преобразуем её на сервере.
              </p>
            </form>
          </section>
        )}

        <section className="photo-panel__section" aria-label="Сортировка">
          <div className="photo-panel__sort-row">
            <select
              className="photo-panel__select"
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as 'name' | 'date')}
            >
              <option value="name">По названию</option>
              <option value="date">По дате</option>
            </select>
            <button type="button" className="photo-panel__filter-btn" title="Фильтр" aria-label="Фильтр">
              <AppIcon name="filter" size="sm" />
            </button>
          </div>
        </section>

        <section className="photo-panel__section photo-panel__section--toggles" aria-label="Параметры списка">
          {onAutofillPhotoFields && (
            <>
              <Button
                type="button"
                variant="secondary"
                className="photo-panel__btn-outline"
                onClick={() => void onAutofillPhotoFields()}
              >
                Автозаполнение полей
              </Button>
              <p className="photo-panel__hint">
                Свободные фото на макете по порядку вставляются в пустые поля для фото.
              </p>
            </>
          )}
        </section>

        <div
          className="photo-panel__dropzone"
          onDrop={onDrop}
          onDragOver={onDragOver}
          onClick={onAddImage}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onAddImage()}
          aria-label="Нажмите или перенесите изображение для загрузки"
        >
          <UploadZoneIcon className="photo-panel__dropzone-icon" />
          <span className="photo-panel__dropzone-text">Нажмите или перенесите изображение для загрузки</span>
        </div>

        {libraryPhotos.length > 0 && (
          <section className="photo-panel__section photo-panel__section--gallery" aria-label="Неразмещённые фото">
            <h4 className="photo-panel__gallery-title">Загружены в проект</h4>
            <p className="photo-panel__gallery-hint">Ещё не на макете — кликните, чтобы добавить на страницу.</p>
            <ul className="photo-panel__gallery">
              {sortedLibrary.map((p) => (
                <li key={p.id} className="photo-panel__gallery-item">
                  <button
                    type="button"
                    className="photo-panel__gallery-thumb"
                    onClick={() => void onLibraryPhotoClick?.(p.id)}
                    title={p.name}
                    aria-label={`Поставить на макет: ${p.name}`}
                  >
                    <img src={p.previewUrl} alt="" className="photo-panel__gallery-img" draggable={false} />
                  </button>
                  {onLibraryPhotoRemove && (
                    <button
                      type="button"
                      className="photo-panel__gallery-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        onLibraryPhotoRemove(p.id);
                      }}
                      aria-label={`Убрать из проекта: ${p.name}`}
                    >
                      <AppIcon name="x" size="xs" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
};
