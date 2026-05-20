import React from 'react';
import { TextFormattingControls, type TextFormattingHandlers } from './TextFormattingControls';
import type { SelectedObjProps } from './types';
import './TextMobileToolbar.css';

export type TextMobileToolbarProps = TextFormattingHandlers & {
  selectedObj: SelectedObjProps;
};

export const TextMobileToolbar: React.FC<TextMobileToolbarProps> = ({
  selectedObj,
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
