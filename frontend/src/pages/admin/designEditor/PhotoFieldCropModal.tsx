import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common';
import {
  clampPhotoFieldPan,
  computePhotoFieldCropSource,
  computePhotoFieldLayout,
  normalizePhotoFieldZoom,
  PHOTO_FIELD_ZOOM_MAX,
  zoomPhotoFieldLayout,
} from './photoFieldLayout';
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
  initialZoom: number;
  onApply: (panX: number, panY: number, zoom: number) => void;
  onReplaceFile: () => void;
  fitMode: PhotoFieldFitMode;
}

const EDITOR_MAX_W = 720;
const EDITOR_MAX_H = 580;
const PREVIEW_MIN_MARGIN = 56;
const MOBILE_BREAKPOINT_PX = 720;
/** Шапка модалки + подзаголовок + кнопки (мобильная колонка). */
const MOBILE_MODAL_CHROME_PX = 300;
const MIN_CROP_SOURCE_PX = 80;
const MAX_ZOOM = PHOTO_FIELD_ZOOM_MAX;

function useCropEditorViewportBounds(isOpen: boolean) {
  const [bounds, setBounds] = useState({ maxW: EDITOR_MAX_W, maxH: EDITOR_MAX_H });

  useEffect(() => {
    if (!isOpen) return;
    const update = () => {
      const vv = window.visualViewport;
      const vw = vv?.width ?? window.innerWidth;
      const vh = vv?.height ?? window.innerHeight;
      const mobile = vw <= MOBILE_BREAKPOINT_PX;
      const margin = mobile ? 20 : PREVIEW_MIN_MARGIN;
      const chrome = mobile ? MOBILE_MODAL_CHROME_PX : 140;
      setBounds({
        maxW: Math.min(EDITOR_MAX_W, vw - margin),
        maxH: Math.min(EDITOR_MAX_H, mobile ? Math.max(180, vh - chrome) : vh * 0.68),
      });
    };
    update();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [isOpen]);

  return bounds;
}

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
  initialZoom,
  onApply,
  onReplaceFile,
  fitMode,
}) => {
  const [panX, setPanX] = useState(initialPanX);
  const [panY, setPanY] = useState(initialPanY);
  const [zoom, setZoom] = useState(initialZoom);

  const sourceDrag = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    baseSourceX: number;
    baseSourceY: number;
  } | null>(null);
  const cropResize = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    baseSourceX: number;
    baseSourceY: number;
    baseSourceW: number;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPanX(initialPanX);
      setPanY(initialPanY);
      setZoom(initialZoom);
    }
  }, [isOpen, initialPanX, initialPanY, initialZoom]);

  const baseLayout = useMemo(
    () => computePhotoFieldLayout(fitMode, frameW, frameH, intrinsicW, intrinsicH),
    [fitMode, frameW, frameH, intrinsicW, intrinsicH],
  );

  const layout = useMemo(
    () => zoomPhotoFieldLayout(baseLayout, zoom),
    [baseLayout, zoom],
  );

  const viewportBounds = useCropEditorViewportBounds(isOpen);

  const { editorW, editorH, sourceScale } = useMemo(() => {
    const nextSourceScale = Math.min(
      viewportBounds.maxW / Math.max(1, intrinsicW),
      viewportBounds.maxH / Math.max(1, intrinsicH),
    );
    return {
      editorW: intrinsicW * nextSourceScale,
      editorH: intrinsicH * nextSourceScale,
      sourceScale: nextSourceScale,
    };
  }, [intrinsicW, intrinsicH, viewportBounds]);

  const clamped = clampPhotoFieldPan(frameW, frameH, layout, panX, panY, fitMode);
  const applySourceCrop = useCallback((sourceX: number, sourceY: number, nextZoom = zoom) => {
    const safeZoom = normalizePhotoFieldZoom(nextZoom);
    const nextLayout = zoomPhotoFieldLayout(baseLayout, safeZoom);
    const cropW = frameW / nextLayout.scale;
    const cropH = frameH / nextLayout.scale;
    const clampedSourceX = Math.max(0, Math.min(Math.max(0, intrinsicW - cropW), sourceX));
    const clampedSourceY = Math.max(0, Math.min(Math.max(0, intrinsicH - cropH), sourceY));
    const next = clampPhotoFieldPan(
      frameW,
      frameH,
      nextLayout,
      -(clampedSourceX * nextLayout.scale) - nextLayout.baseLeft,
      -(clampedSourceY * nextLayout.scale) - nextLayout.baseTop,
      fitMode,
    );
    setZoom(safeZoom);
    setPanX(next.panX);
    setPanY(next.panY);
  }, [baseLayout, fitMode, frameW, frameH, intrinsicW, intrinsicH, zoom]);

  const endDrag = useCallback(() => {
    sourceDrag.current = null;
    cropResize.current = null;
  }, []);

  const cropSource = useMemo(
    () => computePhotoFieldCropSource(
      frameW,
      frameH,
      intrinsicW,
      intrinsicH,
      layout,
      clamped.panX,
      clamped.panY,
      fitMode,
    ),
    [clamped.panX, clamped.panY, fitMode, frameW, frameH, intrinsicW, intrinsicH, layout],
  );

  const editorVars = useMemo(() => ({
    ['--pf-source-w' as string]: `${editorW}px`,
    ['--pf-source-h' as string]: `${editorH}px`,
    ['--pf-crop-l' as string]: `${cropSource.x * sourceScale}px`,
    ['--pf-crop-t' as string]: `${cropSource.y * sourceScale}px`,
    ['--pf-crop-w' as string]: `${cropSource.w * sourceScale}px`,
    ['--pf-crop-h' as string]: `${cropSource.h * sourceScale}px`,
  }), [cropSource, editorW, editorH, sourceScale]);

  const moveSourceCrop = useCallback((clientX: number, clientY: number) => {
    const d = sourceDrag.current;
    if (!d?.active || fitMode === 'contain') return;
    const dx = (clientX - d.startX) / sourceScale;
    const dy = (clientY - d.startY) / sourceScale;
    const nextSourceX = d.baseSourceX + dx;
    const nextSourceY = d.baseSourceY + dy;
    applySourceCrop(nextSourceX, nextSourceY);
  }, [applySourceCrop, fitMode, sourceScale]);

  const moveCropResize = useCallback((clientX: number, clientY: number) => {
    const d = cropResize.current;
    if (!d?.active || fitMode === 'contain') return;
    const aspect = frameW / Math.max(1, frameH);
    const dx = (clientX - d.startX) / sourceScale;
    const dy = (clientY - d.startY) / sourceScale;
    const requestedW = d.baseSourceW + Math.max(dx, dy * aspect);
    const maxWByBounds = Math.min(intrinsicW - d.baseSourceX, (intrinsicH - d.baseSourceY) * aspect);
    const maxWByZoom = frameW / baseLayout.scale;
    const minWByZoom = frameW / (baseLayout.scale * MAX_ZOOM);
    const nextW = Math.max(
      Math.max(MIN_CROP_SOURCE_PX, minWByZoom),
      Math.min(Math.min(maxWByBounds, maxWByZoom), requestedW),
    );
    const nextZoom = frameW / (nextW * baseLayout.scale);
    applySourceCrop(d.baseSourceX, d.baseSourceY, nextZoom);
  }, [applySourceCrop, baseLayout.scale, fitMode, frameW, frameH, intrinsicW, intrinsicH, sourceScale]);

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
      ? 'Фото уже видно целиком. Если нужно, замените изображение или примените текущий кадр.'
      : 'Передвиньте рамку, чтобы выбрать фрагмент. Потяните угол рамки, чтобы изменить масштаб.';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Настроить кадр"
      size="lg"
      className="photo-field-crop-modal"
      overlayClassName="photo-field-crop-backdrop"
      headerClassName="photo-field-crop-modal-head"
      bodyClassName="photo-field-crop-modal-body"
    >
      <div className="photo-field-crop-header">
        <span>{fitMode === 'contain' ? 'Фото видно целиком' : 'Выберите область фото'}</span>
        <p>{hint}</p>
      </div>
      <div className="photo-field-crop-editor" style={editorVars} aria-label="Область кадрирования фото">
        <img src={previewUrl} alt="" draggable={false} />
        <div
          className="photo-field-source-crop"
          role="presentation"
          onPointerDown={(event) => {
            if (fitMode === 'contain') return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            sourceDrag.current = {
              active: true,
              startX: event.clientX,
              startY: event.clientY,
              baseSourceX: cropSource.x,
              baseSourceY: cropSource.y,
            };
          }}
          onPointerMove={(event) => {
            moveSourceCrop(event.clientX, event.clientY);
            moveCropResize(event.clientX, event.clientY);
          }}
          onPointerUp={endDrag}
        >
          <span>видимая область</span>
          {fitMode !== 'contain' && (
            <button
              type="button"
              className="photo-field-source-resize"
              aria-label="Изменить размер видимой области"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                cropResize.current = {
                  active: true,
                  startX: event.clientX,
                  startY: event.clientY,
                  baseSourceX: cropSource.x,
                  baseSourceY: cropSource.y,
                  baseSourceW: cropSource.w,
                };
              }}
            />
          )}
        </div>
      </div>
      <div className="photo-field-crop-actions">
        <div className="photo-field-crop-actions-left">
          <Button type="button" variant="secondary" onClick={() => applySourceCrop(0, 0, 1)}>
            Сбросить кадр
          </Button>
          <Button type="button" variant="secondary" onClick={onReplaceFile}>
            Другое фото
          </Button>
        </div>
        <div className="photo-field-crop-actions-right">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              onApply(clamped.panX, clamped.panY, zoom);
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
