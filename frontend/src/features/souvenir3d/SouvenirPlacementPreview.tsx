import React from 'react';
import type { PrintAreaConfig } from './types';
import './souvenir3dPreview.css';

export type SouvenirPlacementPreviewProps = {
  printArea: PrintAreaConfig;
  /** Растр плоского макета (data URL / http). */
  printImageUrl: string | null;
  className?: string;
};

/**
 * Статичный бланк размещения для оператора Order Pool.
 * Без Three.js — схема изделия + принт в зоне.
 */
export const SouvenirPlacementPreview: React.FC<SouvenirPlacementPreviewProps> = ({
  printArea,
  printImageUrl,
  className,
}) => {
  const isMug = printArea.procedural === 'mug' || printArea.id === 'wrap';
  const root = [
    'souvenir3d-placement',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={root}>
      <div
        className={`souvenir3d-placement__blank${isMug ? ' souvenir3d-placement__blank--mug' : ''}`}
        aria-label={`Схема размещения: ${printArea.label}`}
      >
        <div className="souvenir3d-placement__silhouette" />
        {printImageUrl ? (
          <img
            className="souvenir3d-placement__print"
            src={printImageUrl}
            alt={`Принт: ${printArea.label}`}
          />
        ) : (
          <div className="souvenir3d-placement__print" aria-hidden />
        )}
      </div>
      <p className="souvenir3d-placement__meta">
        {printArea.label} · {printArea.widthMm}×{printArea.heightMm} мм
        {printArea.meshName ? ` · mesh ${printArea.meshName}` : ''}
      </p>
    </div>
  );
};

export default SouvenirPlacementPreview;
