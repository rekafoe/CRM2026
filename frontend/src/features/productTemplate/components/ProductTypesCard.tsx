import React, { useEffect, useState } from 'react'
import { Button } from '../../../components/common'
import type { SimplifiedConfig, ProductTypeVariant } from '../hooks/useProductTemplate'
import './SimplifiedTemplateSection.css'

const updateType = (
  value: SimplifiedConfig,
  typeId: string,
  patch: Partial<ProductTypeVariant>
): SimplifiedConfig => ({
  ...value,
  types: value.types!.map((x) => (x.id === typeId ? { ...x, ...patch } : x)),
})

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
  selectedTypeId: string | null
  onSelectType: (typeId: string) => void
  onAddType: () => void
  setDefaultType: (id: string) => void
  removeType: (id: string) => void
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
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>(selectedTypeId)

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
