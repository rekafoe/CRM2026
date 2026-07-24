import React from 'react';
import type { PrintAreaConfig } from './types';
import './souvenir3dPreview.css';

export type SouvenirPlacementPreviewProps = {
  printArea: PrintAreaConfig;
  /** Растр плоского макета (data URL / http). */
  printImageUrl: string | null;
  className?: string;
  /** Компактная схема в модалке оператора (без гигантских отступов). */
  compact?: boolean;
  /** Показывать имя mesh — обычно не нужно оператору. */
  showMeshName?: boolean;
};

/**
 * Статичный бланк размещения для оператора Order Pool.
 * Без Three.js — схема изделия + принт в зоне.
 */
export const SouvenirPlacementPreview: React.FC<SouvenirPlacementPreviewProps> = ({
  printArea,
  printImageUrl,
  className,
  compact = false,
  showMeshName = false,
}) => {
  const isMug = printArea.procedural === 'mug' || printArea.id === 'wrap';
  const root = [
    'souvenir3d-placement',
    compact ? 'souvenir3d-placement--compact' : '',
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
        {showMeshName && printArea.meshName ? ` · ${printArea.meshName}` : ''}
      </p>
    </div>
  );
};

export default SouvenirPlacementPreview;
