import React, { useEffect, useState } from 'react';
import { AppIcon } from '../../../../components/ui/AppIcon';
import { Button } from '../../../../components/common';
import { Modal } from '../../../../components/common/Modal';
import { TEXT_BLOCK_PRESETS, type TextBlockPresetKind } from '../constants';
import { findFontCatalogEntry } from '../fontsCatalog';
import type { SelectedObjProps, TextEffectsValues } from '../types';
import { FontLibraryView } from './FontLibraryView';
import './TextPanel.css';

interface TextPanelProps {
  onClose: () => void;
  selectedObj: SelectedObjProps | null;
  /** Уникальные fontFamily по всем страницам макета (блок «Используемые шрифты»). */
  usedFonts: string[];
  onTextChange: (text: string) => void;
  onAddTextPreset: (kind: TextBlockPresetKind) => void;
  onApplyFont: (fontFamily: string) => void;
  onApplyTextColor: (fill: string) => void;
  onApplyEffects: (v: TextEffectsValues) => void;
}

const defaultEffects = (): TextEffectsValues => ({
  opacity: 1,
  stroke: '#64748b',
  strokeWidth: 0,
  softShadow: false,
});

export const TextPanel: React.FC<TextPanelProps> = ({
  onClose,
  selectedObj,
  usedFonts,
  onTextChange,
  onAddTextPreset,
  onApplyFont,
  onApplyTextColor,
  onApplyEffects,
}) => {
  const isText = selectedObj?.type === 'IText';
  const scopeLabel = isText ? 'выделенный текст' : 'весь текст проекта (все страницы)';

  const [fontOpen, setFontOpen] = useState(false);
  /** Выбранный шрифт для глобального применения — ждём подтверждения в модалке. */
  const [globalFontConfirmFamily, setGlobalFontConfirmFamily] = useState<string | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const [fxOpen, setFxOpen] = useState(false);

  const [colorDraft, setColorDraft] = useState('#111827');
  const [fxDraft, setFxDraft] = useState<TextEffectsValues>(defaultEffects);

  const currentFontFamily =
    isText && selectedObj?.fontFamily ? selectedObj.fontFamily : undefined;

  useEffect(() => {
    if (colorOpen) {
      const f =
        isText && selectedObj?.fill && selectedObj.fill !== 'transparent'
          ? selectedObj.fill
          : '#111827';
      setColorDraft(f);
    }
  }, [colorOpen, isText, selectedObj?.fill]);

  useEffect(() => {
    if (fxOpen) {
      if (isText && selectedObj) {
        setFxDraft({
          opacity: selectedObj.opacity ?? 1,
          stroke: selectedObj.stroke && selectedObj.stroke !== 'transparent' ? selectedObj.stroke : '#64748b',
          strokeWidth: selectedObj.strokeWidth ?? 0,
          softShadow: false,
        });
      } else {
        setFxDraft(defaultEffects());
      }
    }
  }, [fxOpen, isText, selectedObj]);

  return (
    <div
      className={`design-editor-panel-content text-panel-v2${
        fontOpen ? ' text-panel-v2--font-library' : ''
      }`}
    >
      {fontOpen ? (
        <FontLibraryView
          usedFonts={usedFonts}
          currentFontFamily={currentFontFamily}
          onSelectFont={(fontFamily) => {
            if (isText) {
              onApplyFont(fontFamily);
              return;
            }
            setGlobalFontConfirmFamily(fontFamily);
          }}
          onBack={() => {
            setGlobalFontConfirmFamily(null);
            setFontOpen(false);
          }}
          onClose={() => {
            setGlobalFontConfirmFamily(null);
            setFontOpen(false);
          }}
        />
      ) : (
        <>
          <div className="design-editor-panel-header">
            <h3 className="design-editor-panel-title">Текст</h3>
            <button
              type="button"
              className="design-editor-panel-close"
              onClick={onClose}
              aria-label="Закрыть"
            >
              <AppIcon name="x" size="sm" />
            </button>
          </div>

          <p className="text-panel-v2__scope">
            {isText ? (
              <>
                <strong>Выделен текст на холсте.</strong> Изменения ниже применяются к нему.
              </>
            ) : (
              <>
                <strong>Текст не выделен.</strong> Кнопки «Изменить…» применяются ко <strong>всему тексту</strong> на{' '}
                <strong>всех страницах</strong> макета.
              </>
            )}
          </p>

          <section className="text-panel-v2__section" aria-label="Добавить блок">
            <h4 className="text-panel-v2__section-title">Добавить на страницу</h4>
            <div className="text-panel-v2__presets">
              {(Object.keys(TEXT_BLOCK_PRESETS) as TextBlockPresetKind[]).map((kind) => {
                const p = TEXT_BLOCK_PRESETS[kind];
                return (
                  <button
                    key={kind}
                    type="button"
                    className={`text-panel-v2__preset text-panel-v2__preset--${kind}`}
                    onClick={() => onAddTextPreset(kind)}
                  >
                    <span className="text-panel-v2__preset-label">{p.label}</span>
                    <span className="text-panel-v2__preset-hint" style={{ fontSize: Math.min(22, p.fontSize * 0.45) }}>
                      {p.defaultText}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="text-panel-v2__section" aria-label="Правки">
            <h4 className="text-panel-v2__section-title">Шрифты проекта</h4>
            <p className="text-panel-v2__hint-mini">Область: {scopeLabel}</p>
            <div className="text-panel-v2__actions">
              <Button type="button" variant="secondary" className="text-panel-v2__action-btn" onClick={() => setFontOpen(true)}>
                Изменить шрифт
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="text-panel-v2__action-btn"
                onClick={() => setColorOpen(true)}
              >
                Изменить цвет текста
              </Button>
              <Button type="button" variant="secondary" className="text-panel-v2__action-btn" onClick={() => setFxOpen(true)}>
                Изменить эффекты
              </Button>
            </div>
          </section>

          {isText && selectedObj && (
            <section className="text-panel-v2__section">
              <h4 className="text-panel-v2__section-title">Содержимое выделенного блока</h4>
              <textarea
                className="design-editor-text-input design-editor-text-textarea"
                value={selectedObj.text ?? ''}
                onChange={(e) => onTextChange(e.target.value)}
                rows={3}
                placeholder="Введите текст..."
              />
            </section>
          )}
        </>
      )}

      <Modal
        isOpen={globalFontConfirmFamily !== null}
        onClose={() => setGlobalFontConfirmFamily(null)}
        title="Шрифт на всём макете"
        size="sm"
      >
        <p className="text-panel-v2__modal-scope" style={{ marginTop: 0 }}>
          Сейчас <strong>не выделен</strong> ни один текстовый блок на холсте. Шрифт{' '}
          <strong>
            {globalFontConfirmFamily
              ? findFontCatalogEntry(globalFontConfirmFamily)?.label ?? globalFontConfirmFamily
              : ''}
          </strong>{' '}
          будет применён ко <strong>всем</strong> текстовым блокам на <strong>всех страницах</strong> макета.
        </p>
        <div className="text-panel-v2__modal-footer">
          <Button variant="secondary" type="button" onClick={() => setGlobalFontConfirmFamily(null)}>
            Отмена
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={() => {
              if (globalFontConfirmFamily) {
                onApplyFont(globalFontConfirmFamily);
              }
              setGlobalFontConfirmFamily(null);
            }}
          >
            Применить ко всему макету
          </Button>
        </div>
      </Modal>

      <Modal isOpen={colorOpen} onClose={() => setColorOpen(false)} title="Цвет текста" size="sm">
        <div className="text-panel-v2__modal-field">
          <label className="text-panel-v2__modal-label">Цвет заливки</label>
          <div className="text-panel-v2__color-row">
            <input
              type="color"
              className="text-panel-v2__color-input"
              value={colorDraft.startsWith('#') ? colorDraft : '#000000'}
              onChange={(e) => setColorDraft(e.target.value)}
            />
            <input
              type="text"
              className="text-panel-v2__color-text"
              value={colorDraft}
              onChange={(e) => setColorDraft(e.target.value)}
            />
          </div>
        </div>
        <p className="text-panel-v2__modal-scope">Применится к: {scopeLabel}</p>
        <div className="text-panel-v2__modal-footer">
          <Button variant="secondary" type="button" onClick={() => setColorOpen(false)}>
            Отмена
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={() => {
              onApplyTextColor(colorDraft);
              setColorOpen(false);
            }}
          >
            Применить
          </Button>
        </div>
      </Modal>

      <Modal isOpen={fxOpen} onClose={() => setFxOpen(false)} title="Эффекты" size="sm">
        <div className="text-panel-v2__modal-field">
          <label className="text-panel-v2__modal-label">
            Непрозрачность: {Math.round(fxDraft.opacity * 100)}%
          </label>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={fxDraft.opacity}
            onChange={(e) => setFxDraft((d) => ({ ...d, opacity: parseFloat(e.target.value) }))}
            className="text-panel-v2__range"
          />
        </div>
        <div className="text-panel-v2__modal-field">
          <label className="text-panel-v2__modal-label">Обводка (толщина)</label>
          <input
            type="range"
            min={0}
            max={12}
            step={1}
            value={fxDraft.strokeWidth}
            onChange={(e) =>
              setFxDraft((d) => ({ ...d, strokeWidth: parseInt(e.target.value, 10) }))
            }
            className="text-panel-v2__range"
          />
        </div>
        {fxDraft.strokeWidth > 0 && (
          <div className="text-panel-v2__modal-field">
            <label className="text-panel-v2__modal-label">Цвет обводки</label>
            <input
              type="color"
              className="text-panel-v2__color-input"
              value={fxDraft.stroke.startsWith('#') ? fxDraft.stroke : '#64748b'}
              onChange={(e) => setFxDraft((d) => ({ ...d, stroke: e.target.value }))}
            />
          </div>
        )}
        {isText && (
          <label className="text-panel-v2__check">
            <input
              type="checkbox"
              checked={fxDraft.softShadow}
              onChange={(e) => setFxDraft((d) => ({ ...d, softShadow: e.target.checked }))}
            />
            Мягкая тень
          </label>
        )}
        {!isText && (
          <p className="text-panel-v2__modal-note">
            Для всего проекта тень не задаётся (только непрозрачность и обводка).
          </p>
        )}
        <p className="text-panel-v2__modal-scope">Применится к: {scopeLabel}</p>
        <div className="text-panel-v2__modal-footer">
          <Button variant="secondary" type="button" onClick={() => setFxOpen(false)}>
            Отмена
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={() => {
              onApplyEffects(fxDraft);
              setFxOpen(false);
            }}
          >
            Применить
          </Button>
        </div>
      </Modal>
    </div>
  );
};
