import React, { useMemo, useState } from 'react'
import { AppIcon } from '../../../components/ui/AppIcon'
import type { CalculatorMaterial } from '../../../services/calculatorMaterialService'
import './WarehouseMaterialsAllowedEditor.css'

interface WarehouseMaterialsAllowedEditorProps {
  materials: CalculatorMaterial[]
  allowedIds: number[]
  onAllowedChange: (ids: number[]) => void
  loading?: boolean
  title?: string
  emptyMessage?: string
}

type MaterialGroup = {
  key: string
  name: string
  color?: string
  materials: CalculatorMaterial[]
}

const KIND_LABELS: Record<string, string> = {
  sheet: 'Листовой',
  roll: 'Рулонный',
  consumable: 'Расходник',
  area: 'Площадной',
}

function normalizeSearch(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
}

function isMaterialActive(material: CalculatorMaterial): boolean {
  const value = material.is_active as boolean | number | undefined
  return value == null || value === true || value === 1
}

function materialSearchText(material: CalculatorMaterial): string {
  return normalizeSearch([
    material.id,
    material.name,
    material.category_name,
    material.material_type_name,
    material.material_kind,
    material.sku,
    material.unit,
    material.density,
  ].join(' '))
}

function materialMeta(material: CalculatorMaterial): string[] {
  const meta: string[] = []
  if (material.material_type_name) meta.push(material.material_type_name)
  if (Number(material.density) > 0) meta.push(`${Number(material.density)} г/м²`)
  if (material.material_kind) {
    meta.push(KIND_LABELS[material.material_kind] || material.material_kind)
  }
  if (material.quantity != null && material.unit) {
    const quantity = Number(material.quantity)
    meta.push(`Остаток: ${Number.isFinite(quantity) ? quantity.toLocaleString('ru-RU') : material.quantity} ${material.unit}`)
  }
  return meta
}

function groupMaterials(materials: CalculatorMaterial[]): MaterialGroup[] {
  const deduplicated = new Map<number, CalculatorMaterial>()
  for (const material of materials) {
    const id = Number(material?.id)
    if (!Number.isFinite(id)) continue
    deduplicated.set(id, material)
  }

  const groups = new Map<string, MaterialGroup>()
  for (const material of deduplicated.values()) {
    const categoryName = String(material.category_name || '').trim() || 'Без категории'
    const categoryId = Number(material.category_id)
    const key = Number.isFinite(categoryId)
      ? `category:${categoryId}`
      : `category-name:${normalizeSearch(categoryName)}`
    const group = groups.get(key) || {
      key,
      name: categoryName,
      color: material.category_color,
      materials: [],
    }
    group.materials.push(material)
    groups.set(key, group)
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      materials: group.materials.sort((left, right) => {
        const typeCompare = String(left.material_type_name || '').localeCompare(
          String(right.material_type_name || ''),
          'ru',
        )
        if (typeCompare !== 0) return typeCompare
        return String(left.name || '').localeCompare(String(right.name || ''), 'ru')
      }),
    }))
    .sort((left, right) => {
      if (left.name === 'Без категории') return 1
      if (right.name === 'Без категории') return -1
      return left.name.localeCompare(right.name, 'ru')
    })
}

export const WarehouseMaterialsAllowedEditor: React.FC<WarehouseMaterialsAllowedEditorProps> = ({
  materials,
  allowedIds,
  onAllowedChange,
  loading = false,
  title = 'Материалы со склада',
  emptyMessage = 'На складе пока нет материалов.',
}) => {
  const [query, setQuery] = useState('')
  const [showSelectedOnly, setShowSelectedOnly] = useState(false)
  const normalizedQuery = normalizeSearch(query)
  const normalizedAllowedIds = useMemo(
    () => [...new Set(allowedIds.map(Number).filter(Number.isFinite))],
    [allowedIds],
  )
  const allowedSet = useMemo(() => new Set(normalizedAllowedIds), [normalizedAllowedIds])

  const groups = useMemo(() => {
    const filtered = materials.filter((material) => {
      const id = Number(material.id)
      if (showSelectedOnly && !allowedSet.has(id)) return false
      if (!normalizedQuery) return true
      return materialSearchText(material).includes(normalizedQuery)
    })
    return groupMaterials(filtered)
  }, [allowedSet, materials, normalizedQuery, showSelectedOnly])

  const visibleMaterials = useMemo(
    () => groups.flatMap((group) => group.materials),
    [groups],
  )
  const knownIds = useMemo(
    () => new Set(materials.map((material) => Number(material.id))),
    [materials],
  )
  const missingSelectedCount = normalizedAllowedIds.filter((id) => !knownIds.has(id)).length

  const toggleMaterial = (material: CalculatorMaterial, checked: boolean) => {
    const id = Number(material.id)
    if (!Number.isFinite(id)) return
    if (checked) {
      if (!allowedSet.has(id)) onAllowedChange([...normalizedAllowedIds, id])
      return
    }
    onAllowedChange(normalizedAllowedIds.filter((allowedId) => allowedId !== id))
  }

  const toggleGroup = (group: MaterialGroup) => {
    const selectableIds = group.materials
      .filter((material) => isMaterialActive(material) || allowedSet.has(Number(material.id)))
      .map((material) => Number(material.id))
    const allSelected = selectableIds.length > 0 && selectableIds.every((id) => allowedSet.has(id))
    if (allSelected) {
      const removed = new Set(selectableIds)
      onAllowedChange(normalizedAllowedIds.filter((id) => !removed.has(id)))
      return
    }
    const additions = selectableIds.filter((id) => !allowedSet.has(id))
    onAllowedChange([...normalizedAllowedIds, ...additions])
  }

  return (
    <div className="warehouse-material-picker">
      <div className="warehouse-material-picker__header">
        <div>
          <strong>{title}</strong>
          <span>
            Выбрано: {normalizedAllowedIds.length}
            {visibleMaterials.length !== materials.length ? ` · найдено: ${visibleMaterials.length}` : ''}
          </span>
        </div>
        <button
          type="button"
          className={`warehouse-material-picker__selected-toggle${showSelectedOnly ? ' is-active' : ''}`}
          onClick={() => setShowSelectedOnly((value) => !value)}
          aria-pressed={showSelectedOnly}
        >
          <AppIcon name="check" size="xs" />
          Только выбранные
        </button>
      </div>

      <label className="warehouse-material-picker__search">
        <AppIcon name="search" size="xs" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по названию, категории, типу или ID"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Очистить поиск">
            <AppIcon name="x" size="xs" />
          </button>
        )}
      </label>

      {missingSelectedCount > 0 && (
        <div className="warehouse-material-picker__notice">
          {missingSelectedCount} выбранных материалов не найдены в текущем справочнике склада.
          Их привязки сохранены.
        </div>
      )}

      {loading && materials.length === 0 ? (
        <div className="warehouse-material-picker__empty">Загружаем материалы…</div>
      ) : materials.length === 0 ? (
        <div className="warehouse-material-picker__empty">{emptyMessage}</div>
      ) : groups.length === 0 ? (
        <div className="warehouse-material-picker__empty">
          По заданным условиям материалы не найдены.
        </div>
      ) : (
        <div className="warehouse-material-picker__groups">
          {groups.map((group) => {
            const selectableIds = group.materials
              .filter((material) => isMaterialActive(material) || allowedSet.has(Number(material.id)))
              .map((material) => Number(material.id))
            const selectedCount = selectableIds.filter((id) => allowedSet.has(id)).length
            const allSelected = selectableIds.length > 0 && selectedCount === selectableIds.length

            return (
              <section
                key={group.key}
                className="warehouse-material-picker__group"
                style={group.color ? { '--material-category-color': group.color } as React.CSSProperties : undefined}
              >
                <div className="warehouse-material-picker__group-header">
                  <div>
                    <strong>{group.name}</strong>
                    <span>{selectedCount} из {group.materials.length}</span>
                  </div>
                  <button type="button" onClick={() => toggleGroup(group)} disabled={selectableIds.length === 0}>
                    {allSelected ? 'Снять категорию' : 'Выбрать категорию'}
                  </button>
                </div>

                <div className="warehouse-material-picker__items">
                  {group.materials.map((material) => {
                    const id = Number(material.id)
                    const checked = allowedSet.has(id)
                    const active = isMaterialActive(material)
                    const meta = materialMeta(material)
                    return (
                      <label
                        key={id}
                        className={`warehouse-material-picker__item${checked ? ' is-checked' : ''}${!active ? ' is-inactive' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!active && !checked}
                          onChange={(event) => toggleMaterial(material, event.target.checked)}
                        />
                        <span className="warehouse-material-picker__item-copy">
                          <span className="warehouse-material-picker__item-name">
                            {material.name}
                            {!active && <em>Неактивен</em>}
                          </span>
                          <span className="warehouse-material-picker__item-meta">
                            {meta.length > 0 ? meta.join(' · ') : `ID ${id}`}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
