import React from 'react'
import { Button } from '../../../components/common'
import type { SimplifiedConfig, ProductTypeVariant } from '../hooks/useProductTemplate'
import './SimplifiedTemplateSection.css'

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
                  onClick={() => onSelectType(t.id)}
                >
                  <span className="simplified-template__type-tab-name">{t.name}</span>
                  {t.default && <span className="simplified-template__type-badge">по умолчанию</span>}
                </button>
                {selectedTypeId === t.id && (
                  <div className="simplified-template__type-actions">
                    <input
                      type="text"
                      className="form-input form-input--sm"
                      value={t.name}
                      onChange={(e) => {
                        const name = e.target.value || t.name
                        onChange({
                          ...value,
                          types: value.types!.map((x) => (x.id === t.id ? { ...x, name } : x)),
                        })
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
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
