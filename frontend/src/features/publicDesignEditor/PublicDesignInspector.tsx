import React from 'react';
import { PublicDesignPhotoLibrary } from './PublicDesignPhotoLibrary';
import type { PublicEditorNextAction } from './publicDesignTaskFlow';
import type {
  PublicEditorPreflightField,
  PublicEditorPreflightSummary,
} from './publicDesignPreflight';
import type { SidebarPhotoItem } from '../../pages/admin/designEditor/types';

export type PublicDesignInspectorPanel = 'all' | 'photos' | 'text';

interface PublicDesignInspectorProps {
  fragmentLabel: string;
  fragmentPreflight: PublicEditorPreflightSummary;
  panel: PublicDesignInspectorPanel;
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

const PHOTO_FIELD_STATUS_LABELS: Record<PublicEditorPreflightField['status'], string> = {
  ready: 'Заполнено',
  missing: 'Нужно фото',
  warning: 'Проверьте',
};

const TEXT_FIELD_STATUS_LABELS: Record<PublicEditorPreflightField['status'], string> = {
  ready: 'Заполнен',
  missing: 'Нужен текст',
  warning: 'Проверьте',
};

export const PublicDesignInspector: React.FC<PublicDesignInspectorProps> = ({
  fragmentLabel,
  fragmentPreflight,
  panel,
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
  const showPhotos = panel === 'all' || panel === 'photos';
  const showText = panel === 'all' || panel === 'text';
  const selectedPhoto = selectedPhotoId
    ? sidebarPhotos.find((photo) => photo.id === selectedPhotoId)
    : null;
  const photoFields = fragmentPreflight.photoFields;
  const textFields = fragmentPreflight.textFields;
  const missingPhotoCount = Math.max(0, fragmentPreflight.photoTotal - fragmentPreflight.photoReady);
  const missingTextCount = Math.max(0, fragmentPreflight.textTotal - fragmentPreflight.textReady);
  const hasPhotoFields = photoFields.length > 0;
  const hasTextFields = textFields.length > 0;

  const sidepanelClassName = [
    'public-design-editor__sidepanel',
    panel === 'text' ? 'public-design-editor__sidepanel--text' : 'public-design-editor__sidepanel--photos',
  ].join(' ');

  const ariaLabel = panel === 'text' ? 'Текст в макете' : 'Фото для макета';

  return (
    <aside className={sidepanelClassName} aria-label={ariaLabel}>
      {showPhotos && (
        <>
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

            {(panel === 'all' || panel === 'photos') && nextAction.kind !== 'readyForCart' && (
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
        </>
      )}

      {showText && (
        <div className="public-design-editor__inspector-section public-design-editor__inspector-section--text">
          <header className="public-design-editor__text-assistant-head">
            <span>Текст в макете</span>
            <strong>
              {missingTextCount > 0
                ? `Осталось заполнить ${missingTextCount}`
                : hasTextFields
                  ? 'Все текстовые поля заполнены'
                  : 'Нет редактируемого текста'}
            </strong>
            <p>Нажмите поле — откроется макет, можно править текст и оформление.</p>
          </header>

          <TextFieldTargets
            fragmentLabel={fragmentLabel}
            fields={textFields}
            missingCount={missingTextCount}
            onFieldFocus={onFieldFocus}
          />

          {panel === 'text' && nextAction.kind === 'editText' && (
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
      )}

      {helpOpen && panel === 'all' && (
        <section className="public-design-editor__help">
          <h2>Как пользоваться редактором</h2>
          <ul>
            <li>Загрузите фото в правой панели.</li>
            <li>Перетащите фото на макет или нажмите «Поставить» у нужного поля.</li>
            <li>Текстовые поля — в блоке «Текст в макете»; на телефоне вкладка «Текст» внизу.</li>
            <li>Финальная проверка откроется перед оформлением заказа.</li>
          </ul>
        </section>
      )}
    </aside>
  );
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
                <strong>{PHOTO_FIELD_STATUS_LABELS[field.status]}</strong>
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

const TextFieldTargets: React.FC<{
  fragmentLabel: string;
  fields: PublicEditorPreflightField[];
  missingCount: number;
  onFieldFocus: (field: PublicEditorPreflightField, kind: 'photo' | 'text') => void;
}> = ({ fragmentLabel, fields, missingCount, onFieldFocus }) => {
  const visibleFields = fields
    .filter((field) => field.status !== 'ready')
    .concat(fields.filter((field) => field.status === 'ready'))
    .slice(0, 8);

  return (
    <section className="public-design-editor__text-targets" aria-label="Текстовые поля текущей части макета">
      <div className="public-design-editor__photo-targets-head">
        <span>{fragmentLabel}</span>
        <strong>{missingCount > 0 ? `Осталось ${missingCount}` : 'Текст заполнен'}</strong>
      </div>
      {fields.length === 0 ? (
        <p className="public-design-editor__photo-targets-empty">В этой части макета нет текстовых полей.</p>
      ) : (
        <div className="public-design-editor__photo-targets-list">
          {visibleFields.map((field) => (
            <article
              key={`text-${field.pageIndex}-${field.id}`}
              className={`public-design-editor__photo-target public-design-editor__photo-target--${field.status}`}
            >
              <button
                type="button"
                className="public-design-editor__photo-target-main"
                onClick={() => onFieldFocus(field, 'text')}
              >
                <span title={field.label}>{field.label}</span>
                <strong>{TEXT_FIELD_STATUS_LABELS[field.status]}</strong>
              </button>
              <div className="public-design-editor__photo-target-actions">
                <button type="button" onClick={() => onFieldFocus(field, 'text')}>
                  {field.status === 'ready' ? 'Изменить' : 'Заполнить'}
                </button>
              </div>
              {field.status === 'warning' && field.detail && (
                <p className="public-design-editor__text-target-hint">{field.detail}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
