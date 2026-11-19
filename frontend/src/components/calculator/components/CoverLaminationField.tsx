import React, { useEffect, useState } from 'react'
import { finishingLeafOptions } from '../../../features/productTemplate/finishingVariantTree'
import { getPricingServices, getServiceVariants } from '../../../services/pricing/api'
import { isLaminationOperation } from '../../../utils/boundProductPreset'

type FilmOption = { id: number; label: string }

type CoverLaminationFieldProps = {
  serviceId?: number | null
  variantId?: number | null
  onChange: (serviceId: number, variantId?: number) => void
}

/** Ламинация обложки в калькуляторе: пока плёнка не выбрана, услуга в цену не входит. */
export const CoverLaminationField: React.FC<CoverLaminationFieldProps> = ({
  serviceId,
  variantId,
  onChange,
}) => {
  const [services, setServices] = useState<Array<{ id: number; name: string }>>([])
  const [films, setFilms] = useState<FilmOption[]>([])
  const [pickedService, setPickedService] = useState(serviceId != null && serviceId > 0 ? serviceId : 0)

  useEffect(() => {
    let cancelled = false
    getPricingServices()
      .then((list) => {
        if (cancelled) return
        setServices(
          list
            .filter(
              (service) =>
                service.isActive !== false &&
                isLaminationOperation({
                  operation_type: service.operationType,
                  name: service.name,
                }),
            )
            .map((service) => ({ id: service.id, name: service.name || `Услуга #${service.id}` })),
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (serviceId == null || serviceId <= 0) return
    setPickedService(serviceId)
    let cancelled = false
    getServiceVariants(serviceId)
      .then((variants) => {
        if (!cancelled) setFilms(finishingLeafOptions(variants).map((leaf) => ({ id: leaf.id, label: leaf.label })))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [serviceId])

  const chooseService = (next: number) => {
    setPickedService(next)
    if (!Number.isFinite(next) || next <= 0) {
      setFilms([])
      onChange(0)
      return
    }
    getServiceVariants(next)
      .then((variants) => {
        const leaves = finishingLeafOptions(variants).map((leaf) => ({ id: leaf.id, label: leaf.label }))
        setFilms(leaves)
        if (leaves.length === 0) onChange(next)
        else onChange(0)
      })
      .catch(() => {
        setFilms([])
        onChange(next)
      })
  }

  return (
    <div className="param-group">
      <label>Ламинация обложки</label>
      <select
        className="form-control"
        value={pickedService > 0 ? String(pickedService) : '0'}
        onChange={(e) => chooseService(Number(e.target.value))}
      >
        <option value="0">Без ламинации</option>
        {services.map((service) => (
          <option key={service.id} value={service.id}>
            {service.name}
          </option>
        ))}
      </select>
      {pickedService > 0 && films.length > 0 && (
        <>
          <label>Плёнка</label>
          <select
            className="form-control"
            value={variantId != null && variantId > 0 ? String(variantId) : ''}
            onChange={(e) => {
              const film = Number(e.target.value)
              if (!Number.isFinite(film) || film <= 0) onChange(0)
              else onChange(pickedService, film)
            }}
          >
            <option value="">— Плёнка —</option>
            {films.map((film) => (
              <option key={film.id} value={film.id}>
                {film.label}
              </option>
            ))}
          </select>
        </>
      )}
      <p className="param-hint">
        {pickedService > 0 && films.length > 0 && !(variantId != null && variantId > 0)
          ? 'Пока плёнка не выбрана, в цену не входит. '
          : pickedService <= 0
            ? 'По умолчанию без ламинации. Пока услуга не включена, в цену не входит. '
            : ''}
        Ламинируются только листы обложки.
      </p>
    </div>
  )
}
