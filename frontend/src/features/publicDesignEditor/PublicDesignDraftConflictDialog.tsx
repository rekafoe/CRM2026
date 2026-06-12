import React from 'react';
import { Modal } from '../../components/common/Modal';
import './publicDesignDraftConflictDialog.css';

interface PublicDesignDraftConflictDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onReloadFromServer: () => void;
  onForceSave: () => void;
}

export const PublicDesignDraftConflictDialog: React.FC<PublicDesignDraftConflictDialogProps> = ({
  isOpen,
  onClose,
  onReloadFromServer,
  onForceSave,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title="Макет изменён в другой вкладке"
    size="sm"
  >
    <div className="public-design-draft-conflict">
      <p className="public-design-draft-conflict__message">
        На сервере уже есть более новая версия черновика. Можно загрузить её с сервера,
        оставить текущую правку на экране или сохранить вашу версию поверх серверной.
      </p>
      <div className="public-design-draft-conflict__actions">
        <button type="button" className="public-design-draft-conflict__btn public-design-draft-conflict__btn--secondary" onClick={onClose}>
          Остаться с моей правкой
        </button>
        <button type="button" className="public-design-draft-conflict__btn public-design-draft-conflict__btn--secondary" onClick={onReloadFromServer}>
          Загрузить с сервера
        </button>
        <button type="button" className="public-design-draft-conflict__btn public-design-draft-conflict__btn--primary" onClick={onForceSave}>
          Сохранить мою версию
        </button>
      </div>
    </div>
  </Modal>
);
