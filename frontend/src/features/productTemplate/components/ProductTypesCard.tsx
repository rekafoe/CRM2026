import React, { useEffect, useState } from 'react'
import { Button } from '../../../components/common'
import type { SimplifiedConfig, SimplifiedTypeConfig, ProductTypeVariant, ProductTypeId, SubtypeInitialDefaults } from '../hooks/useProductTemplate'
import './SimplifiedTemplateSection.css'

const updateType = (
  value: SimplifiedConfig,
  typeId: ProductTypeId,
  patch: Partial<ProductTypeVariant>
): SimplifiedConfig => ({
  ...value,
  types: value.types!.map((x) => (x.id === typeId ? { ...x, ...patch } : x)),
})

const updateTypeConfig = (
  value: SimplifiedConfig,
  typeId: ProductTypeId,
  patch: Partial<SimplifiedTypeConfig>
): SimplifiedConfig => {
  const key = String(typeId)
  const prev = value.typeConfigs?.[key] ?? { sizes: [] }
  return {
    ...value,
    typeConfigs: { ...value.typeConfigs, [key]: { ...prev, ...patch } },
  }
}

/** Преобразует массив в текст (один пункт на строку) и обратно */
const arrayToText = (arr: string[] | undefined): string =>
  Array.isArray(arr) ? arr.filter(Boolean).join('\n') : ''
const textToArray = (text: string): string[] =>
  text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

export interface ProductTypesCardProps {
  value: SimplifiedConfig
  onChange: (next: SimplifiedConfig) => void
  selectedTypeId: ProductTypeId | null
  onSelectType: (typeId: ProductTypeId) => void
  onAddType: () => void
  setDefaultType: (id: ProductTypeId) => void
  removeType: (id: ProductTypeId) => void
}

export const ProductTypesCard: React.FC<ProductTypesCardProps> = ({
  value,
  onChange,
  selectedTypeId,
  onSelectType,
  onAddType,
  setDefaultType,
  removeType,
}) => {
  const hasTypes = Boolean(value.types?.length)
  const types = value.types ?? []
  const [expandedTypeId, setExpandedTypeId] = useState<ProductTypeId | null>(selectedTypeId)

  useEffect(() => {
    // Если панель свёрнута вручную (expandedTypeId === null), не раскрываем её обратно автоматически.
    if (expandedTypeId !== null && !types.some((t) => t.id === expandedTypeId)) {
      setExpandedTypeId(selectedTypeId)
    }
  }, [expandedTypeId, selectedTypeId, types])

  return (
    <div className="simplified-card simplified-template__types">
      <div className="simplified-card__header">
        <div>
          <strong>Типы продукта</strong>
          <div className="text-muted text-sm">
            Варианты внутри продукта (например: односторонние, с ламинацией). У каждого типа — свой набор размеров и цен.
          </div>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={onAddType}>
          {hasTypes ? 'Добавить тип' : 'Включить типы'}
        </Button>
      </div>
      {hasTypes && (
        <div className="simplified-card__content">
          <div className="simplified-template__types-list">
            {types.map((t: ProductTypeVariant) => (
              <div
                key={t.id}
                className={`simplified-template__type-tab ${selectedTypeId === t.id ? 'simplified-template__type-tab--active' : ''}`}
              >
                <button
                  type="button"
                  className="simplified-template__type-tab-btn"
                  onClick={() => {
                    onSelectType(t.id)
                    setExpandedTypeId((prev) => (prev === t.id ? null : t.id))
                  }}
                >
                  <span className="simplified-template__type-tab-name">{t.name}</span>
                  {t.default && <span className="simplified-template__type-badge">по умолчанию</span>}
                  <span className="simplified-template__type-toggle">{expandedTypeId === t.id ? 'Свернуть' : 'Развернуть'}</span>
                </button>
                {expandedTypeId === t.id && (
                  <div className="simplified-template__type-panel">
                    <div className="simplified-template__type-actions">
                      <input
                        type="text"
                        className="form-input form-input--sm"
                        value={t.name}
                        onChange={(e) => {
                          const name = e.target.value || t.name
                          onChange(updateType(value, t.id, { name }))
                        }}
                        placeholder="Название типа"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setDefaultType(t.id)}
                        disabled={!!t.default}
                      >
                        По умолчанию
                      </Button>
                      <Button
                        type="button"
                        variant="error"
                        size="sm"
                        onClick={() => removeType(t.id)}
                        disabled={value.types!.length <= 1}
                      >
                        Удалить
                      </Button>
                    </div>
                    <div className="simplified-template__type-website-content">
                      <div className="simplified-template__type-website-title">
                        Контент для сайта
                      </div>
                      <div className="simplified-template__type-website-field">
                        <label>Изображение (URL)</label>
                        <input
                          type="text"
                          className="form-input"
                          value={t.image_url ?? ''}
                          onChange={(e) =>
                            onChange(updateType(value, t.id, { image_url: e.target.value || undefined }))
                          }
                          placeholder="https://example.com/image.jpg"
                        />
                      </div>
                      <div className="simplified-template__type-website-field">
                        <label>Краткое описание</label>
                        <input
                          type="text"
                          className="form-input"
                          value={t.briefDescription ?? ''}
                          onChange={(e) =>
                            onChange(updateType(value, t.id, { briefDescription: e.target.value || undefined }))
                          }
                          placeholder="Одна строка для карточки (например: Цветные на плотной бумаге)"
                        />
                      </div>
                      <div className="simplified-template__type-website-field">
                        <label>Полное описание</label>
                        <textarea
                          className="form-input"
                          rows={3}
                          value={t.fullDescription ?? ''}
                          onChange={(e) =>
                            onChange(updateType(value, t.id, { fullDescription: e.target.value || undefined }))
                          }
                          placeholder="Текст для страницы продукта"
                        />
                      </div>
                      <div className="simplified-template__type-website-field">
                        <label>Характеристики</label>
                        <textarea
                          className="form-input"
                          rows={3}
                          value={arrayToText(t.characteristics)}
                          onChange={(e) =>
                            onChange(updateType(value, t.id, { characteristics: textToArray(e.target.value) }))
                          }
                          placeholder="Один пункт на строку (например: Размер: 90×50 мм)"
                        />
                      </div>
                      <div className="simplified-template__type-website-field">
                        <label>Преимущества</label>
                        <textarea
                          className="form-input"
                          rows={2}
                          value={arrayToText(t.advantages)}
                          onChange={(e) =>
                            onChange(updateType(value, t.id, { advantages: textToArray(e.target.value) }))
                          }
                          placeholder="Один пункт на строку (например: Высокое качество печати)"
                        />
                      </div>
                    </div>
                    {(() => {
                      const cfg = value.typeConfigs?.[String(t.id)]
                      const initial = cfg?.initial ?? {} as Partial<SubtypeInitialDefaults>
                      const sizes = cfg?.sizes ?? []
                      const updateInitial = (patch: Partial<SubtypeInitialDefaults>) => {
                        const merged = { ...initial, ...patch }
                        Object.keys(merged).forEach((k) => {
                          if (merged[k as keyof SubtypeInitialDefaults] === undefined || merged[k as keyof SubtypeInitialDefaults] === '') {
                            delete merged[k as keyof SubtypeInitialDefaults];
                          }
                        })
                        onChange(updateTypeConfig(value, t.id, { initial: Object.keys(merged).length ? merged as SubtypeInitialDefaults : undefined }))
                      }
                      return (
                        <div className="simplified-template__type-website-content">
                          <div className="simplified-template__type-website-title">
                            Начальные значения калькулятора (для сайта)
                          </div>
                          <div className="simplified-template__type-website-field">
                            <label>Размер по умолчанию</label>
                            <select
                              className="form-input"
                              value={initial.size_id ?? ''}
                              onChange={(e) => updateInitial({ size_id: e.target.value || undefined })}
                            >
                              <option value="">Авто (первый размер)</option>
                              {sizes.map((s: any) => (
                                <option key={s.id} value={s.id}>
                                  {s.label || `${s.width_mm}×${s.height_mm}`}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="simplified-template__type-website-field">
                            <label>Тираж по умолчанию</label>
                            <input
                              type="number"
                              className="form-input"
                              min={1}
                              value={initial.quantity ?? ''}
                              onChange={(e) => updateInitial({ quantity: e.target.value ? Number(e.target.value) : undefined })}
                              placeholder="Авто (минимальный тираж)"
                            />
                          </div>
                          <div className="simplified-template__type-website-field">
                            <label>Сторонность по умолчанию</label>
                            <select
                              className="form-input"
                              value={initial.sides_mode ?? ''}
                              onChange={(e) => updateInitial({ sides_mode: (e.target.value || undefined) as SubtypeInitialDefaults['sides_mode'] })}
                            >
                              <option value="">Авто</option>
                              <option value="single">Односторонняя</option>
                              <option value="duplex">Двусторонняя</option>
                              <option value="duplex_bw_back">Двусторонняя (ч/б оборот)</option>
                            </select>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
