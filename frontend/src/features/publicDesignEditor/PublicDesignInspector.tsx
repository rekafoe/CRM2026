import React from 'react';
import { PublicDesignPhotoLibrary } from './PublicDesignPhotoLibrary';
import type { PublicEditorNextAction } from './publicDesignTaskFlow';
import type {
  PublicEditorPreflightField,
  PublicEditorPreflightSummary,
} from './publicDesignPreflight';
import type { SidebarPhotoItem } from '../../pages/admin/designEditor/types';

interface PublicDesignInspectorProps {
  fragmentLabel: string;
  fragmentPreflight: PublicEditorPreflightSummary;
  saving: boolean;
  nextAction: PublicEditorNextAction;
  sidebarPhotos: SidebarPhotoItem[];
  selectedPhotoId?: string | null;
  helpOpen: boolean;
  onFilesSelected: (files: File[]) => void;
  onPhotoClick: (id: string) => void;
  onPhotoSelect?: (id: string) => void;
  onPhotoRemove: (id: string) => void;
  onPhotoRetry?: (id: string) => void;
  onNextAction: () => void;
  onFieldFocus: (field: PublicEditorPreflightField, kind: 'photo' | 'text') => void;
  onPhotoReplace: (field: PublicEditorPreflightField) => void;
  onPlaceSelectedPhoto?: (field: PublicEditorPreflightField) => void;
}

export const PublicDesignInspector: React.FC<PublicDesignInspectorProps> = ({
  fragmentLabel,
  fragmentPreflight,
  saving,
  nextAction,
  sidebarPhotos,
  selectedPhotoId,
  helpOpen,
  onFilesSelected,
  onPhotoClick,
  onPhotoSelect,
  onPhotoRemove,
  onPhotoRetry,
  onNextAction,
  onFieldFocus,
  onPhotoReplace,
  onPlaceSelectedPhoto,
}) => {
  const selectedPhoto = selectedPhotoId
    ? sidebarPhotos.find((photo) => photo.id === selectedPhotoId)
    : null;
  const photoFields = fragmentPreflight.photoFields;
  const missingPhotoCount = Math.max(0, fragmentPreflight.photoTotal - fragmentPreflight.photoReady);
  const hasPhotoFields = photoFields.length > 0;

  return (
    <aside className="public-design-editor__sidepanel public-design-editor__sidepanel--photos" aria-label="Фото для макета">
      <header className="public-design-editor__photo-assistant-head">
        <span>Фото для макета</span>
        <strong>{sidebarPhotos.length > 0 ? 'Выберите фото и поставьте в поле' : 'Сначала загрузите фото'}</strong>
        <p>
          {selectedPhoto
            ? `Выбрано: ${selectedPhoto.name}. Нажмите поле ниже или перетащите фото на макет.`
            : 'Добавьте изображения, затем перетащите их на макет или выберите фото для нужного поля.'}
        </p>
      </header>

      <div className="public-design-editor__inspector-section public-design-editor__inspector-section--photos">
        <PublicDesignPhotoLibrary
          photos={sidebarPhotos}
          selectedPhotoId={selectedPhotoId}
          onFilesSelected={onFilesSelected}
          onPhotoClick={onPhotoClick}
          onPhotoSelect={onPhotoSelect}
          onPhotoRemove={onPhotoRemove}
          onPhotoRetry={onPhotoRetry}
        />

        {hasPhotoFields && (
          <PhotoFieldTargets
            fragmentLabel={fragmentLabel}
            fields={photoFields}
            missingCount={missingPhotoCount}
            hasSelectedPhoto={!!selectedPhoto}
            onFieldFocus={onFieldFocus}
            onPhotoReplace={onPhotoReplace}
            onPlaceSelectedPhoto={onPlaceSelectedPhoto}
          />
        )}

        {nextAction.kind !== 'readyForCart' && (
          <button
            type="button"
            className="public-design-editor__photo-assistant-order"
            onClick={onNextAction}
            disabled={saving}
          >
            {nextAction.label}
          </button>
        )}
      </div>

      {helpOpen && (
        <section className="public-design-editor__help">
          <h2>Как пользоваться редактором</h2>
          <ul>
            <li>Загрузите фото в правой панели.</li>
            <li>Перетащите фото на макет или нажмите «Поставить» у нужного поля.</li>
            <li>Финальная проверка откроется перед оформлением заказа.</li>
          </ul>
        </section>
      )}
    </aside>
  );
};

const FIELD_STATUS_LABELS: Record<PublicEditorPreflightField['status'], string> = {
  ready: 'Заполнено',
  missing: 'Нужно фото',
  warning: 'Проверьте',
};

const PhotoFieldTargets: React.FC<{
  fragmentLabel: string;
  fields: PublicEditorPreflightField[];
  missingCount: number;
  hasSelectedPhoto: boolean;
  onFieldFocus: (field: PublicEditorPreflightField, kind: 'photo' | 'text') => void;
  onPhotoReplace: (field: PublicEditorPreflightField) => void;
  onPlaceSelectedPhoto?: (field: PublicEditorPreflightField) => void;
}> = ({
  fragmentLabel,
  fields,
  missingCount,
  hasSelectedPhoto,
  onFieldFocus,
  onPhotoReplace,
  onPlaceSelectedPhoto,
}) => {
  const visibleFields = fields
    .filter((field) => field.status !== 'ready')
    .concat(fields.filter((field) => field.status === 'ready'))
    .slice(0, 5);

  return (
    <section className="public-design-editor__photo-targets" aria-label="Фото-поля текущей части макета">
      <div className="public-design-editor__photo-targets-head">
        <span>{fragmentLabel}</span>
        <strong>{missingCount > 0 ? `Осталось ${missingCount}` : 'Фото заполнены'}</strong>
      </div>
      {fields.length === 0 ? (
        <p className="public-design-editor__photo-targets-empty">В этой части макета нет фото-полей.</p>
      ) : (
        <div className="public-design-editor__photo-targets-list">
          {visibleFields.map((field) => (
            <article
              key={`${field.pageIndex}-${field.id}`}
              className={`public-design-editor__photo-target public-design-editor__photo-target--${field.status}`}
            >
              <button
                type="button"
                className="public-design-editor__photo-target-main"
                onClick={() => onFieldFocus(field, 'photo')}
              >
                <span>{field.label}</span>
                <strong>{FIELD_STATUS_LABELS[field.status]}</strong>
              </button>
              <div className="public-design-editor__photo-target-actions">
                {hasSelectedPhoto && onPlaceSelectedPhoto && (
                  <button type="button" onClick={() => onPlaceSelectedPhoto(field)}>
                    Поставить
                  </button>
                )}
                <button type="button" onClick={() => onPhotoReplace(field)}>
                  {field.status === 'ready' ? 'Заменить' : 'Выбрать'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
