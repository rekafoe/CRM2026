import React from 'react';
import { TextFormattingControls, type TextFormattingHandlers } from './TextFormattingControls';
import type { SelectedObjProps } from './types';
import './TextMobileToolbar.css';

export type TextMobileToolbarProps = TextFormattingHandlers & {
  selectedObj: SelectedObjProps;
  onOpenTextEdit: () => void;
};

export const TextMobileToolbar: React.FC<TextMobileToolbarProps> = ({
  selectedObj,
  onOpenTextEdit,
  ...handlers
}) => {
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
        <button type="button" className="text-mobile-toolbar__edit-btn" onClick={onOpenTextEdit}>
          Изменить текст
        </button>
      </div>
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
