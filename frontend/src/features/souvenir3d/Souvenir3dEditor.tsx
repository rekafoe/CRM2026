import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PublicDesignEditor } from '../publicDesignEditor/PublicDesignEditor';
import type { PublicDesignEditorAdapter } from '../publicDesignEditor/publicDesignEditorAdapter';
import type { PublicDesignPageCountLimits } from '../publicDesignEditor/usePublicDesignPageActions';
import { Souvenir3dPreview } from './Souvenir3dPreview';
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

function findFabricLowerCanvas(host: HTMLElement | null): HTMLCanvasElement | null {
  if (!host) return null;
  return host.querySelector('canvas.lower-canvas') as HTMLCanvasElement | null;
}

/**
 * Сувенирный редактор: Fabric (печать) + R3F mockup.
 * Production PDF строится только из designState — без 3D.
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
  onRequestTextureRefresh,
}) => {
  const areas = useMemo(() => normalizeAreas(printAreasProp), [printAreasProp]);
  const [activeId, setActiveId] = useState<string>(() => areas[0]?.id ?? 'front');
  const [localTexture, setLocalTexture] = useState<string | null>(null);
  const [textureRevision, setTextureRevision] = useState(0);
  const fabricHostRef = useRef<HTMLDivElement | null>(null);
  const lastCaptureSigRef = useRef<string>('');

  const active = resolveActivePrintArea(areas, activeId) ?? areas[0] ?? DEFAULT_PRINT_AREA_TSHIRT;

  useEffect(() => {
    if (!areas.some((a) => a.id === activeId) && areas[0]) {
      setActiveId(areas[0].id);
    }
  }, [areas, activeId]);

  useEffect(() => {
    if (textureFromParent != null) {
      setLocalTexture(textureFromParent);
      setTextureRevision((n) => n + 1);
    }
  }, [textureFromParent]);

  useEffect(() => {
    if (!onRequestTextureRefresh) return;
    const id = window.setInterval(() => onRequestTextureRefresh(), 1200);
    return () => window.clearInterval(id);
  }, [onRequestTextureRefresh]);

  const captureFabricTexture = useCallback(() => {
    if (textureFromParent != null) return;
    const lower = findFabricLowerCanvas(fabricHostRef.current);
    if (!lower || lower.width < 2 || lower.height < 2) return;
    try {
      const url = lower.toDataURL('image/jpeg', 0.82);
      // Дешёвый fingerprint: длина + куски data URL (полный === слишком дорогой).
      const contentSig = `${lower.width}x${lower.height}:${url.length}:${url.slice(22, 54)}:${url.slice(-32)}`;
      if (contentSig === lastCaptureSigRef.current) return;
      lastCaptureSigRef.current = contentSig;
      setLocalTexture(url);
      setTextureRevision((n) => n + 1);
    } catch {
      /* canvas may be tainted briefly during image load */
    }
  }, [textureFromParent]);

  useEffect(() => {
    if (textureFromParent != null) return;
    captureFabricTexture();
    const id = window.setInterval(captureFabricTexture, 400);
    return () => window.clearInterval(id);
  }, [captureFabricTexture, textureFromParent, activeId]);

  const setPlaceholderTexture = useCallback(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = Math.round(512 * (active.heightMm / Math.max(1, active.widthMm)));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#94a3b8';
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
    ctx.fillStyle = '#64748b';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Макет зоны печати', canvas.width / 2, canvas.height / 2);
    setLocalTexture(canvas.toDataURL('image/png'));
    setTextureRevision((n) => n + 1);
  }, [active.heightMm, active.widthMm]);

  useEffect(() => {
    if (!localTexture && textureFromParent == null) setPlaceholderTexture();
  }, [localTexture, textureFromParent, setPlaceholderTexture]);

  const textureSource = textureFromParent ?? localTexture;
  const mugDefault = active.procedural === 'mug' || active.id === 'wrap';

  return (
    <div className="souvenir3d-editor">
      {areas.length > 1 && (
        <div className="souvenir3d-editor__areas" role="tablist" aria-label="Зоны печати">
          {areas.map((area) => (
            <button
              key={area.id}
              type="button"
              role="tab"
              className={`souvenir3d-editor__area-btn${area.id === active.id ? ' souvenir3d-editor__area-btn--active' : ''}`}
              aria-selected={area.id === active.id}
              onClick={() => setActiveId(area.id)}
            >
              {area.label}
            </button>
          ))}
        </div>
      )}
      <div className="souvenir3d-editor__layout">
        <div className="souvenir3d-editor__fabric" ref={fabricHostRef}>
          <PublicDesignEditor
            templateId={templateId}
            initialDraftToken={initialDraftToken}
            onDraftTokenChange={onDraftTokenChange}
            adapter={adapter}
            documentMode="single"
            draftMode="souvenir_3d"
            draftPayloadExtras={{
              editorKind: 'souvenir_3d',
              printAreas: areas,
            }}
            showFinalizeButton={showFinalizeButton}
            onReadyForCart={onReadyForCart}
            showClientActionBar={showClientActionBar}
            orderButtonLabel={orderButtonLabel}
            selectedParams={selectedParams}
            pageCountLimits={pageCountLimits}
            onPageCountChange={onPageCountChange}
          />
        </div>
        <aside className="souvenir3d-editor__preview-pane" aria-label="3D-превью">
          <Souvenir3dPreview
            printArea={
              active.procedural || active.modelUrl
                ? active
                : { ...active, procedural: mugDefault ? 'mug' : 'tshirt' }
            }
            textureSource={textureSource}
            textureRevision={textureRevision}
          />
        </aside>
      </div>
    </div>
  );
};

export { DEFAULT_PRINT_AREA_MUG, DEFAULT_PRINT_AREA_TSHIRT };
export default Souvenir3dEditor;
