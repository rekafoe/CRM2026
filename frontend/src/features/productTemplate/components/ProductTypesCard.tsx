import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../../components/common'
import type { CalculatorMaterial } from '../../../services/calculatorMaterialService'
import type { SimplifiedConfig, SimplifiedTypeConfig, ProductTypeVariant, ProductTypeId, SubtypeInitialDefaults, InitialOperation } from '../hooks/useProductTemplate'
import { uploadProductImage } from '../../../services/products'
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

export interface ServiceInfo {
  id: number
  name?: string
  operation_type?: string
}

export interface ProductTypesCardProps {
  value: SimplifiedConfig
  onChange: (next: SimplifiedConfig) => void
  selectedTypeId: ProductTypeId | null
  onSelectType: (typeId: ProductTypeId) => void
  onAddType: () => void
  setDefaultType: (id: ProductTypeId) => void
  removeType: (id: ProductTypeId) => void
  services?: ServiceInfo[]
  allMaterials?: CalculatorMaterial[]
}

/** Собирает уникальные service_id из finishing всех размеров конфига типа, резолвит имена через services */
function useTypeFinishingServices(cfg: SimplifiedTypeConfig | undefined, services: ServiceInfo[]) {
  return useMemo(() => {
    if (!cfg?.sizes) return []
    const seenIds = new Set<number>()
    const result: Array<{ service_id: number; name: string; variant_id?: number; subtype?: string; variant_name?: string }> = []
    for (const size of cfg.sizes) {
      for (const f of size.finishing || []) {
        const key = f.variant_id ? `${f.service_id}_${f.variant_id}` : String(f.service_id)
        if (seenIds.has(Number(key.replace('_', '')))) continue
        seenIds.add(Number(key.replace('_', '')))
        const svc = services.find(s => s.id === f.service_id)
        const baseName = svc?.name || `Услуга #${f.service_id}`
        const fullName = f.variant_name
          ? `${baseName} → ${f.variant_name}${f.subtype ? ` (${f.subtype})` : ''}`
          : baseName
        result.push({ service_id: f.service_id, name: fullName, variant_id: f.variant_id, subtype: f.subtype, variant_name: f.variant_name })
      }
    }
    return result
  }, [cfg?.sizes, services])
}

const TypeInitialDefaults: React.FC<{
  value: SimplifiedConfig
  typeId: ProductTypeId
  onChange: (next: SimplifiedConfig) => void
  services: ServiceInfo[]
  allMaterials: CalculatorMaterial[]
}> = ({ value, typeId, onChange, services, allMaterials }) => {
  const cfg = value.typeConfigs?.[String(typeId)]
  const initial = cfg?.initial ?? {} as Partial<SubtypeInitialDefaults>
  const sizes = cfg?.sizes ?? []
  const finishingServices = useTypeFinishingServices(cfg, services)

  const updateInitial = (patch: Partial<SubtypeInitialDefaults>) => {
    const merged = { ...initial, ...patch }
    const cleaned: Record<string, any> = {}
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === '') continue
      if (Array.isArray(v) && v.length === 0) continue
      cleaned[k] = v
    }
    onChange(updateTypeConfig(value, typeId, {
      initial: Object.keys(cleaned).length ? cleaned as SubtypeInitialDefaults : undefined,
    }))
  }

  const availableMaterials = useMemo(() => {
    const idSet = new Set<number>()
    for (const s of sizes) {
      for (const mid of s.allowed_material_ids || []) idSet.add(mid)
      for (const mp of s.material_prices || []) idSet.add(mp.material_id)
    }
    return Array.from(idSet)
      .map(id => {
        const mat = allMaterials.find(m => m.id === id)
        return { id, name: mat ? `${mat.name}` : `Материал #${id}` }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [sizes, allMaterials])

  const availablePrintTechs = useMemo(() => {
    const techSet = new Set<string>()
    for (const s of sizes) {
      for (const pp of s.print_prices || []) {
        if (pp.technology_code) techSet.add(pp.technology_code)
      }
    }
    return Array.from(techSet)
  }, [sizes])

  const availableColorModes = useMemo(() => {
    const modes = new Set<string>()
    for (const s of sizes) {
      for (const pp of s.print_prices || []) {
        if (pp.color_mode) modes.add(pp.color_mode)
      }
    }
    return Array.from(modes)
  }, [sizes])

  const selectedOps = initial.operations ?? []
  const isOpSelected = (serviceId: number, variantId?: number) =>
    selectedOps.some(o => o.operation_id === serviceId && (variantId == null || o.variant_id === variantId))

  const toggleOp = (serviceId: number, variantId?: number, subtype?: string) => {
    const exists = isOpSelected(serviceId, variantId)
    let next: InitialOperation[]
    if (exists) {
      next = selectedOps.filter(o => !(o.operation_id === serviceId && (variantId == null || o.variant_id === variantId)))
    } else {
      const op: InitialOperation = { operation_id: serviceId }
      if (variantId != null) op.variant_id = variantId
      if (subtype) op.subtype = subtype
      next = [...selectedOps, op]
    }
    updateInitial({ operations: next.length ? next : undefined })
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
      {availablePrintTechs.length > 1 && (
        <div className="simplified-template__type-website-field">
          <label>Технология печати по умолчанию</label>
          <select
            className="form-input"
            value={initial.print_technology ?? ''}
            onChange={(e) => updateInitial({ print_technology: e.target.value || undefined })}
          >
            <option value="">Авто (первая доступная)</option>
            {availablePrintTechs.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </div>
      )}
      {availableColorModes.length > 1 && (
        <div className="simplified-template__type-website-field">
          <label>Цветовой режим по умолчанию</label>
          <select
            className="form-input"
            value={initial.color_mode ?? ''}
            onChange={(e) => updateInitial({ color_mode: (e.target.value || undefined) as SubtypeInitialDefaults['color_mode'] })}
          >
            <option value="">Авто</option>
            {availableColorModes.map((m) => (
              <option key={m} value={m}>{m === 'color' ? 'Цветная' : 'Чёрно-белая'}</option>
            ))}
          </select>
        </div>
      )}
      {availableMaterials.length > 0 && (
        <div className="simplified-template__type-website-field">
          <label>Материал по умолчанию</label>
          <select
            className="form-input"
            value={initial.material_id ?? ''}
            onChange={(e) => updateInitial({ material_id: e.target.value ? Number(e.target.value) : undefined })}
          >
            <option value="">Авто (первый доступный)</option>
            {availableMaterials.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      )}
      {finishingServices.length > 0 && (
        <div className="simplified-template__type-website-field">
          <label>Операции включённые по умолчанию</label>
          <div className="simplified-template__type-checkboxes">
            {finishingServices.map((svc) => (
              <label key={`${svc.service_id}_${svc.variant_id ?? ''}`} className="simplified-template__type-checkbox-label">
                <input
                  type="checkbox"
                  checked={isOpSelected(svc.service_id, svc.variant_id)}
                  onChange={() => toggleOp(svc.service_id, svc.variant_id, svc.subtype)}
                />
                {svc.name}
              </label>
            ))}
          </div>
          {finishingServices.length === 0 && (
            <span className="text-muted text-sm">
              Добавьте отделку в размерах этого типа, чтобы выбрать операции по умолчанию
            </span>
          )}
        </div>
      )}
    </div>
  )
}

const SubtypeImageUploader: React.FC<{
  imageUrl?: string;
  onUploaded: (url: string) => void;
}> = ({ imageUrl, onUploaded }) => {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const result = await uploadProductImage(file);
      onUploaded(result.image_url);
    } catch {
      alert('Не удалось загрузить изображение');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  if (imageUrl) {
    return (
      <div className="subtype-image-upload__preview">
        <img src={imageUrl} alt="" className="subtype-image-upload__thumb" />
        <span className="subtype-image-upload__name" title={imageUrl}>
          {imageUrl.split('/').pop()}
        </span>
        <button
          type="button"
          className="subtype-image-upload__remove"
          onClick={() => onUploaded('')}
          title="Удалить"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <label className={`subtype-image-upload__zone ${uploading ? 'subtype-image-upload__zone--loading' : ''}`}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
        onChange={handleFile}
        disabled={uploading}
        style={{ display: 'none' }}
      />
      {uploading
        ? <span className="subtype-image-upload__loading">Загрузка...</span>
        : <><span>📷</span><span>Загрузить фото</span></>
      }
    </label>
  );
};

export const ProductTypesCard: React.FC<ProductTypesCardProps> = ({
  value,
  onChange,
  selectedTypeId,
  onSelectType,
  onAddType,
  setDefaultType,
  removeType,
  services = [],
  allMaterials = [],
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
                        <label>Изображение</label>
                        <SubtypeImageUploader
                          imageUrl={t.image_url}
                          onUploaded={(url) => onChange(updateType(value, t.id, { image_url: url || undefined }))}
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
                    <TypeInitialDefaults
                      value={value}
                      typeId={t.id}
                      onChange={onChange}
                      services={services}
                      allMaterials={allMaterials ?? []}
                    />
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
