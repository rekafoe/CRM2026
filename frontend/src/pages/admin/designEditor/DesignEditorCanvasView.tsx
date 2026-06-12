import React, { type RefObject } from 'react';
import { PrepressOverlay } from './PrepressOverlay';
import { PhotoFieldCropModal } from './PhotoFieldCropModal';
import { PhotoFieldFillOverlay } from './PhotoFieldFillOverlay';
import {
  EditorInAppFieldSheets,
  type PhotoPickSheetState,
  type TextEditSheetState,
} from './EditorInAppFieldSheets';

export interface DesignEditorCanvasCropModalState {
  fieldId: string;
  previewUrl: string;
  frameW: number;
  frameH: number;
  iw: number;
  ih: number;
  panX: number;
  panY: number;
  zoom: number;
  fitMode: 'cover' | 'contain';
}

interface DesignEditorCanvasViewProps {
  canvasElRef: RefObject<HTMLCanvasElement>;
  photoFileInputRef: RefObject<HTMLInputElement>;
  showGuides: boolean;
  canvasWidthPx: number;
  pageWidthPx: number;
  pageHeightPx: number;
  bleedPx: number;
  safeZonePx: number;
  spreadPairPages: [number, number] | null;
  showBleed: boolean;
  showTrim: boolean;
  showSafeZone: boolean;
  localSnapLines: Array<{ axis: 'h' | 'v'; pos: number }>;
  photoFieldFillLoading: { progress: number } | null;
  cropModal: DesignEditorCanvasCropModalState | null;
  photoPickSheet: PhotoPickSheetState | null;
  textEditSheet: TextEditSheetState | null;
  onPhotoFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onCropClose: () => void;
  onCropApply: (panX: number, panY: number, zoom: number) => void;
  onCropReplaceFile: () => void;
  onPhotoPickClose: () => void;
  onPhotoSelected: (file: File) => void;
  onTextClose: () => void;
  onTextSave: (text: string) => void;
}

export const DesignEditorCanvasView: React.FC<DesignEditorCanvasViewProps> = ({
  canvasElRef,
  photoFileInputRef,
  showGuides,
  canvasWidthPx,
  pageWidthPx,
  pageHeightPx,
  bleedPx,
  safeZonePx,
  spreadPairPages,
  showBleed,
  showTrim,
  showSafeZone,
  localSnapLines,
  photoFieldFillLoading,
  cropModal,
  photoPickSheet,
  textEditSheet,
  onPhotoFileChange,
  onCropClose,
  onCropApply,
  onCropReplaceFile,
  onPhotoPickClose,
  onPhotoSelected,
  onTextClose,
  onTextSave,
}) => (
  <div className="fabric-canvas-outer">
    <div className="fabric-canvas-inner">
      <canvas ref={canvasElRef} />
      {showGuides && (
        <PrepressOverlay
          canvasWidthPx={canvasWidthPx}
          pageWidthPx={pageWidthPx}
          pageHeightPx={pageHeightPx}
          bleedPx={bleedPx}
          safeZonePx={safeZonePx}
          isSpreadView={spreadPairPages != null}
          showBleed={showBleed}
          showTrim={showTrim}
          showSafeZone={showSafeZone}
        />
      )}

      {localSnapLines.length > 0 && (
        <svg
          className="design-editor-snap-overlay"
          width={canvasWidthPx}
          height={pageHeightPx}
          aria-hidden
        >
          {localSnapLines.map((sl, i) =>
            sl.axis === 'v' ? (
              <line
                key={i}
                x1={sl.pos}
                y1={0}
                x2={sl.pos}
                y2={pageHeightPx}
                className="design-editor-snap-line"
              />
            ) : (
              <line
                key={i}
                x1={0}
                y1={sl.pos}
                x2={canvasWidthPx}
                y2={sl.pos}
                className="design-editor-snap-line"
              />
            ),
          )}
        </svg>
      )}
      {photoFieldFillLoading && (
        <PhotoFieldFillOverlay progress={photoFieldFillLoading.progress} />
      )}
    </div>
    <input
      ref={photoFileInputRef}
      type="file"
      accept="image/*,.heic,.heif"
      className="visually-hidden-file-input"
      aria-hidden
      tabIndex={-1}
      onChange={onPhotoFileChange}
    />
    {cropModal && (
      <PhotoFieldCropModal
        isOpen
        previewUrl={cropModal.previewUrl}
        frameW={cropModal.frameW}
        frameH={cropModal.frameH}
        intrinsicW={cropModal.iw}
        intrinsicH={cropModal.ih}
        initialPanX={cropModal.panX}
        initialPanY={cropModal.panY}
        initialZoom={cropModal.zoom}
        fitMode={cropModal.fitMode}
        onClose={onCropClose}
        onApply={onCropApply}
        onReplaceFile={onCropReplaceFile}
      />
    )}
    <EditorInAppFieldSheets
      photoPick={photoPickSheet}
      textEdit={textEditSheet}
      onPhotoClose={onPhotoPickClose}
      onPhotoSelected={(file) => onPhotoSelected(file)}
      onTextClose={onTextClose}
      onTextSave={onTextSave}
    />
  </div>
);
