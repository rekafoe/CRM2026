import React from 'react';
import type { SelectedObjProps } from '../../pages/admin/designEditor/types';

export type ClientObjectAction = 'duplicate' | 'delete' | 'forward' | 'backward' | 'replacePhoto' | 'clearPhoto';

interface ClientObjectToolPanelProps {
  selectedObj: SelectedObjProps | null;
  onAction: (action: ClientObjectAction) => void;
}

export const ClientObjectToolPanel: React.FC<ClientObjectToolPanelProps> = ({ selectedObj, onAction }) => (
  <div className="public-design-editor__client-tool-card">
    {selectedObj ? (
      <>
        <p>
          {selectedObj.type === 'photoField' && selectedObj.photoFieldFilled
            ? 'Фото в поле. Углы — размер поля, двойной клик — кадрирование. Delete — убрать фото.'
              : selectedObj.type === 'photoField'
              ? 'Пустое фото-поле. Потяните за углы — изменить размер. Delete — удалить поле.'
              : selectedObj.type === 'IText'
                ? 'Текст. Двойной клик — правка. Delete — удалить блок.'
                : 'Настройте выбранный объект.'}
        </p>
        <div className="public-design-editor__client-tool-grid">
          {selectedObj.type === 'photoField' && selectedObj.photoFieldFilled ? (
            <>
              <button type="button" onClick={() => onAction('replacePhoto')}>Заменить фото</button>
              <button
                type="button"
                className="public-design-editor__client-tool-danger"
                onClick={() => onAction('clearPhoto')}
              >
                Убрать фото
              </button>
            </>
          ) : selectedObj.type === 'photoField' ? (
            <button
              type="button"
              className="public-design-editor__client-tool-danger"
              onClick={() => onAction('delete')}
            >
              Удалить поле
            </button>
          ) : (
            <>
              <button type="button" onClick={() => onAction('duplicate')}>Дублировать</button>
              <button type="button" onClick={() => onAction('forward')}>Выше</button>
              <button type="button" onClick={() => onAction('backward')}>Ниже</button>
              <button type="button" className="public-design-editor__client-tool-danger" onClick={() => onAction('delete')}>
                Удалить
              </button>
            </>
          )}
        </div>
      </>
    ) : (
      <p>Выберите текст, фото-поле или фигуру на макете. Для фото с картинкой: двойной клик — кадр, Delete — убрать.</p>
    )}
  </div>
);
