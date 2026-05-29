import React, { useEffect, useState } from 'react';
import { TextFormattingControls, type TextFormattingHandlers } from './TextFormattingControls';
import type { SelectedObjProps } from './types';
import './TextMobileToolbar.css';

export type TextMobileToolbarProps = TextFormattingHandlers & {
  selectedObj: SelectedObjProps;
  onTextChange: (text: string) => void;
  /** In-app (Telegram): запасной bottom-sheet, если нужен */
  onOpenTextEdit?: () => void;
};

export const TextMobileToolbar: React.FC<TextMobileToolbarProps> = ({
  selectedObj,
  onTextChange,
  onOpenTextEdit,
  ...handlers
}) => {
  const [draftText, setDraftText] = useState(selectedObj.text ?? '');

  useEffect(() => {
    setDraftText(selectedObj.text ?? '');
  }, [selectedObj.id, selectedObj.text]);

  const stop = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      className="text-mobile-toolbar"
      role="toolbar"
      aria-label="Форматирование текста"
      onMouseDown={stop}
      onTouchStart={stop}
    >
      <div className="text-mobile-toolbar__head">
        <span className="text-mobile-toolbar__title">Текст на макете</span>
        {onOpenTextEdit ? (
          <button type="button" className="text-mobile-toolbar__edit-btn" onClick={onOpenTextEdit}>
            В окне
          </button>
        ) : null}
      </div>
      <label className="text-mobile-toolbar__text-field">
        <textarea
          value={draftText}
          rows={2}
          enterKeyHint="done"
          autoComplete="off"
          autoCorrect="on"
          spellCheck
          placeholder="Введите текст"
          aria-label="Текст на макете"
          onChange={(event) => {
            const next = event.target.value;
            setDraftText(next);
            onTextChange(next);
          }}
        />
      </label>
      <p className="text-mobile-toolbar__hint">
        Макет ниже обновляется сразу. Длинный текст переносится по ширине блока; при выходе за край — предупреждение во вкладке «Проверка».
      </p>
      <div className="text-mobile-toolbar__scroll">
        <TextFormattingControls
          {...handlers}
          selectedObj={selectedObj}
          variant="mobile-dock"
        />
      </div>
    </div>
  );
};
