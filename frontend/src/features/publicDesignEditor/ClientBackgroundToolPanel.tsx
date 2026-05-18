import React from 'react';

const CLIENT_BACKGROUND_COLORS = [
  { id: 'white', label: 'Белый' },
  { id: 'gray', label: 'Светло-серый' },
  { id: 'blue', label: 'Голубой' },
  { id: 'cream', label: 'Кремовый' },
  { id: 'rose', label: 'Розовый' },
  { id: 'dark', label: 'Тёмный' },
] as const;

const CLIENT_BACKGROUND_COLOR_VALUES: Record<typeof CLIENT_BACKGROUND_COLORS[number]['id'], string> = {
  white: '#ffffff',
  gray: '#f8fafc',
  blue: '#e0f2fe',
  cream: '#fef3c7',
  rose: '#fee2e2',
  dark: '#111827',
};

interface ClientBackgroundToolPanelProps {
  onSetBackground: (color: string) => void;
  onClearBackground: () => void;
}

export const ClientBackgroundToolPanel: React.FC<ClientBackgroundToolPanelProps> = ({
  onSetBackground,
  onClearBackground,
}) => (
  <div className="public-design-editor__client-tool-card">
    <p>Выберите спокойный фон страницы или уберите его.</p>
    <div className="public-design-editor__client-color-grid">
      {CLIENT_BACKGROUND_COLORS.map((color) => (
        <button
          key={color.id}
          type="button"
          className={`public-design-editor__client-color public-design-editor__client-color--${color.id}`}
          onClick={() => onSetBackground(CLIENT_BACKGROUND_COLOR_VALUES[color.id])}
          aria-label={`Фон: ${color.label}`}
        />
      ))}
    </div>
    <button type="button" className="public-design-editor__client-tool-secondary" onClick={onClearBackground}>
      Убрать фон
    </button>
  </div>
);
