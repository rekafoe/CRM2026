import React from 'react';
import './PhotoFieldFillOverlay.css';

interface PhotoFieldFillOverlayProps {
  progress: number;
}

export const PhotoFieldFillOverlay: React.FC<PhotoFieldFillOverlayProps> = ({ progress }) => {
  const label = progress > 0 && progress < 96
    ? `Загрузка на сервер… ${progress}%`
    : progress >= 96
      ? 'Подготовка фото на макете…'
      : 'Загрузка фото…';

  return (
    <div className="photo-field-fill-overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="photo-field-fill-overlay__card">
        <span className="photo-field-fill-overlay__spinner" aria-hidden />
        <strong className="photo-field-fill-overlay__title">Загрузка фото</strong>
        <span className="photo-field-fill-overlay__label">{label}</span>
        {progress > 0 && progress < 100 && (
          <div
            className="photo-field-fill-overlay__bar"
            aria-hidden
            style={{ '--photo-fill-progress': progress } as React.CSSProperties}
          >
            <span className="photo-field-fill-overlay__bar-fill" />
          </div>
        )}
      </div>
    </div>
  );
};
