import React from 'react';
import type { TextBlockPresetKind } from '../../pages/admin/designEditor/constants';
import type { SelectedObjProps } from '../../pages/admin/designEditor/types';

interface ClientTextToolPanelProps {
  selectedObj: SelectedObjProps | null;
  fontOptions: string[];
  onAddTextPreset: (kind: TextBlockPresetKind) => void;
  onTextChange: (text: string) => void;
  onPatchText: (patch: Record<string, unknown>) => void;
}

export const ClientTextToolPanel: React.FC<ClientTextToolPanelProps> = ({
  selectedObj,
  fontOptions,
  onAddTextPreset,
  onTextChange,
  onPatchText,
}) => (
  <div className="public-design-editor__client-tool-card">
    {selectedObj?.type === 'IText' ? (
      <>
        <label className="public-design-editor__client-tool-field">
          <span>Текст</span>
          <textarea
            value={selectedObj.text ?? ''}
            rows={3}
            onChange={(event) => onTextChange(event.target.value)}
          />
        </label>
        <div className="public-design-editor__client-tool-row">
          <label className="public-design-editor__client-tool-field">
            <span>Шрифт</span>
            <select
              value={selectedObj.fontFamily ?? 'Arial'}
              onChange={(event) => onPatchText({ fontFamily: event.target.value })}
            >
              {fontOptions.map((fontFamily) => (
                <option key={fontFamily} value={fontFamily}>{fontFamily}</option>
              ))}
            </select>
          </label>
          <label className="public-design-editor__client-tool-field public-design-editor__client-tool-field--small">
            <span>Размер</span>
            <input
              type="number"
              min={8}
              max={180}
              value={Math.round(selectedObj.fontSize ?? 24)}
              onChange={(event) => onPatchText({ fontSize: Number(event.target.value) || 24 })}
            />
          </label>
        </div>
        <label className="public-design-editor__client-tool-field public-design-editor__client-tool-field--color">
          <span>Цвет</span>
          <input
            type="color"
            value={normalizeHexColor(selectedObj.fill)}
            onChange={(event) => onPatchText({ fill: event.target.value })}
          />
        </label>
      </>
    ) : (
      <>
        <p>Выберите текст на макете или добавьте новый блок.</p>
        <div className="public-design-editor__client-tool-actions">
          <button type="button" className="public-design-editor__client-tool-primary" onClick={() => onAddTextPreset('body')}>
            + Текст
          </button>
          <button type="button" className="public-design-editor__client-tool-secondary" onClick={() => onAddTextPreset('heading')}>
            + Заголовок
          </button>
        </div>
      </>
    )}
  </div>
);

function normalizeHexColor(value: unknown): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#111827';
}
