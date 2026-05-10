import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common';
import { clampPhotoFieldPan, computePhotoFieldLayout } from './photoFieldLayout';
import type { PhotoFieldFitMode } from './photoFieldLayout';
import './PhotoFieldCropModal.css';

export interface PhotoFieldCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  previewUrl: string;
  frameW: number;
  frameH: number;
  intrinsicW: number;
  intrinsicH: number;
  initialPanX: number;
  initialPanY: number;
  onApply: (panX: number, panY: number) => void;
  onReplaceFile: () => void;
  fitMode: PhotoFieldFitMode;
}

const PREVIEW_MAX = 360;

export const PhotoFieldCropModal: React.FC<PhotoFieldCropModalProps> = ({
  isOpen,
  onClose,
  previewUrl,
  frameW,
  frameH,
  intrinsicW,
  intrinsicH,
  initialPanX,
  initialPanY,
  onApply,
  onReplaceFile,
  fitMode,
}) => {
  const [panX, setPanX] = useState(initialPanX);
  const [panY, setPanY] = useState(initialPanY);
  const panRef = useRef({ x: initialPanX, y: initialPanY });
  useEffect(() => {
    panRef.current = { x: panX, y: panY };
  }, [panX, panY]);

  const drag = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    basePX: number;
    basePY: number;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPanX(initialPanX);
      setPanY(initialPanY);
      panRef.current = { x: initialPanX, y: initialPanY };
    }
  }, [isOpen, initialPanX, initialPanY]);

  const layout = useMemo(
    () => computePhotoFieldLayout(fitMode, frameW, frameH, intrinsicW, intrinsicH),
    [fitMode, frameW, frameH, intrinsicW, intrinsicH],
  );

  const { previewW, previewH, scale } = useMemo(() => {
    const asp = frameW / Math.max(1, frameH);
    const maxW =
      typeof window !== 'undefined' ? Math.min(PREVIEW_MAX, window.innerWidth - 48) : PREVIEW_MAX;
    let w = Math.min(PREVIEW_MAX, maxW);
    let h = w / asp;
    if (h > PREVIEW_MAX) {
      h = PREVIEW_MAX;
      w = h * asp;
    }
    return { previewW: w, previewH: h, scale: w / Math.max(1, frameW) };
  }, [frameW, frameH]);

  const clamped = clampPhotoFieldPan(frameW, frameH, layout, panX, panY, fitMode);

  const endDrag = useCallback(() => {
    drag.current = null;
  }, []);

  const moveDrag = useCallback(
    (clientX: number, clientY: number) => {
      const d = drag.current;
      if (!d?.active) return;
      const dx = (clientX - d.startX) / scale;
      const dy = (clientY - d.startY) / scale;
      const next = clampPhotoFieldPan(
        frameW,
        frameH,
        layout,
        d.basePX + dx,
        d.basePY + dy,
        fitMode,
      );
      setPanX(next.panX);
      setPanY(next.panY);
    },
    [layout, frameW, frameH, scale, fitMode],
  );

  const frameVars = useMemo(() => {
    const imw = layout.displayW * scale;
    const imh = layout.displayH * scale;
    const iml = (layout.baseLeft + clamped.panX) * scale;
    const imt = (layout.baseTop + clamped.panY) * scale;
    return {
      ['--pf-frame-w' as string]: `${previewW}px`,
      ['--pf-frame-h' as string]: `${previewH}px`,
      ['--pf-img-w' as string]: `${imw}px`,
      ['--pf-img-h' as string]: `${imh}px`,
      ['--pf-img-l' as string]: `${iml}px`,
      ['--pf-img-t' as string]: `${imt}px`,
    };
  }, [layout, scale, previewW, previewH, clamped.panX, clamped.panY]);

  useEffect(() => {
    if (!isOpen) return;
    const up = () => endDrag();
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [isOpen, endDrag]);

  const hint =
    fitMode === 'contain'
      ? 'Перетащите фото, чтобы сдвинуть его внутри рамки (вписывание целиком без обрезки; рамка задаёт пропорции ячейки).'
      : 'Перетащите фото, чтобы выбрать видимую область (заполнение рамки с обрезкой). Растягивание отключено.';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Кадрирование в поле фото"
      size="md"
      className="photo-field-crop-modal"
      bodyClassName="photo-field-crop-modal-body"
    >
      <p className="photo-field-crop-hint">{hint}</p>
      <div className="photo-field-crop-visual">
        <div
          className="photo-field-crop-frame"
          style={frameVars}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            const { x, y } = panRef.current;
            drag.current = {
              active: true,
              startX: e.clientX,
              startY: e.clientY,
              basePX: x,
              basePY: y,
            };
          }}
          onPointerMove={(e) => {
            if (drag.current?.active) moveDrag(e.clientX, e.clientY);
          }}
          onPointerUp={endDrag}
        >
          <img className="photo-field-crop-img" src={previewUrl} alt="" draggable={false} />
        </div>
      </div>
      <div className="photo-field-crop-actions">
        <Button type="button" variant="secondary" onClick={onReplaceFile}>
          Другое фото…
        </Button>
        <div className="photo-field-crop-actions-right">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              onApply(clamped.panX, clamped.panY);
              onClose();
            }}
          >
            Применить
          </Button>
        </div>
      </div>
    </Modal>
  );
};
