import React, { useState } from 'react'
import type { SimplifiedSizeConfig } from '../hooks/useProductTemplate'
import { ServicePricingTable, type ServiceItem, type ServicePricing } from './ServicePricingTable'
import type { Tier } from '../utils/tierManagement'

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
}

interface FinishingCardProps {
  selected: SimplifiedSizeConfig
  loadingLists: boolean
  services: ServiceRow[]
  loadLists: () => void
  getSizeRanges: (size: SimplifiedSizeConfig) => Tier[]
  updateSizeRanges: (sizeId: number | string, newRanges: Tier[]) => void
  updateSize: (sizeId: number | string, patch: Partial<SimplifiedSizeConfig>) => void
  hasUserInteractedWithServicesRef: React.MutableRefObject<Map<string | number, boolean>>
  isMobile: boolean
}

export const FinishingCard: React.FC<FinishingCardProps> = ({
  selected,
  loadingLists,
  services,
  loadLists,
  getSizeRanges,
  updateSizeRanges,
  updateSize,
  hasUserInteractedWithServicesRef,
  isMobile,
}) => {
  const titleWithHint = (label: string, hint: string) => (
    <span className="simplified-label-with-hint">
      <strong>{label}</strong>
      <span className="simplified-label-hint" title={hint}>?</span>
    </span>
  )

  const [expanded, setExpanded] = useState(false)
  return (
  <div className={`simplified-card simplified-card--collapsible ${!expanded ? 'simplified-card--collapsed' : ''}`}>
    <div className="simplified-card__header" onClick={() => setExpanded((v) => !v)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}>
      <div>
        {titleWithHint(
          'Отделка (послепечатные услуги)',
          'Выберите услуги из списка. Цены загружаются из services-management. Отметьте услуги, которые нужно добавить в продукт.',
        )}
      </div>
      <span className="simplified-card__header-toggle">{expanded ? 'Свернуть' : 'Развернуть'}</span>
    </div>
    <div className="simplified-card__content">
      {loadingLists ? (
        <div className="text-muted">Загрузка услуг отделки...</div>
      ) : services.length === 0 ? (
        <div className="text-muted">
          <div>Услуги отделки не найдены. Проверьте настройки услуг в системе.</div>
          <button
            type="button"
            className="el-button el-button--text el-button--mini"
            onClick={() => void loadLists()}
            style={{ marginTop: '8px' }}
          >
            Попробовать снова
          </button>
        </div>
      ) : (() => {
        const commonRanges = getSizeRanges(selected)

        const serviceItems: ServiceItem[] = services.map(s => {
          const opType = s.operation_type ?? s.operationType ?? s.type ?? s.service_type ?? ''
          const apiPu = String(s.price_unit ?? s.priceUnit ?? '')
            .trim()
            .toLowerCase()
          const allowed = ['per_sheet', 'per_cut', 'per_item', 'fixed', 'per_order'] as const
          const price_unit = (allowed as readonly string[]).includes(apiPu)
            ? (apiPu as (typeof allowed)[number])
            : (opType === 'cut' || opType === 'score' || opType === 'fold')
              ? ('per_cut' as const)
              : ('per_item' as const)
          return {
            id: Number(s.id),
            name: s.name || s.service_name || `Услуга #${s.id}`,
            price_unit,
            operation_type: opType
          }
        })

        const servicePricings: ServicePricing[] = selected.finishing.map(f => ({
          service_id: f.service_id,
          price_unit: f.price_unit,
          units_per_item: f.units_per_item,
          variant_id: f.variant_id,
          subtype: f.subtype,
          variant_name: f.variant_name,
          density: f.density,
        }))

        return (
          <ServicePricingTable
            services={serviceItems}
            servicePricings={servicePricings}
            commonRanges={commonRanges}
            onUpdate={(newPricings) => {
              hasUserInteractedWithServicesRef.current.set(selected.id, true)
              const finishingWithoutTiers = newPricings.map(p => ({
                service_id: p.service_id,
                price_unit: p.price_unit,
                units_per_item: p.units_per_item,
                variant_id: p.variant_id,
                subtype: p.subtype,
                variant_name: p.variant_name,
                density: p.density,
              }))
              updateSize(selected.id, { finishing: finishingWithoutTiers })
            }}
            onRangesUpdate={(newRanges) => {
              updateSizeRanges(selected.id, newRanges)
            }}
            rangesEditable={true}
            isMobile={isMobile}
            title="Параметры отделки (цена за рез/биг/фальц или за изделие)"
            loadServiceTiers={true}
            allowPriceOverride={false}
          />
        )
      })()}
    </div>
  </div>
  )
}
