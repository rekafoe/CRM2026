/**
 * Универсальный компонент-помощник для упрощенного создания многостраничных изделий
 * Поддерживает: буклеты, брошюры, каталоги, журналы и другие типы
 */

import React from 'react';
import { Button, Alert } from '../../../common';

export interface MultiPagePreset {
  id: string;
  name: string;
  description: string;
  pages: number[];
  binding: string;
  bindingLabel: string;
  autoOperations?: string[];
  autoParameters?: Record<string, { type: string; options?: string[]; default?: string }>;
  recommendedFormats?: string[];
}

interface MultiPagePresetHelperProps {
  productType: string;
  operationPreset?: string;
  onApplyPreset: (preset: MultiPagePreset) => void;
  currentPages?: number;
  currentBinding?: string;
}

// Универсальные пресеты для всех типов многостраничных изделий
const MULTI_PAGE_PRESETS: Record<string, MultiPagePreset[]> = {
  // Буклеты
  booklets: [
    {
      id: 'booklet-staple-small',
      name: 'Буклет на скобу (малый)',
      description: 'Буклет на скобу, 4-8 страниц',
      pages: [4, 8],
      binding: 'staple',
      bindingLabel: 'Скоба',
      autoOperations: ['folding', 'stapling'],
      recommendedFormats: ['A4', 'A5'],
    },
    {
      id: 'booklet-staple-medium',
      name: 'Буклет на скобу (средний)',
      description: 'Буклет на скобу, 12-24 страницы',
      pages: [12, 16, 20, 24],
      binding: 'staple',
      bindingLabel: 'Скоба',
      autoOperations: ['folding', 'stapling'],
      recommendedFormats: ['A4', 'A5'],
    },
    {
      id: 'booklet-perfect',
      name: 'Брошюра на склейку',
      description: 'Брошюра на склейку, 8-32 страницы',
      pages: [8, 12, 16, 20, 24, 28, 32],
      binding: 'perfect',
      bindingLabel: 'Склейка',
      autoOperations: ['folding', 'perfect_binding'],
      recommendedFormats: ['A4', 'A5'],
    },
    {
      id: 'booklet-perfect-large',
      name: 'Брошюра на склейку (большая)',
      description: 'Брошюра на склейку, 32+ страниц',
      pages: [32, 40, 48, 64, 80, 96],
      binding: 'perfect',
      bindingLabel: 'Склейка',
      autoOperations: ['folding', 'perfect_binding'],
      recommendedFormats: ['A4', 'A5'],
    },
  ],
  // Брошюры
  brochures: [
    {
      id: 'brochure-staple',
      name: 'Брошюра на скобу',
      description: 'Брошюра на скобу, 8-32 страницы',
      pages: [8, 12, 16, 20, 24, 28, 32],
      binding: 'staple',
      bindingLabel: 'Скоба',
      autoOperations: ['folding', 'stapling'],
      recommendedFormats: ['A4', 'A5'],
    },
    {
      id: 'brochure-perfect',
      name: 'Брошюра на склейку',
      description: 'Брошюра на склейку, 16-64 страницы',
      pages: [16, 20, 24, 28, 32, 40, 48, 64],
      binding: 'perfect',
      bindingLabel: 'Склейка',
      autoOperations: ['folding', 'perfect_binding'],
      recommendedFormats: ['A4', 'A5'],
    },
  ],
  // Каталоги
  catalogs: [
    {
      id: 'catalog-perfect',
      name: 'Каталог на склейку',
      description: 'Каталог на склейку, 32+ страниц',
      pages: [32, 40, 48, 64, 80, 96, 128],
      binding: 'perfect',
      bindingLabel: 'Склейка',
      autoOperations: ['folding', 'perfect_binding'],
      recommendedFormats: ['A4', 'A5'],
    },
    {
      id: 'catalog-spiral',
      name: 'Каталог на спираль',
      description: 'Каталог на спираль, 20+ страниц',
      pages: [20, 24, 28, 32, 40, 48, 64],
      binding: 'spiral',
      bindingLabel: 'Спираль',
      autoOperations: ['spiral_binding'],
      recommendedFormats: ['A4', 'A5'],
    },
  ],
  // Журналы
  magazines: [
    {
      id: 'magazine-staple',
      name: 'Журнал на скобу',
      description: 'Журнал на скобу, 16-48 страниц',
      pages: [16, 20, 24, 28, 32, 40, 48],
      binding: 'staple',
      bindingLabel: 'Скоба',
      autoOperations: ['folding', 'stapling'],
      recommendedFormats: ['A4', 'A5'],
    },
    {
      id: 'magazine-perfect',
      name: 'Журнал на склейку',
      description: 'Журнал на склейку, 32+ страниц',
      pages: [32, 40, 48, 64, 80, 96],
      binding: 'perfect',
      bindingLabel: 'Склейка',
      autoOperations: ['folding', 'perfect_binding'],
      recommendedFormats: ['A4', 'A5'],
    },
  ],
  // Универсальные пресеты для multi_page
  multi_page: [
    {
      id: 'multi-staple-small',
      name: 'Многостраничное на скобу (малое)',
      description: '4-12 страниц на скобу',
      pages: [4, 8, 12],
      binding: 'staple',
      bindingLabel: 'Скоба',
      autoOperations: ['folding', 'stapling'],
      recommendedFormats: ['A4', 'A5'],
    },
    {
      id: 'multi-staple-medium',
      name: 'Многостраничное на скобу (среднее)',
      description: '12-32 страницы на скобу',
      pages: [12, 16, 20, 24, 28, 32],
      binding: 'staple',
      bindingLabel: 'Скоба',
      autoOperations: ['folding', 'stapling'],
      recommendedFormats: ['A4', 'A5'],
    },
    {
      id: 'multi-perfect',
      name: 'Многостраничное на склейку',
      description: '16+ страниц на склейку',
      pages: [16, 20, 24, 28, 32, 40, 48, 64],
      binding: 'perfect',
      bindingLabel: 'Склейка',
      autoOperations: ['folding', 'perfect_binding'],
      recommendedFormats: ['A4', 'A5'],
    },
  ],
};

export const MultiPagePresetHelper: React.FC<MultiPagePresetHelperProps> = ({
  productType,
  operationPreset,
  onApplyPreset,
  currentPages,
  currentBinding,
}) => {
  // Определяем ключ для поиска пресетов
  const presetKey = operationPreset || productType || 'multi_page';
  
  // Получаем пресеты для данного типа
  const availablePresets = MULTI_PAGE_PRESETS[presetKey] || MULTI_PAGE_PRESETS.multi_page || [];

  // Находим рекомендуемый пресет
  const getRecommendedPreset = (): MultiPagePreset | null => {
    if (!currentPages || availablePresets.length === 0) return null;

    // Ищем пресет, который подходит по количеству страниц и типу скрепления
    const matching = availablePresets.find(
      (preset) =>
        preset.pages.includes(currentPages) &&
        (!currentBinding || preset.binding === currentBinding)
    );

    return matching || availablePresets[0] || null;
  };

  const recommended = getRecommendedPreset();

  if (availablePresets.length === 0) {
    return null;
  }

  return (
    <div className="multi-page-preset-helper flex flex-col gap-3">
      <Alert type="info">
        <div className="flex flex-col gap-2">
          <strong>💡 Упрощенное создание многостраничных изделий</strong>
          <p className="text-sm">
            Выберите готовый пресет для автоматической настройки параметров и операций:
          </p>
        </div>
      </Alert>

      {recommended && (
        <Alert type="warning">
          <div className="flex items-center justify-between flex-wrap gap-2">
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
          {availablePresets.map((preset) => (
            <div
              key={preset.id}
              className="preset-card p-3 border rounded-lg hover:border-primary transition-colors bg-white"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="font-medium text-sm text-primary">{preset.name}</div>
                  <div className="text-xs text-secondary mt-1">{preset.description}</div>
                  <div className="text-xs text-secondary mt-1">
                    Страницы: {preset.pages.join(', ')}
                  </div>
                  <div className="text-xs text-secondary">
                    Скрепление: {preset.bindingLabel}
                  </div>
                  {preset.autoOperations && preset.autoOperations.length > 0 && (
                    <div className="text-xs text-muted mt-1">
                      Авто-операции: {preset.autoOperations.join(', ')}
                    </div>
                  )}
                  {preset.recommendedFormats && preset.recommendedFormats.length > 0 && (
                    <div className="text-xs text-muted mt-1">
                      Форматы: {preset.recommendedFormats.join(', ')}
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

