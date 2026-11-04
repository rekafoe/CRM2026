import React from 'react';
import { AppIcon, type IconName } from '../../components/ui/AppIcon';

export interface EditorViewOptions {
  showRulers: boolean;
  showGuides: boolean;
  showBleed: boolean;
  showTrim: boolean;
  showSafeZone: boolean;
}

interface EditorViewControlsProps {
  value: EditorViewOptions;
  onChange: (value: EditorViewOptions) => void;
}

const OPTIONS: Array<{ key: keyof EditorViewOptions; label: string; icon: IconName }> = [
  { key: 'showRulers', label: 'Линейки', icon: 'layers' },
  { key: 'showGuides', label: 'Направляющие', icon: 'plus' },
  { key: 'showBleed', label: 'Вылеты', icon: 'scissors' },
  { key: 'showTrim', label: 'Обрез', icon: 'box' },
  { key: 'showSafeZone', label: 'Безопасная зона', icon: 'shield' },
];

export const EditorViewControls: React.FC<EditorViewControlsProps> = ({ value, onChange }) => (
  <div className="public-design-editor__view-controls" aria-label="Подсказки макета">
    {OPTIONS.map((option) => (
      <button
        key={option.key}
        type="button"
        className={`public-design-editor__view-toggle${value[option.key] ? ' public-design-editor__view-toggle--active' : ''}`}
        onClick={() => onChange({ ...value, [option.key]: !value[option.key] })}
        title={option.label}
        aria-label={option.label}
      >
        <AppIcon name={option.icon} size="xs" />
      </button>
    ))}
  </div>
);
