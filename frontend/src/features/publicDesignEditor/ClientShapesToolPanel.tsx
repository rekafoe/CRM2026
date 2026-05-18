import React from 'react';

interface ClientShapesToolPanelProps {
  onAddShape: (type: 'rect' | 'circle' | 'line' | 'triangle') => void;
}

export const ClientShapesToolPanel: React.FC<ClientShapesToolPanelProps> = ({ onAddShape }) => (
  <div className="public-design-editor__client-tool-card">
    <p>Добавьте простую фигуру для акцента или декоративного блока.</p>
    <div className="public-design-editor__client-tool-grid">
      <button type="button" onClick={() => onAddShape('rect')}>Прямоугольник</button>
      <button type="button" onClick={() => onAddShape('circle')}>Круг</button>
      <button type="button" onClick={() => onAddShape('line')}>Линия</button>
      <button type="button" onClick={() => onAddShape('triangle')}>Треугольник</button>
    </div>
  </div>
);
