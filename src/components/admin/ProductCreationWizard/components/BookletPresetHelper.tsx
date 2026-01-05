/**
 * Компонент-помощник для упрощенного создания буклетов
 */

import React from 'react';
import { Button, Alert } from '../../../../common';

interface BookletPresetHelperProps {
  onApplyPreset: (preset: BookletPreset) => void;
  currentPages?: number;
  currentBinding?: string;
}

export interface BookletPreset {
  pages: number[];
  binding: string;
  description: string;
  autoOperations?: string[];
}

const BOOKLET_PRESETS: BookletPreset[] = [
  {
    pages: [4, 8],
    binding: 'staple',
    description: 'Буклет на скобу (4-8 страниц)',
    autoOperations: ['folding', 'stapling'],
  },
  {
    pages: [12, 16, 20, 24],
    binding: 'staple',
    description: 'Буклет на скобу (12-24 страницы)',
    autoOperations: ['folding', 'stapling'],
  },
  {
    pages: [8, 12, 16, 20, 24, 28, 32],
    binding: 'perfect',
    description: 'Брошюра на склейку (8-32 страницы)',
    autoOperations: ['folding', 'perfect_binding'],
  },
  {
    pages: [32, 40, 48, 64],
    binding: 'perfect',
    description: 'Брошюра на склейку (32+ страниц)',
    autoOperations: ['folding', 'perfect_binding'],
  },
];

export const BookletPresetHelper: React.FC<BookletPresetHelperProps> = ({
  onApplyPreset,
  currentPages,
  currentBinding,
}) => {
  const getRecommendedPreset = (): BookletPreset | null => {
    if (!currentPages) return null;

    // Находим подходящий пресет на основе текущего количества страниц
    return (
      BOOKLET_PRESETS.find(
        (preset) =>
          preset.pages.includes(currentPages) &&
          (!currentBinding || preset.binding === currentBinding)
      ) || BOOKLET_PRESETS[0]
    );
  };

  const recommended = getRecommendedPreset();

  return (
    <div className="booklet-preset-helper flex flex-col gap-3">
      <Alert type="info">
        <div className="flex flex-col gap-2">
          <strong>💡 Упрощенное создание буклетов</strong>
          <p className="text-sm">
            Выберите готовый пресет для автоматической настройки параметров и операций:
          </p>
        </div>
      </Alert>

      {recommended && (
        <Alert type="warning">
          <div className="flex items-center justify-between">
            <span>
              Рекомендуется: <strong>{recommended.description}</strong>
            </span>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => onApplyPreset(recommended)}
            >
              Применить
            </Button>
          </div>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-primary">Готовые пресеты:</span>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {BOOKLET_PRESETS.map((preset, index) => (
            <div
              key={index}
              className="preset-card p-3 border rounded-lg hover:border-primary transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="font-medium text-sm">{preset.description}</div>
                  <div className="text-xs text-secondary mt-1">
                    Страницы: {preset.pages.join(', ')}
                  </div>
                  <div className="text-xs text-secondary">
                    Скрепление: {preset.binding === 'staple' ? 'Скоба' : 'Склейка'}
                  </div>
                  {preset.autoOperations && (
                    <div className="text-xs text-muted mt-1">
                      Авто-операции: {preset.autoOperations.join(', ')}
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onApplyPreset(preset)}
                >
                  Применить
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

