import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Modal } from '../../../components/common'
import type { CalculatorMaterial } from '../../../services/calculatorMaterialService'
import type { SimplifiedConfig, SimplifiedTypeConfig, ProductTypeVariant, ProductTypeId, SubtypeInitialDefaults, InitialOperation } from '../hooks/useProductTemplate'
import { sortSizesByArea, getEffectiveAllowedMaterialIds } from '../hooks/useProductTemplate'
import { uploadProductImage } from '../../../services/products'
import { SubtypeAllowedPriceTypesField } from './SubtypeAllowedPriceTypesField'
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
  const base = value.typeConfigs ?? {}
  const prev = base[key] ?? { sizes: [] }
  let next: SimplifiedTypeConfig = { ...prev, ...patch }
  if (Object.prototype.hasOwnProperty.call(patch, 'allowed_price_types')) {
    const v = patch.allowed_price_types
    if (v === undefined) {
      const { allowed_price_types: _drop, ...rest } = next
      next = rest
    } else if (Array.isArray(v)) {
      next = { ...next, allowed_price_types: v.slice() }
    }
  }
  return {
    ...value,
    typeConfigs: { ...base, [key]: next },
  }
}

/** Заголовок секции в модалке подтипа: шаг, название, краткий текст */
const SubtypePanelHeader: React.FC<{
  step: number
  title: string
  lede: string
  ledeTitle?: string
}> = ({ step, title, lede, ledeTitle }) => (
  <header className="subtype-edit-panel__header">
    <span className="subtype-edit-panel__step" aria-hidden>
      {step}
    </span>
    <div className="subtype-edit-panel__header-main">
      <h3 className="subtype-edit-panel__title">{title}</h3>
      <p className="subtype-edit-panel__lede" title={ledeTitle}>
        {lede}
      </p>
    </div>
  </header>
)

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
  /** Ключи типов цен, разрешённые для продукта; пусто — в подтипе ориентир на активные типы из справочника */
  productAllowedPriceTypes?: string[]
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
  /** Без верхнего заголовка — заголовок снаружи в панели модалки */
  embedded?: boolean
}> = ({ value, typeId, onChange, services, allMaterials, embedded }) => {
  const cfg = value.typeConfigs?.[String(typeId)]
  const initial = cfg?.initial ?? {} as Partial<SubtypeInitialDefaults>
  const sizes = cfg?.sizes ?? []
  const sortedSizes = useMemo(() => sortSizesByArea(sizes), [sizes])
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

  // Материалы для «Материал по умолчанию»: только разрешённые для выбранного размера (или первого при «Авто»)
  const availableMaterials = useMemo(() => {
    const defaultSizeId = initial.size_id
    const targetSize = defaultSizeId
      ? sizes.find((x: any) => String(x.id) === String(defaultSizeId))
      : sortedSizes[0]
    const ids = targetSize && cfg ? getEffectiveAllowedMaterialIds(cfg, targetSize) : (targetSize?.allowed_material_ids || [])
    const idSet = new Set(ids)
    return Array.from(idSet)
      .map(id => {
        const mat = allMaterials.find(m => m.id === id)
        return { id, name: mat ? `${mat.name}` : `Материал #${id}` }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [cfg, sizes, sortedSizes, allMaterials, initial.size_id])

  const availableBaseMaterials = useMemo(() => {
    const idSet = new Set<number>()
    for (const s of sizes) {
      for (const mid of s.allowed_base_material_ids || []) idSet.add(mid)
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
    <div
      className={
        embedded
          ? 'simplified-template__type-website-content simplified-template__type-website-content--in-panel subtype-defaults-root'
          : 'simplified-template__type-website-content'
      }
    >
      {!embedded && (
        <div className="simplified-template__type-website-title">
          Начальные значения калькулятора (для сайта)
        </div>
      )}
      <div className="simplified-template__type-website-field">
        <label>Размер по умолчанию</label>
        <select
          className="form-input"
          value={String(initial.size_id ?? '')}
          onChange={(e) => {
            const v = e.target.value;
            const newSizeId = v ? (Number(v) || v) : undefined;
            const newSize = newSizeId ? sizes.find((s: any) => String(s.id) === String(newSizeId)) : sortedSizes[0];
            const allowedIds = new Set(newSize && cfg ? getEffectiveAllowedMaterialIds(cfg, newSize) : (newSize?.allowed_material_ids || []));
            const keepMaterial = initial.material_id != null && allowedIds.has(initial.material_id);
            updateInitial({
              size_id: newSizeId,
              ...(keepMaterial ? {} : { material_id: undefined }),
            });
          }}
        >
          <option value="">Авто (первый размер)</option>
          {sortedSizes.map((s: any) => (
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
      {availableBaseMaterials.length > 0 && (
        <div className="simplified-template__type-website-field">
          <label>Материал-основа по умолчанию</label>
          <select
            className="form-input"
            value={initial.base_material_id ?? ''}
            onChange={(e) => updateInitial({ base_material_id: e.target.value ? Number(e.target.value) : undefined })}
          >
            <option value="">Не выбрано</option>
            {availableBaseMaterials.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      )}
      <div className="simplified-template__type-website-field">
        <label>Резка, фальцовка, скругление</label>
        <div className="simplified-template__type-checkboxes">
          <label className="simplified-template__type-checkbox-label">
            <input
              type="checkbox"
              checked={!!initial.cutting || !!initial.cutting_required}
              disabled={!!initial.cutting_required}
              onChange={(e) => updateInitial({ cutting: e.target.checked })}
            />
            Резка по умолчанию
          </label>
          <label className="simplified-template__type-checkbox-label">
            <input
              type="checkbox"
              checked={!!initial.cutting_required}
              onChange={(e) => updateInitial({ cutting_required: e.target.checked, cutting: e.target.checked ? true : initial.cutting })}
            />
            Резка обязательна
          </label>
          <label className="simplified-template__type-checkbox-label">
            <input
              type="checkbox"
              checked={!!initial.folding}
              onChange={(e) => updateInitial({ folding: e.target.checked })}
            />
            Фальцовка по умолчанию
          </label>
          <label className="simplified-template__type-checkbox-label">
            <input
              type="checkbox"
              checked={!!initial.roundCorners}
              onChange={(e) => updateInitial({ roundCorners: e.target.checked })}
            />
            Скругление по умолчанию
          </label>
        </div>
      </div>
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
  subtypeName?: string;
  onUploaded: (url: string) => void;
}> = ({ imageUrl, subtypeName, onUploaded }) => {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const result = await uploadProductImage(file, subtypeName);
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
  productAllowedPriceTypes,
}) => {
  const hasTypes = Boolean(value.types?.length)
  const types = value.types ?? []
  const [editingTypeId, setEditingTypeId] = useState<ProductTypeId | null>(null)
  const [inlineEditingTypeId, setInlineEditingTypeId] = useState<ProductTypeId | null>(null)
  const [inlineNameDraft, setInlineNameDraft] = useState('')
  const [draftImageUrl, setDraftImageUrl] = useState('')
  const [draftBriefDescription, setDraftBriefDescription] = useState('')
  const [draftFullDescription, setDraftFullDescription] = useState('')
  const [draftCharacteristicsText, setDraftCharacteristicsText] = useState('')
  const [draftAdvantagesText, setDraftAdvantagesText] = useState('')
  const [draftSubtypeKey, setDraftSubtypeKey] = useState('')
  const prevTypeIdsRef = useRef<Array<string | number>>((value.types || []).map((t) => t.id))

  const editingType = useMemo(
    () => types.find((t) => t.id === editingTypeId) ?? null,
    [types, editingTypeId]
  )

  useEffect(() => {
    if (!editingType) return
    setDraftImageUrl(editingType.image_url ?? '')
    setDraftBriefDescription(editingType.briefDescription ?? '')
    setDraftFullDescription(editingType.fullDescription ?? '')
    setDraftCharacteristicsText(arrayToText(editingType.characteristics))
    setDraftAdvantagesText(arrayToText(editingType.advantages))
    setDraftSubtypeKey(editingType.key ?? '')
  }, [editingType?.id, editingType?.key])

  const openEditType = (typeId: ProductTypeId) => {
    onSelectType(typeId)
    setEditingTypeId(typeId)
  }

  const closeEditType = () => {
    setEditingTypeId(null)
  }

  const applyTypeDraft = () => {
    if (!editingType) return
    const keyTrim = draftSubtypeKey.trim().toLowerCase()
    const nextValue = updateType(value, editingType.id, {
      image_url: draftImageUrl.trim() ? draftImageUrl : undefined,
      briefDescription: draftBriefDescription.trim() ? draftBriefDescription : undefined,
      fullDescription: draftFullDescription.trim() ? draftFullDescription : undefined,
      characteristics: textToArray(draftCharacteristicsText),
      advantages: textToArray(draftAdvantagesText),
      key: keyTrim || undefined,
    })
    onChange(nextValue)
    closeEditType()
  }

  const startInlineNameEdit = (typeId: ProductTypeId, currentName: string) => {
    setInlineEditingTypeId(typeId)
    setInlineNameDraft(currentName)
  }

  const cancelInlineNameEdit = () => {
    setInlineEditingTypeId(null)
    setInlineNameDraft('')
  }

  const saveInlineNameEdit = (typeId: ProductTypeId, fallbackName: string) => {
    const nextName = inlineNameDraft.trim() || fallbackName
    onChange(updateType(value, typeId, { name: nextName }))
    setInlineEditingTypeId(null)
  }

  useEffect(() => {
    const prevIds = prevTypeIdsRef.current
    const currentIds = types.map((t) => t.id)
    const addedIds = currentIds.filter((id) => !prevIds.some((prevId) => String(prevId) === String(id)))
    if (addedIds.length > 0) {
      const newTypeId = addedIds[addedIds.length - 1] as ProductTypeId
      openEditType(newTypeId)
    }
    prevTypeIdsRef.current = currentIds
  }, [types])

  return (
    <div className="simplified-card simplified-template__types">
      <div className="simplified-card__header">
        <div>
          <strong>Типы продукта</strong>
          <div className="text-muted text-sm">
            Варианты внутри продукта (например: односторонние, с ламинацией). У каждого типа — свой набор размеров и цен.
            Ключ подтипа для URL (key) задаётся в модалке по кнопке ✎ — поле «Ключ URL (подтип)» вверху.
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
                <div
                  className="simplified-template__type-tab-btn"
                  onClick={() => onSelectType(t.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    // Не перехватывать пробел/Enter у полей ввода и кнопок — иначе пробел не вставляется в название
                    const el = e.target as HTMLElement
                    if (el.closest('input, textarea, select, button, a, [contenteditable="true"]')) return
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelectType(t.id)
                    }
                  }}
                >
                  {inlineEditingTypeId === t.id ? (
                    <input
                      type="text"
                      className="form-input simplified-template__type-tab-name-input"
                      value={inlineNameDraft}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setInlineNameDraft(e.target.value)}
                      onBlur={() => saveInlineNameEdit(t.id, t.name)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          saveInlineNameEdit(t.id, t.name)
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          cancelInlineNameEdit()
                        }
                      }}
                    />
                  ) : (
                    <span
                      className="simplified-template__type-tab-name"
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        startInlineNameEdit(t.id, t.name)
                      }}
                      title="Двойной клик для редактирования"
                    >
                      {t.name}
                    </span>
                  )}
                  {t.default && <span className="simplified-template__type-badge">по умолчанию</span>}
                  {t.key?.trim() ? (
                    <span className="simplified-template__type-badge" title="Ключ URL подтипа (key)">
                      {String(t.key).trim().toLowerCase()}
                    </span>
                  ) : null}
                  <span className="simplified-template__type-row-actions">
                    <button
                      type="button"
                      className="simplified-template__type-icon-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        openEditType(t.id)
                      }}
                      title="Редактировать подтип"
                      aria-label="Редактировать подтип"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="simplified-template__type-icon-btn simplified-template__type-icon-btn--danger"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeType(t.id)
                        if (editingTypeId === t.id) closeEditType()
                      }}
                      title="Удалить подтип"
                      aria-label="Удалить подтип"
                      disabled={value.types!.length <= 1}
                    >
                      ✕
                    </button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <Modal
        isOpen={!!editingType}
        onClose={closeEditType}
        title={editingType ? `Подтип: ${editingType.name}` : 'Редактирование подтипа'}
        headerExtra={
          editingType ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setDefaultType(editingType.id)}
              disabled={!!editingType.default}
              title="Сделать этот вариант подтипом по умолчанию в списке и калькуляторе"
            >
              По умолчанию
            </Button>
          ) : undefined
        }
        size="xl"
        className="simplified-template__type-edit-modal"
        headerClassName="subtype-edit-modal__header-bar"
        bodyClassName="p-0"
      >
        {editingType && (
          <div className="simplified-template__type-modal">
            <div className="simplified-template__type-modal-scroll subtype-edit-modal__scroll">
              <section className="subtype-edit-panel">
                <SubtypePanelHeader
                  step={1}
                  title="Контент для сайта"
                  lede="Изображение, описания и списки для витрины."
                />
                <div className="subtype-edit-panel__body">
                  <div className="simplified-template__type-website-field" style={{ marginBottom: 12 }}>
                    <label>Ключ URL (подтип)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={draftSubtypeKey}
                      onChange={(e) => setDraftSubtypeKey(e.target.value)}
                      placeholder="латиница, цифры, дефис — уникален в системе"
                      autoComplete="off"
                    />
                    <p className="text-muted text-sm" style={{ marginTop: 6 }}>
                      Не должен совпадать с ключом другого продукта или подтипа. Пусто — только числовой id в ссылках.
                    </p>
                  </div>
                  <div className="subtype-edit-website-layout">
                    <div className="subtype-edit-website-layout__image">
                      <div className="simplified-template__type-website-field">
                        <label>Изображение</label>
                        <SubtypeImageUploader
                          imageUrl={draftImageUrl || undefined}
                          subtypeName={editingType.name}
                          onUploaded={(url) => setDraftImageUrl(url || '')}
                        />
                      </div>
                    </div>
                    <div className="subtype-edit-website-layout__pair">
                      <div className="simplified-template__type-website-field">
                        <label>Краткое описание</label>
                        <input
                          type="text"
                          className="form-input"
                          value={draftBriefDescription}
                          onChange={(e) => setDraftBriefDescription(e.target.value)}
                          placeholder="Строка для карточки товара"
                        />
                      </div>
                      <div className="simplified-template__type-website-field">
                        <label>Полное описание</label>
                        <textarea
                          className="form-input"
                          rows={4}
                          value={draftFullDescription}
                          onChange={(e) => setDraftFullDescription(e.target.value)}
                          placeholder="Текст для страницы продукта"
                        />
                      </div>
                    </div>
                    <div className="subtype-edit-website-layout__full">
                      <div className="simplified-template__type-website-field">
                        <label>Характеристики</label>
                        <textarea
                          className="form-input"
                          rows={4}
                          value={draftCharacteristicsText}
                          onChange={(e) => setDraftCharacteristicsText(e.target.value)}
                          placeholder="Один пункт на строку"
                        />
                      </div>
                    </div>
                    <div className="subtype-edit-website-layout__full">
                      <div className="simplified-template__type-website-field">
                        <label>Преимущества</label>
                        <textarea
                          className="form-input"
                          rows={3}
                          value={draftAdvantagesText}
                          onChange={(e) => setDraftAdvantagesText(e.target.value)}
                          placeholder="Один пункт на строку"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </section>
              <section className="subtype-edit-panel">
                <SubtypePanelHeader
                  step={2}
                  title="Типы цен"
                  lede="Доступные варианты в калькуляторе для этого подтипа."
                  ledeTitle="Без отдельного списка действует набор у продукта (вкладка «Материалы»). Если там пусто — все активные типы из справочника."
                />
                <div className="subtype-edit-panel__body subtype-edit-panel__body--compact-top">
                  <SubtypeAllowedPriceTypesField
                    productAllowedKeys={productAllowedPriceTypes ?? []}
                    subtypeExplicit={value.typeConfigs?.[String(editingType.id)]?.allowed_price_types}
                    onChange={(keys) =>
                      onChange(updateTypeConfig(value, editingType.id, { allowed_price_types: keys }))
                    }
                  />
                </div>
              </section>
              <section className="subtype-edit-panel">
                <SubtypePanelHeader
                  step={3}
                  title="Значения по умолчанию"
                  lede="Предзаполнение калькулятора на сайте при выборе этого подтипа."
                />
                <div className="subtype-edit-panel__body">
                  <TypeInitialDefaults
                    embedded
                    value={value}
                    typeId={editingType.id}
                    onChange={onChange}
                    services={services}
                    allMaterials={allMaterials ?? []}
                  />
                </div>
              </section>
            </div>
            <div className="simplified-template__type-modal-actions">
              <Button type="button" variant="secondary" size="sm" onClick={closeEditType}>
                Отмена
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={applyTypeDraft}>
                Сохранить
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
