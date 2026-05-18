import React, { useCallback, useMemo, useState, type RefObject } from 'react';
import type { DesignEditorCanvasHandle } from '../../pages/admin/designEditor/DesignEditorCanvas';
import type { PageSaveSnapshot } from '../../pages/admin/designEditor/mergePagesSnapshot';
import { mergeSavedEditorPages } from '../../pages/admin/designEditor/designEditorState';
import {
  extractUsedFontFamiliesFromPages,
  patchAllTextInFabricJSON,
} from '../../pages/admin/designEditor/patchFabricTextObjects';
import { TEXT_FONTS } from '../../pages/admin/designEditor/constants';
import type {
  DesignPage,
  SelectedObjProps,
} from '../../pages/admin/designEditor/types';
import { ClientBackgroundToolPanel } from './ClientBackgroundToolPanel';
import { ClientObjectToolPanel, type ClientObjectAction } from './ClientObjectToolPanel';
import { ClientPagesToolPanel } from './ClientPagesToolPanel';
import { ClientPhotoFieldsToolPanel } from './ClientPhotoFieldsToolPanel';
import { ClientShapesToolPanel } from './ClientShapesToolPanel';
import { ClientTextToolPanel } from './ClientTextToolPanel';

type ClientToolSection = 'text' | 'photoFields' | 'shapes' | 'background' | 'object' | 'pages';

interface ToolSectionConfig {
  id: ClientToolSection;
  label: string;
  hint: string;
  icon: React.ReactNode;
}

interface PublicDesignAdvancedToolsProps {
  canvasHandleRef: RefObject<DesignEditorCanvasHandle | null>;
  selectedObj: SelectedObjProps | null;
  pages: DesignPage[];
  setPages: React.Dispatch<React.SetStateAction<DesignPage[]>>;
  currentPage: number;
  leftPageIdx: number;
  rightPageIdx: number;
  onDirty: () => void;
}

const TOOL_SECTIONS: ToolSectionConfig[] = [
  { id: 'text', label: 'Текст', hint: 'Изменить текст', icon: <IconText /> },
  { id: 'photoFields', label: 'Фото/поля', hint: 'Добавить место для фото', icon: <IconPhotoField /> },
  { id: 'shapes', label: 'Фигуры', hint: 'Добавить фигуру', icon: <IconShape /> },
  { id: 'background', label: 'Фон', hint: 'Фон страницы', icon: <IconFill /> },
  { id: 'object', label: 'Слои/объект', hint: 'Настроить выбранный объект', icon: <IconObject /> },
  { id: 'pages', label: 'Страницы', hint: 'Перейти к карте макета', icon: <IconPages /> },
];

export const PublicDesignAdvancedTools: React.FC<PublicDesignAdvancedToolsProps> = ({
  canvasHandleRef,
  selectedObj,
  pages,
  setPages,
  currentPage,
  leftPageIdx,
  rightPageIdx,
  onDirty,
}) => {
  const [section, setSection] = useState<ClientToolSection | null>(null);
  const usedFonts = useMemo(() => extractUsedFontFamiliesFromPages(pages), [pages]);
  const fontOptions = useMemo(() => {
    const defaults = TEXT_FONTS.map((font) => font.value);
    return Array.from(new Set([...defaults, ...usedFonts]));
  }, [usedFonts]);

  const applyTextPatch = useCallback(
    async (patch: Record<string, unknown>) => {
      const handle = canvasHandleRef.current;
      if (!handle) return;
      if (selectedObj?.type === 'IText') {
        handle.applyTextPropsToSelection(patch);
        onDirty();
        return;
      }
      const saved = await handle.saveCurrentPage();
      const merged = mergeSavedEditorPages(
        pages,
        saved as PageSaveSnapshot,
        currentPage,
        leftPageIdx,
        rightPageIdx,
      );
      const nextPages = merged.map((page) => ({
        fabricJSON: patchAllTextInFabricJSON(page.fabricJSON, patch),
      }));
      setPages(nextPages);
      await handle.applyEditorViewState(nextPages);
      onDirty();
    },
    [canvasHandleRef, currentPage, leftPageIdx, onDirty, pages, rightPageIdx, selectedObj?.type, setPages],
  );

  const handleAddPhotoField = useCallback((options?: { width?: number; height?: number }) => {
    canvasHandleRef.current?.addPhotoField(options);
    onDirty();
  }, [canvasHandleRef, onDirty]);

  const handleAutofillPhotos = useCallback(async () => {
    await canvasHandleRef.current?.autofillPhotoFields();
    onDirty();
  }, [canvasHandleRef, onDirty]);

  const handleAddShape = useCallback((type: 'rect' | 'circle' | 'line' | 'triangle') => {
    canvasHandleRef.current?.addShape(type);
    onDirty();
  }, [canvasHandleRef, onDirty]);

  const handleBackgroundSet = useCallback((color: string) => {
    canvasHandleRef.current?.setCanvasBackground(color);
    onDirty();
  }, [canvasHandleRef, onDirty]);

  const handleBackgroundClear = useCallback(() => {
    canvasHandleRef.current?.clearCanvasBackground();
    onDirty();
  }, [canvasHandleRef, onDirty]);

  const handleObjectAction = useCallback((action: ClientObjectAction) => {
    const handle = canvasHandleRef.current;
    if (!handle) return;
    if (action === 'duplicate') handle.duplicateSelected();
    if (action === 'delete') handle.deleteSelected();
    if (action === 'forward') handle.bringForward();
    if (action === 'backward') handle.sendBackward();
    onDirty();
  }, [canvasHandleRef, onDirty]);

  return (
    <section className="public-design-editor__advanced-tools" aria-label="Инструменты макета">
      <div className="public-design-editor__advanced-tabs">
        {TOOL_SECTIONS.map((item) => (
          <div key={item.id} className="public-design-editor__advanced-tool-wrap">
            <button
              type="button"
              className={`public-design-editor__advanced-tab${section === item.id ? ' public-design-editor__advanced-tab--active' : ''}`}
              onClick={() => setSection((current) => (current === item.id ? null : item.id))}
              title={item.hint}
              aria-label={`${item.label}: ${item.hint}`}
            >
              {item.icon}
              <span className="public-design-editor__advanced-tab-label">{item.label}</span>
            </button>
            {section === item.id && (
              <div className="public-design-editor__advanced-panel" role="dialog" aria-label={item.label}>
                <div className="public-design-editor__advanced-panel-head">
                  <span>{item.label}</span>
                  <strong>{item.hint}</strong>
                </div>
                {section === 'photoFields' ? (
                  <ClientPhotoFieldsToolPanel
                    onAddPhotoField={handleAddPhotoField}
                    onAutofillPhotos={() => void handleAutofillPhotos()}
                    onClose={() => setSection(null)}
                  />
                ) : section === 'pages' ? (
                  <ClientPagesToolPanel onClose={() => setSection(null)} />
                ) : section === 'text' ? (
                  <ClientTextToolPanel
                    selectedObj={selectedObj}
                    fontOptions={fontOptions}
                    onAddTextPreset={(kind) => canvasHandleRef.current?.addTextPreset(kind)}
                    onTextChange={(text) => {
                      canvasHandleRef.current?.setTextProp('text', text);
                      onDirty();
                    }}
                    onPatchText={(patch) => void applyTextPatch(patch)}
                  />
                ) : section === 'shapes' ? (
                  <ClientShapesToolPanel onAddShape={handleAddShape} />
                ) : section === 'background' ? (
                  <ClientBackgroundToolPanel onSetBackground={handleBackgroundSet} onClearBackground={handleBackgroundClear} />
                ) : (
                  <ClientObjectToolPanel
                    selectedObj={selectedObj}
                    onAction={handleObjectAction}
                  />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

function ToolIcon({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <svg className="public-design-editor__advanced-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

function IconPhotoField(): JSX.Element {
  return (
    <ToolIcon>
      <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M7 15l3.2-3 2.4 2.2 2-1.8L18 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="9" r="1.2" fill="currentColor" />
    </ToolIcon>
  );
}

function IconText(): JSX.Element {
  return (
    <ToolIcon>
      <path d="M5 6h14M12 6v12M9 18h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </ToolIcon>
  );
}

function IconShape(): JSX.Element {
  return (
    <ToolIcon>
      <rect x="4" y="5" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M15 10l5 8h-10l5-8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </ToolIcon>
  );
}

function IconGrid(): JSX.Element {
  return (
    <ToolIcon>
      <path d="M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </ToolIcon>
  );
}

function IconObject(): JSX.Element {
  return (
    <ToolIcon>
      <rect x="6" y="6" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M4 10V4h6M20 14v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </ToolIcon>
  );
}

function IconFill(): JSX.Element {
  return (
    <ToolIcon>
      <path d="M6 13l6-6 6 6-6 6-6-6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M18 18h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </ToolIcon>
  );
}

function IconPages(): JSX.Element {
  return (
    <ToolIcon>
      <rect x="5" y="4" width="10" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M9 20h8a2 2 0 0 0 2-2V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </ToolIcon>
  );
}
