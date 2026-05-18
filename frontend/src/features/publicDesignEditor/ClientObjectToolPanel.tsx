import React from 'react';
import type { SelectedObjProps } from '../../pages/admin/designEditor/types';

export type ClientObjectAction = 'duplicate' | 'delete' | 'forward' | 'backward';

interface ClientObjectToolPanelProps {
  selectedObj: SelectedObjProps | null;
  onAction: (action: ClientObjectAction) => void;
}

export const ClientObjectToolPanel: React.FC<ClientObjectToolPanelProps> = ({ selectedObj, onAction }) => (
  <div className="public-design-editor__client-tool-card">
    {selectedObj ? (
      <>
        <p>Настройте выбранный объект без изменения структуры шаблона.</p>
        <div className="public-design-editor__client-tool-grid">
          <button type="button" onClick={() => onAction('duplicate')}>Дублировать</button>
          <button type="button" onClick={() => onAction('forward')}>Выше</button>
          <button type="button" onClick={() => onAction('backward')}>Ниже</button>
          <button type="button" className="public-design-editor__client-tool-danger" onClick={() => onAction('delete')}>Удалить</button>
        </div>
      </>
    ) : (
      <p>Выберите текст, фото или фигуру на макете, чтобы настроить объект.</p>
    )}
  </div>
);
