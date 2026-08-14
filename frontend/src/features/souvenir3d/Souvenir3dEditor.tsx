import React, { useEffect, useMemo, useRef } from 'react';
import type { PublicDesignEditorAdapter } from '../publicDesignEditor/publicDesignEditorAdapter';
import type { PublicDesignPageCountLimits } from '../publicDesignEditor/usePublicDesignPageActions';
import { SouvenirObjectToolbar } from './SouvenirObjectToolbar';
import { Souvenir3dPreview } from './Souvenir3dPreview';
import { useSouvenirFabricEditor } from './useSouvenirFabricEditor';
import {
  DEFAULT_PRINT_AREA_MUG,
  DEFAULT_PRINT_AREA_TSHIRT,
  parsePrintAreas,
  resolveActivePrintArea,
  type PrintAreaConfig,
} from './types';
import './souvenir3dPreview.css';

export type Souvenir3dEditorProps = {
  templateId: number;
  initialDraftToken?: string | null;
  onDraftTokenChange?: (token: string) => void;
  adapter?: PublicDesignEditorAdapter;
  showFinalizeButton?: boolean;
  onReadyForCart?: (draftToken: string) => void | Promise<void>;
  showClientActionBar?: boolean;
  orderButtonLabel?: string;
  selectedParams?: Record<string, unknown>;
  pageCountLimits?: PublicDesignPageCountLimits;
  onPageCountChange?: (pageCount: number) => void;
  /** Зоны из продукта (simplified.printAreas). */
  printAreas?: PrintAreaConfig[] | unknown;
  /** Периодический снимок Fabric canvas для texture (data URL). */
  textureDataUrl?: string | null;
  /** Колбэк: редактор просит внешний poll texture (опционально). */
  onRequestTextureRefresh?: () => void;
};

function normalizeAreas(raw: PrintAreaConfig[] | unknown | undefined): PrintAreaConfig[] {
  if (Array.isArray(raw) && raw.length > 0 && typeof (raw[0] as PrintAreaConfig)?.meshName === 'string') {
    return raw as PrintAreaConfig[];
  }
  const parsed = parsePrintAreas(raw);
  if (parsed.length > 0) return parsed;
  return [DEFAULT_PRINT_AREA_TSHIRT];
}

/**
 * Единственная видимая рабочая поверхность — 3D-модель.
 * Невидимый Fabric остаётся источником production designState.
 */
export const Souvenir3dEditor: React.FC<Souvenir3dEditorProps> = ({
  templateId,
  initialDraftToken,
  onDraftTokenChange,
  adapter,
  showFinalizeButton,
  onReadyForCart,
  showClientActionBar,
  orderButtonLabel,
  selectedParams,
  pageCountLimits,
  onPageCountChange,
  printAreas: printAreasProp,
  textureDataUrl: textureFromParent,
}) => {
  const areas = useMemo(() => normalizeAreas(printAreasProp), [printAreasProp]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const editor = useSouvenirFabricEditor({
    templateId,
    areas,
    initialDraftToken,
    onDraftTokenChange,
    adapter,
    selectedParams,
    onReadyForCart,
  });
  const active = resolveActivePrintArea(areas, editor.activeAreaId)
    ?? areas[0]
    ?? DEFAULT_PRINT_AREA_TSHIRT;

  useEffect(() => {
    onPageCountChange?.(areas.length);
  }, [areas.length, onPageCountChange]);

  void pageCountLimits;
  const textureSource = textureFromParent ?? editor.textureSource;
  const mugDefault = active.procedural === 'mug' || active.id === 'wrap';
  const showActions = showClientActionBar || showFinalizeButton || Boolean(onReadyForCart);

  return (
    <div className="souvenir3d-editor">
      <div className="souvenir3d-editor__toolbar">
        <div className="souvenir3d-editor__areas" role="tablist" aria-label="Зоны печати">
          {areas.map((area) => (
            <button
              key={area.id}
              type="button"
              role="tab"
              className={`souvenir3d-editor__area-btn${area.id === active.id ? ' souvenir3d-editor__area-btn--active' : ''}`}
              aria-selected={area.id === active.id}
              onClick={() => void editor.switchArea(area.id)}
            >
              {area.label}
              {editor.usedPrintAreaIds.includes(area.id) && <span aria-label="Область используется">●</span>}
            </button>
          ))}
        </div>
        <div className="souvenir3d-editor__insert-tools">
          <button type="button" onClick={editor.addText} disabled={editor.loading}>+ Текст</button>
          <button type="button" onClick={() => photoInputRef.current?.click()} disabled={editor.loading}>+ Фото</button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void editor.addPhoto(file);
              event.target.value = '';
            }}
          />
        </div>
        {showActions && (
          <div className="souvenir3d-editor__actions">
            <button type="button" disabled={editor.saving} onClick={() => void editor.save().catch(() => undefined)}>
              {editor.saving ? 'Сохранение…' : 'Сохранить'}
            </button>
            {onReadyForCart && (
              <button type="button" className="souvenir3d-editor__order" disabled={editor.saving} onClick={() => void editor.readyForCart()}>
                {orderButtonLabel || 'Заказать'}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="souvenir3d-editor__stage">
        <Souvenir3dPreview
          printArea={
            active.procedural || active.modelUrl
              ? active
              : { ...active, procedural: mugDefault ? 'mug' : 'tshirt' }
          }
          textureSource={textureSource}
          textureRevision={editor.textureRevision}
          onSurfacePointer={editor.onSurfacePointer}
          orbitEnabled={!editor.orbitLocked}
          caption={`${active.label} · ${active.widthMm}×${active.heightMm} мм · ${editor.selected ? 'Редактирование объекта' : 'Потяните модель для вращения'}`}
        />
        {editor.loading && <div className="souvenir3d-editor__state">Загрузка 3D-редактора…</div>}
        {editor.error && <div className="souvenir3d-editor__message souvenir3d-editor__message--error">{editor.error}</div>}
        {editor.status && <div className="souvenir3d-editor__message">{editor.status}</div>}
      </div>

      <div className="souvenir3d-editor__hidden-fabric" aria-hidden="true">
        <canvas ref={editor.canvasElementRef} />
      </div>

      <SouvenirObjectToolbar
        selected={editor.selected}
        anchor={editor.toolbarAnchor}
        onTextChange={editor.updateText}
        onOpacityChange={editor.updateOpacity}
        onScale={editor.scaleSelected}
        onRotate={editor.rotateSelected}
        onReplacePhoto={(file) => void editor.replacePhoto(file)}
        onCrop={editor.cropSelected}
        onBringForward={editor.bringForward}
        onSendBackward={editor.sendBackward}
        onDelete={editor.deleteSelected}
      />
    </div>
  );
};

export { DEFAULT_PRINT_AREA_MUG, DEFAULT_PRINT_AREA_TSHIRT };
export default Souvenir3dEditor;
