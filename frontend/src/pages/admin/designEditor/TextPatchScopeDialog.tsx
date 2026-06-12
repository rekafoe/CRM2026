import React from 'react';
import { Modal } from '../../../components/common/Modal';
import './textPatchScopeDialog.css';

export type TextPatchScopeChoice = 'currentPage' | 'wholeDocument';

interface TextPatchScopeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onChoose: (scope: TextPatchScopeChoice) => void;
}

export const TextPatchScopeDialog: React.FC<TextPatchScopeDialogProps> = ({
  isOpen,
  onClose,
  onChoose,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title="Применить к тексту"
    size="sm"
  >
    <div className="text-patch-scope-dialog">
      <p className="text-patch-scope-dialog__message">
        Текст не выделен. К какой части макета применить изменение?
      </p>
      <div className="text-patch-scope-dialog__actions">
        <button
          type="button"
          className="text-patch-scope-dialog__btn text-patch-scope-dialog__btn--secondary"
          onClick={onClose}
        >
          Отмена
        </button>
        <button
          type="button"
          className="text-patch-scope-dialog__btn text-patch-scope-dialog__btn--secondary"
          onClick={() => onChoose('currentPage')}
        >
          Текущая страница
        </button>
        <button
          type="button"
          className="text-patch-scope-dialog__btn text-patch-scope-dialog__btn--primary"
          onClick={() => onChoose('wholeDocument')}
        >
          Весь макет
        </button>
      </div>
    </div>
  </Modal>
);
