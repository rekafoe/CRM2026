import React from 'react';

interface ClientPhotoFieldsToolPanelProps {
  onAddPhotoField: (options?: { width?: number; height?: number }) => void;
  onAutofillPhotos: () => void;
  onClose: () => void;
}

const PHOTO_FIELD_PRESETS = [
  { label: 'Квадрат', hint: '1:1', width: 140, height: 140, preview: 'square' },
  { label: 'Горизонтальное', hint: '4:3', width: 190, height: 140, preview: 'landscape' },
  { label: 'Вертикальное', hint: '3:4', width: 140, height: 190, preview: 'portrait' },
  { label: 'Широкое', hint: '16:9', width: 220, height: 124, preview: 'wide' },
];

export const ClientPhotoFieldsToolPanel: React.FC<ClientPhotoFieldsToolPanelProps> = ({
  onAddPhotoField,
  onAutofillPhotos,
  onClose,
}) => (
  <div className="public-design-editor__client-tool-card">
    <p>Выберите форму области, куда клиентское фото можно поставить или перетащить.</p>
    <div className="public-design-editor__client-photo-preset-grid">
      {PHOTO_FIELD_PRESETS.map((preset) => (
        <button
          key={preset.label}
          type="button"
          className="public-design-editor__client-photo-preset"
          onClick={() => {
            onAddPhotoField({ width: preset.width, height: preset.height });
            onClose();
          }}
        >
          <i className={`public-design-editor__client-photo-preset-preview public-design-editor__client-photo-preset-preview--${preset.preview}`} aria-hidden="true" />
          <span>{preset.label}</span>
          <b>{preset.hint}</b>
        </button>
      ))}
    </div>
    <div className="public-design-editor__client-tool-actions">
      <button type="button" className="public-design-editor__client-tool-secondary" onClick={onAutofillPhotos}>
        Разложить фото
      </button>
    </div>
    <span>Фото можно перетащить в поле прямо из панели «Фото». При наведении нужное поле подсветится.</span>
  </div>
);
