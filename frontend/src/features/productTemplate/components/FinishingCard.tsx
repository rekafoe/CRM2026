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

function quantityMode(priceUnit: PriceUnit): { mode: QuantityMode; label: string; hint: string } {
  if (priceUnit === 'per_sheet' || priceUnit === 'per_meter' || priceUnit === 'per_m2') {
    return {
      mode: 'layout',
      label: '',
      hint: 'Количество считает раскладка. Здесь услуга только подключается к размеру.',
    }
  }
  if (priceUnit === 'per_hour') {
    return {
      mode: 'minutes',
      label: 'Минут на заказ',
      hint: 'Фиксированное время, без умножения на тираж. В тарифе услуги цена за час.',
    }
  }
  if (priceUnit === 'per_cut') {
    return {
      mode: 'order',
      label: 'Резов на заказ',
      hint: 'Фиксированное число резов. Не умножается на тираж.',
    }
  }
  if (priceUnit === 'fixed' || priceUnit === 'per_order') {
    return {
      mode: 'order',
      label: 'Количество на заказ',
      hint: 'Один раз на заказ. Не умножается на тираж.',
    }
  }
  return {
    mode: 'item',
    label: 'На изделие',
    hint: 'Умножается на тираж: 2 при 50 шт. даёт 100 единиц услуги.',
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
}) => {
  const [query, setQuery] = useState('')
  const [pickId, setPickId] = useState<number | ''>('')
  const [variantsByService, setVariantsByService] = useState<Map<number, ServiceVariant[]>>(new Map())

  const attachedIds = useMemo(
    () => selected.finishing.map((row) => Number(row.service_id)).filter((id) => Number.isFinite(id) && id > 0).join(','),
    [selected.finishing],
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
    const taken = new Set(selected.finishing.map((row) => Number(row.service_id)))
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
  }, [query, selected.finishing, services])

  const persist = (finishing: SimplifiedFinishingPrice[]) => {
    hasUserInteractedWithServicesRef.current.set(selected.id, true)
    updateSize(selected.id, { finishing })
  }

  const addService = (serviceId: number) => {
    if (!Number.isFinite(serviceId) || selected.finishing.some((row) => Number(row.service_id) === serviceId)) return
    const service = servicesById.get(serviceId)
    const priceUnit = servicePriceUnit(service)
    const row: SimplifiedFinishingPrice = {
      service_id: serviceId,
      price_unit: priceUnit,
      units_per_item: 1,
      is_required: false,
    }
    persist([...selected.finishing, row])
    setPickId('')
    setQuery('')
  }

  const patchRow = (serviceId: number, patch: Partial<SimplifiedFinishingPrice>) => {
    persist(
      selected.finishing.map((row) => (Number(row.service_id) === serviceId ? { ...row, ...patch } : row)),
    )
  }

  useEffect(() => {
    if (variantsByService.size === 0) return
    let changed = false
    const next = selected.finishing.map((row) => {
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
  }, [variantsByService, selected.finishing, selected.id, updateSize, hasUserInteractedWithServicesRef])

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
        <p className="text-muted text-sm simplified-finishing-lead">
          Подключите услуги этого размера. Обязательная считается всегда и с заданным количеством.
          Остальные в калькуляторе включаются отдельно.
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
              {selected.finishing.length === 0 && (
                <div className="text-muted text-sm">Для этого размера услуги ещё не подключены.</div>
              )}
              {selected.finishing.map((row) => {
                const service = servicesById.get(Number(row.service_id))
                const priceUnit = servicePriceUnit(service, row.price_unit)
                const meta = quantityMode(priceUnit)
                const options = variantOptions(variantsByService.get(Number(row.service_id)) ?? [])
                const minutes = meta.mode === 'minutes' ? hoursToMinutes(Number(row.units_per_item) || 1) : 0
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
                        onClick={() => persist(selected.finishing.filter((item) => item.service_id !== row.service_id))}
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
                            min={meta.mode === 'minutes' ? 1 : 1}
                            max={100000}
                            step={meta.mode === 'minutes' ? 1 : 1}
                            value={meta.mode === 'minutes' ? minutes : row.units_per_item}
                            onChange={(event) => {
                              const raw = Number(event.target.value)
                              if (!Number.isFinite(raw) || raw <= 0) return
                              const units = meta.mode === 'minutes' ? minutesToHours(raw) : Math.round(raw)
                              patchRow(Number(row.service_id), { units_per_item: units, price_unit: priceUnit })
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
