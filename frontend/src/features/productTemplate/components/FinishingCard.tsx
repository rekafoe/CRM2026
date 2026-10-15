import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '../../../components/common'
import { getPricingServicesBundle } from '../../../services/pricing/api'
import type { ServiceVariant } from '../../../types/pricing'
import { formatServiceVariantDisplayLabel } from '../../../utils/serviceVariantLabels'
import type { SimplifiedFinishingPrice, SimplifiedSizeConfig } from '../hooks/useProductTemplate'

type PriceUnit = SimplifiedFinishingPrice['price_unit']

type ServiceRow = {
  id: number
  name?: string
  service_name?: string
  operationType?: string
  operation_type?: string
  type?: string
  service_type?: string
  priceUnit?: string
  price_unit?: string
  unit?: string
  categoryId?: number | null
  category_id?: number | null
  categoryName?: string | null
  category_name?: string | null
}

interface FinishingCardProps {
  selected: SimplifiedSizeConfig
  loadingLists: boolean
  services: ServiceRow[]
  loadLists: () => void
  updateSize: (sizeId: number | string, patch: Partial<SimplifiedSizeConfig>) => void
  hasUserInteractedWithServicesRef: React.MutableRefObject<Map<string | number, boolean>>
  /** Есть типы продуктов: общие услуги типа и флаг «свои услуги» у размера */
  hasCommonFinishingFeature?: boolean
  useOwnFinishing?: boolean
  finishingRows?: SimplifiedFinishingPrice[]
  onFinishingChange?: (finishing: SimplifiedFinishingPrice[]) => void
  setUseOwnFinishing?: (value: boolean) => void
}

const PRICE_UNITS: PriceUnit[] = [
  'per_sheet',
  'per_cut',
  'per_item',
  'fixed',
  'per_order',
  'per_meter',
  'per_m2',
  'per_hour',
]

type QuantityMode = 'layout' | 'minutes' | 'order' | 'item'

function serviceName(service: ServiceRow): string {
  return service.name || service.service_name || `Услуга #${service.id}`
}

function servicePriceUnit(service: ServiceRow | undefined, stored?: string): PriceUnit {
  const raw = String(service?.price_unit ?? service?.priceUnit ?? stored ?? '').trim().toLowerCase()
  if ((PRICE_UNITS as string[]).includes(raw)) return raw as PriceUnit
  const opType = service?.operation_type ?? service?.operationType ?? service?.type ?? service?.service_type ?? ''
  if (opType === 'cut' || opType === 'score' || opType === 'fold') return 'per_cut'
  return 'per_item'
}

function readableUnit(unit: unknown): string | null {
  const value = String(unit ?? '').trim()
  if (!value) return null
  const lower = value.toLowerCase()
  if (
    lower.startsWith('per_') ||
    lower === 'fixed' ||
    lower === 'item' ||
    lower === 'hour' ||
    lower === 'sheet' ||
    lower === 'click' ||
    lower === 'm2'
  ) {
    return null
  }
  if (lower === 'мин' || lower === 'мин.' || lower === 'минута' || lower === 'минуты' || lower === 'минут') return 'мин'
  if (/[а-яё]/i.test(value) && value.length <= 16) return value
  return null
}

function quantityMode(priceUnit: PriceUnit, unit: unknown): { mode: QuantityMode; label: string; hint: string } {
  if (priceUnit === 'per_sheet' || priceUnit === 'per_meter' || priceUnit === 'per_m2') {
    return {
      mode: 'layout',
      label: '',
      hint: 'Количество считает раскладка. Здесь услуга только подключается к размеру.',
    }
  }
  const readable = readableUnit(unit)
  const label = priceUnit === 'per_hour' ? 'Норма, мин' : readable ? `Норма, ${readable}` : 'Норма'
  if (priceUnit === 'per_hour') {
    return {
      mode: 'minutes',
      label,
      hint: 'Минуты на заказ. Тираж их не умножает. В тарифе услуги цена за час.',
    }
  }
  if (priceUnit === 'per_cut' || priceUnit === 'fixed' || priceUnit === 'per_order') {
    return {
      mode: 'order',
      label,
      hint: 'Норма на заказ. Тираж её не умножает.',
    }
  }
  return {
    mode: 'item',
    label,
    hint: 'Норма на каждое изделие. Умножается на тираж.',
  }
}

function hoursToMinutes(hours: number): number {
  const minutes = hours * 60
  const nearest = Math.round(minutes)
  if (Math.abs(minutes - nearest) < 0.05) return nearest
  return Math.round(minutes * 10) / 10
}

function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 1e6) / 1e6
}

type VariantOption = {
  id: number
  label: string
  variantName: string
  subtype: string
  density: string
}

function variantOptions(variants: ServiceVariant[]): VariantOption[] {
  return variants.map((variant) => {
    const type = String(variant.parameters?.type || '')
    const density = String(variant.parameters?.density || '')
    const suffix = type && density ? `${type} ${density}` : type || density || ''
    const baseLabel = suffix ? `${variant.variantName}, ${suffix}` : variant.variantName
    return {
      id: variant.id,
      label: formatServiceVariantDisplayLabel(variant, baseLabel),
      variantName: variant.variantName,
      subtype: suffix,
      density,
    }
  })
}

export const FinishingCard: React.FC<FinishingCardProps> = ({
  selected,
  loadingLists,
  services,
  loadLists,
  updateSize,
  hasUserInteractedWithServicesRef,
  hasCommonFinishingFeature = false,
  useOwnFinishing = true,
  finishingRows,
  onFinishingChange,
  setUseOwnFinishing,
}) => {
  const rows = finishingRows ?? selected.finishing
  const [query, setQuery] = useState('')
  const [pickId, setPickId] = useState<number | ''>('')
  const [normDraft, setNormDraft] = useState<Record<number, string>>({})
  const [variantsByService, setVariantsByService] = useState<Map<number, ServiceVariant[]>>(new Map())

  const attachedIds = useMemo(
    () => rows.map((row) => Number(row.service_id)).filter((id) => Number.isFinite(id) && id > 0).join(','),
    [rows],
  )

  useEffect(() => {
    const ids = attachedIds.split(',').map(Number).filter((id) => Number.isFinite(id) && id > 0)
    if (ids.length === 0) {
      setVariantsByService(new Map())
      return
    }
    let cancelled = false
    void getPricingServicesBundle(ids)
      .then((bundle) => {
        if (cancelled) return
        const next = new Map<number, ServiceVariant[]>()
        for (const id of ids) next.set(id, bundle[id]?.variants ?? [])
        setVariantsByService(next)
      })
      .catch(() => {
        if (!cancelled) setVariantsByService(new Map())
      })
    return () => {
      cancelled = true
    }
  }, [attachedIds])

  const servicesById = useMemo(() => {
    const map = new Map<number, ServiceRow>()
    for (const service of services) map.set(Number(service.id), service)
    return map
  }, [services])

  const available = useMemo(() => {
    const taken = new Set(rows.map((row) => Number(row.service_id)))
    const needle = query.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')
    return services
      .filter((service) => !taken.has(Number(service.id)))
      .filter((service) => {
        if (!needle) return true
        const category = service.categoryName ?? service.category_name ?? ''
        const haystack = `${serviceName(service)} ${category} ${service.id}`.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')
        return haystack.includes(needle)
      })
      .sort((a, b) => serviceName(a).localeCompare(serviceName(b), 'ru'))
  }, [query, rows, services])

  const persist = (finishing: SimplifiedFinishingPrice[]) => {
    hasUserInteractedWithServicesRef.current.set(selected.id, true)
    if (onFinishingChange) onFinishingChange(finishing)
    else updateSize(selected.id, { finishing })
  }

  const addService = (serviceId: number) => {
    if (!Number.isFinite(serviceId) || rows.some((row) => Number(row.service_id) === serviceId)) return
    const service = servicesById.get(serviceId)
    const priceUnit = servicePriceUnit(service)
    const row: SimplifiedFinishingPrice = {
      service_id: serviceId,
      price_unit: priceUnit,
      units_per_item: 1,
      is_required: false,
    }
    persist([...rows, row])
    setPickId('')
    setQuery('')
  }

  const patchRow = (serviceId: number, patch: Partial<SimplifiedFinishingPrice>) => {
    persist(
      rows.map((row) => (Number(row.service_id) === serviceId ? { ...row, ...patch } : row)),
    )
  }

  useEffect(() => {
    if (variantsByService.size === 0) return
    let changed = false
    const next = rows.map((row) => {
      if (row.variant_id != null) return row
      const options = variantOptions(variantsByService.get(Number(row.service_id)) ?? [])
      const option = options[0]
      if (!option) return row
      changed = true
      return {
        ...row,
        variant_id: option.id,
        variant_name: option.variantName,
        subtype: option.subtype,
        density: option.density,
      }
    })
    if (changed) persist(next)
  }, [variantsByService, rows, selected.id, updateSize, onFinishingChange, hasUserInteractedWithServicesRef])

  return (
    <div className="simplified-card">
      <div className="simplified-card__header">
        <div>
          <span className="simplified-label-with-hint">
            <strong>Услуги</strong>
            <span
              className="simplified-label-hint"
              title="Цены берутся из справочника услуг. Обязательная услуга всегда входит в расчёт с указанным количеством."
            >
              ?
            </span>
          </span>
        </div>
      </div>
      <div className="simplified-card__content">
        {hasCommonFinishingFeature && setUseOwnFinishing && (
          <div className="materials-card__own-toggle">
            <label className="materials-card__own-toggle-label">
              <input
                type="checkbox"
                checked={useOwnFinishing}
                onChange={(event) => {
                  hasUserInteractedWithServicesRef.current.set(selected.id, true)
                  setUseOwnFinishing(event.target.checked)
                }}
              />
              <span className="text-sm">У этого размера свои услуги (иначе — общие для типа)</span>
            </label>
          </div>
        )}
        <p className="text-muted text-sm simplified-finishing-lead">
          {hasCommonFinishingFeature && !useOwnFinishing
            ? 'Эти услуги общие для всех размеров типа. Обязательная считается всегда и с заданным количеством. Остальные в калькуляторе включаются отдельно.'
            : 'Подключите услуги этого размера. Обязательная считается всегда и с заданным количеством. Остальные в калькуляторе включаются отдельно.'}
        </p>
        {loadingLists ? (
          <div className="text-muted">Загрузка услуг...</div>
        ) : services.length === 0 ? (
          <div className="text-muted">
            <div>Услуги не найдены. Проверьте справочник услуг.</div>
            <button
              type="button"
              className="el-button el-button--text el-button--mini"
              onClick={() => void loadLists()}
              style={{ marginTop: '8px' }}
            >
              Попробовать снова
            </button>
          </div>
        ) : (
          <>
            <div className="simplified-finishing-list">
              {rows.length === 0 && (
                <div className="text-muted text-sm">
                  {hasCommonFinishingFeature && !useOwnFinishing
                    ? 'Для типа услуги ещё не подключены.'
                    : 'Для этого размера услуги ещё не подключены.'}
                </div>
              )}
              {rows.map((row) => {
                const service = servicesById.get(Number(row.service_id))
                const priceUnit = servicePriceUnit(service, row.price_unit)
                const meta = quantityMode(priceUnit, service?.unit)
                const options = variantOptions(variantsByService.get(Number(row.service_id)) ?? [])
                const storedUnits = Number(row.units_per_item)
                const units = Number.isFinite(storedUnits) && storedUnits >= 0 ? storedUnits : 1
                const minutes = meta.mode === 'minutes' ? hoursToMinutes(units) : 0
                const normValue = normDraft[Number(row.service_id)] ?? String(meta.mode === 'minutes' ? minutes : units)
                const category = (service?.categoryName ?? service?.category_name ?? '').trim()
                return (
                  <div key={row.service_id} className="simplified-finishing-item">
                    <div className="simplified-finishing-item__header">
                      <div>
                        <div className="simplified-finishing-item__title">
                          {service ? serviceName(service) : `Услуга #${row.service_id}`}
                        </div>
                        {category && <div className="simplified-finishing-item__hint">{category}</div>}
                      </div>
                      <button
                        type="button"
                        className="el-button el-button--text el-button--mini"
                        onClick={() => persist(rows.filter((item) => item.service_id !== row.service_id))}
                      >
                        Убрать
                      </button>
                    </div>
                    <div className="simplified-finishing-item__controls">
                      {options.length > 0 && (
                        <label className="simplified-finishing-field">
                          <span>Вариант</span>
                          <select
                            value={row.variant_id ?? options[0]?.id ?? ''}
                            onChange={(event) => {
                              const option = options.find((item) => item.id === Number(event.target.value))
                              if (!option) return
                              patchRow(Number(row.service_id), {
                                variant_id: option.id,
                                variant_name: option.variantName,
                                subtype: option.subtype,
                                density: option.density,
                              })
                            }}
                          >
                            {options.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {meta.mode !== 'layout' && (
                        <label className="simplified-finishing-field">
                          <span>{meta.label}</span>
                          <input
                            type="number"
                            min={0}
                            max={100000}
                            step={meta.mode === 'minutes' ? 1 : 1}
                            value={normValue}
                            onChange={(event) => {
                              const text = event.target.value
                              const serviceId = Number(row.service_id)
                              setNormDraft((prev) => ({ ...prev, [serviceId]: text }))
                              if (text.trim() === '') return
                              const raw = Number(text.replace(',', '.'))
                              if (!Number.isFinite(raw) || raw < 0) return
                              const nextUnits = meta.mode === 'minutes' ? minutesToHours(raw) : Math.round(raw)
                              patchRow(serviceId, { units_per_item: nextUnits, price_unit: priceUnit })
                            }}
                            onBlur={() => {
                              const serviceId = Number(row.service_id)
                              const text = normDraft[serviceId]
                              setNormDraft((prev) => {
                                if (prev[serviceId] === undefined) return prev
                                const next = { ...prev }
                                delete next[serviceId]
                                return next
                              })
                              if (text === undefined || text.trim() !== '') return
                              patchRow(serviceId, { units_per_item: 0, price_unit: priceUnit })
                            }}
                          />
                        </label>
                      )}
                      <label className="simplified-finishing-item__required">
                        <input
                          type="checkbox"
                          checked={row.is_required === true}
                          onChange={(event) =>
                            patchRow(Number(row.service_id), { is_required: event.target.checked, price_unit: priceUnit })
                          }
                        />
                        <span>Обязательная</span>
                      </label>
                    </div>
                    <p className="simplified-finishing-item__hint">{meta.hint}</p>
                  </div>
                )
              })}
            </div>
            <div className="simplified-finishing-add">
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Найти услугу"
                aria-label="Найти услугу"
              />
              <select
                value={pickId}
                onChange={(event) => setPickId(event.target.value ? Number(event.target.value) : '')}
                aria-label="Услуга для подключения"
              >
                <option value="">Выберите услугу</option>
                {available.map((service) => {
                  const category = (service.categoryName ?? service.category_name ?? '').trim()
                  const label = category ? `${serviceName(service)} — ${category}` : serviceName(service)
                  return (
                    <option key={service.id} value={service.id}>
                      {label}
                    </option>
                  )
                })}
              </select>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pickId === ''}
                onClick={() => {
                  if (pickId !== '') addService(Number(pickId))
                }}
              >
                Подключить
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
