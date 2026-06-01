import React, { useState } from 'react'
import { Button, FormField } from '../../../components/common'
import type { SimplifiedPagesConfig } from '../hooks/useProductTemplate'

type Props = {
  pagesConfig: SimplifiedPagesConfig
  onChange: (patch: Partial<SimplifiedPagesConfig>) => void
}

export const MultiPagePagesTab: React.FC<Props> = ({ pagesConfig, onChange }) => {
  const [newPageToAdd, setNewPageToAdd] = useState('')

  const addPage = (num: number) => {
    if (!Number.isFinite(num) || num < 4 || num > 500) return
    const options = pagesConfig.options || []
    if (options.includes(num)) return
    const nextOptions = [...options, num].sort((a, b) => a - b)
    const nextDefault = options.length === 0 ? num : pagesConfig.default
    onChange({ options: nextOptions, default: nextDefault ?? num })
    setNewPageToAdd('')
  }

  return (
    <div className="simplified-card">
      <div className="simplified-card__header">
        <div>
          <h4 className="simplified-card__title-inline">Варианты количества страниц</h4>
          <p className="text-muted text-sm multipage-tab__intro">
            Пресеты для быстрого выбора в калькуляторе. Можно также ввести любое число в пределах min/max
            (по умолчанию 4–500), даже если его нет в списке.
          </p>
        </div>
      </div>
      <div className="simplified-card__content simplified-pages-config">
        <FormField label="Привязанные варианты">
          <div className="simplified-pages-list">
            {(pagesConfig.options || []).length === 0 ? (
              <span className="text-muted text-sm">Нет привязанных вариантов — добавьте первый.</span>
            ) : (
              (pagesConfig.options || [])
                .slice()
                .sort((a, b) => a - b)
                .map((num) => (
                  <span key={num} className="simplified-pages-chip">
                    <span>{num} стр.</span>
                    <button
                      type="button"
                      className="simplified-pages-chip__remove"
                      onClick={() => {
                        const nextOptions = (pagesConfig.options || []).filter((n) => n !== num)
                        const nextDefault =
                          pagesConfig.default === num
                            ? (nextOptions[0] ?? undefined)
                            : pagesConfig.default && nextOptions.includes(pagesConfig.default)
                              ? pagesConfig.default
                              : nextOptions[0]
                        onChange({ options: nextOptions, default: nextDefault })
                      }}
                      title="Удалить"
                    >
                      ×
                    </button>
                  </span>
                ))
            )}
          </div>
          <div className="simplified-pages-add">
            <input
              className="form-input simplified-pages-add__input"
              type="number"
              min={4}
              max={500}
              step={4}
              value={newPageToAdd}
              onChange={(e) => setNewPageToAdd(e.target.value)}
              placeholder="Напр. 16"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addPage(parseInt(newPageToAdd.trim(), 10))
                }
              }}
            />
            <Button type="button" variant="secondary" size="sm" onClick={() => addPage(parseInt(newPageToAdd.trim(), 10))}>
              Добавить
            </Button>
          </div>
        </FormField>
        <FormField label="По умолчанию в калькуляторе">
          <select
            className="form-select"
            value={pagesConfig.default ?? ''}
            onChange={(e) => onChange({ default: e.target.value === '' ? undefined : Number(e.target.value) })}
            disabled={!pagesConfig.options?.length}
          >
            <option value="">—</option>
            {(pagesConfig.options || []).slice().sort((a, b) => a - b).map((pages) => (
              <option key={pages} value={pages}>
                {pages} стр.
              </option>
            ))}
          </select>
        </FormField>
        <div className="simplified-form-grid multipage-tab__bounds">
          <FormField label="Мин. страниц (произвольный ввод)">
            <input
              className="form-input form-input--compact"
              type="number"
              min={1}
              placeholder="4"
              value={pagesConfig.min ?? ''}
              onChange={(e) =>
                onChange({ min: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </FormField>
          <FormField label="Макс. страниц">
            <input
              className="form-input form-input--compact"
              type="number"
              min={1}
              placeholder="500"
              value={pagesConfig.max ?? ''}
              onChange={(e) =>
                onChange({ max: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </FormField>
          <FormField label="Кратность (шаг)" help="Например 4 для журналов на скобу.">
            <input
              className="form-input form-input--compact"
              type="number"
              min={1}
              placeholder="4"
              value={pagesConfig.step ?? ''}
              onChange={(e) =>
                onChange({ step: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </FormField>
        </div>
      </div>
    </div>
  )
}
