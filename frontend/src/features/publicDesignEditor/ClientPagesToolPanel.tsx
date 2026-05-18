import React from 'react';

interface ClientPagesToolPanelProps {
  onClose: () => void;
}

export const ClientPagesToolPanel: React.FC<ClientPagesToolPanelProps> = ({ onClose }) => (
  <div className="public-design-editor__client-tool-card">
    <p>Страницы и развороты находятся в нижней карте макета.</p>
    <button type="button" className="public-design-editor__client-tool-primary" onClick={onClose}>
      Понятно
    </button>
    <span>Там можно перейти на нужную страницу и добавить новую, если продукт это поддерживает.</span>
  </div>
);
