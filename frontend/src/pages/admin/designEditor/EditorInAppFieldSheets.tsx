import React, { useState } from 'react';
import { Button } from '../../../components/common';
import { Modal } from '../../../components/common/Modal';
import './EditorInAppFieldSheets.css';

export interface PhotoPickSheetState {
  fieldId: string;
  label: string;
}

export interface TextEditSheetState {
  fieldId: string;
  label: string;
  text: string;
  fontFamily: string;
  fontSize: number;
  fill: string;
}

interface EditorInAppFieldSheetsProps {
  photoPick: PhotoPickSheetState | null;
  textEdit: TextEditSheetState | null;
  onPhotoClose: () => void;
  onPhotoSelected: (file: File) => void;
  onTextClose: () => void;
  onTextSave: (text: string) => void;
}

export const EditorInAppFieldSheets: React.FC<EditorInAppFieldSheetsProps> = ({
  photoPick,
  textEdit,
  onPhotoClose,
  onPhotoSelected,
  onTextClose,
  onTextSave,
}) => {
  const [draftText, setDraftText] = useState(textEdit?.text ?? '');

  React.useEffect(() => {
    setDraftText(textEdit?.text ?? '');
  }, [textEdit?.fieldId, textEdit?.text]);

  return (
    <>
      <Modal
        isOpen={!!photoPick}
        onClose={onPhotoClose}
        title={photoPick?.label ? `Фото: ${photoPick.label}` : 'Добавить фото'}
        size="sm"
      >
        <p className="de-inapp-field-sheet__hint">
          В браузере Telegram нажмите кнопку ниже — откроется галерея или файлы на устройстве.
        </p>
        <label className="de-inapp-photo-pick__label">
          <span>Выбрать фото</span>
          <input
            type="file"
            accept="image/*,.heic,.heif"
            className="de-inapp-photo-pick__input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) onPhotoSelected(file);
            }}
          />
        </label>
        <div className="de-inapp-field-sheet__actions">
          <Button variant="secondary" type="button" onClick={onPhotoClose}>
            Отмена
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={!!textEdit}
        onClose={onTextClose}
        title="Текст на макете"
        size="sm"
        className="de-text-edit-modal"
        overlayClassName="de-text-edit-modal-overlay"
        bodyClassName="de-text-edit-modal__body"
        headerClassName="de-text-edit-modal__header"
      >
        <p className="de-inapp-field-sheet__hint">
          После «Готово» текст появится на макете. Закройте окно, чтобы снова увидеть превью целиком.
        </p>
        <label className="de-inapp-text-edit__field">
          <textarea
            value={draftText}
            rows={3}
            autoFocus
            enterKeyHint="done"
            aria-label="Текст на макете"
            placeholder="Введите текст"
            onChange={(event) => setDraftText(event.target.value)}
          />
        </label>
        <div className="de-inapp-field-sheet__actions">
          <Button variant="secondary" type="button" onClick={onTextClose}>
            Отмена
          </Button>
          <Button type="button" onClick={() => onTextSave(draftText)}>
            Готово
          </Button>
        </div>
      </Modal>
    </>
  );
};
