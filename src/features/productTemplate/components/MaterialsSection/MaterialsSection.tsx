import React, { useEffect, useMemo, useState } from 'react'
import { bulkAddProductMaterials } from '../../../../services/products'
import { Modal } from '../../../../components/common'
import { getPaperTypes } from '../../../../api'
import { computeItemsPerSheet, getPresetSize } from '../PrintSheetSection'

type MaterialOption = {
  id: number
  name: string
  category_name?: string
  unit?: string
  quantity?: number
  min_quantity?: number | null
  paper_type_id?: number | null // 🆕 Добавляем paper_type_id
}

type ProductMaterial = {
  id?: number
  material_id: number
  material_name?: string
  category_name?: string
  qty_per_sheet?: number
  is_required?: number | boolean
}

interface MaterialsSectionProps {
  materials: ProductMaterial[]
  allMaterials: MaterialOption[]
  productId?: number
  allowedPaperTypes?: string[] // 🆕 Разрешенные типы бумаги (имена, например ['polumat', 'mel'])
  trimSize?: { width: string; height: string }
  printSheet?: { preset?: 'SRA3' | 'A3' | 'А4' | ''; width: string; height: string }
  testQty?: number
  defaultPages?: number
  defaultSides?: 1 | 2
  productType?: string // 🆕 Тип продукта (sheet_single, multi_page, etc.)
  onAdd: (payload: { material_id: number; qty_per_sheet: number; is_required?: boolean }) => Promise<void> | void
  onUpdate: (materialId: number, qty: number, isRequired?: boolean) => Promise<void> | void
  onBulkAdd?: (materials: Array<{ material_id: number; qty_per_sheet?: number; is_required?: boolean }>) => Promise<void> | void
  onRemove: (material: ProductMaterial) => Promise<void> | void
}

const DEFAULT_QTY = 1

const MaterialsSection: React.FC<MaterialsSectionProps> = ({ materials, allMaterials, productId, allowedPaperTypes = [], trimSize, printSheet, testQty, defaultPages, defaultSides, productType, onAdd, onUpdate, onBulkAdd, onRemove }) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null)
  const [newQtyPerSheet, setNewQtyPerSheet] = useState(DEFAULT_QTY)
  const [isRequired, setIsRequired] = useState(true)
  const [editingQty, setEditingQty] = useState<Record<number, number>>({})
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkSelected, setBulkSelected] = useState<Set<number>>(new Set())
  const [bulkQty, setBulkQty] = useState<Record<number, number>>({})
  const [bulkRequired, setBulkRequired] = useState<Record<number, boolean>>({})
  const [bulkAdding, setBulkAdding] = useState(false)
  const [paperTypes, setPaperTypes] = useState<Array<{ id: number; name: string }>>([]) // 🆕 Типы бумаги для фильтрации
  const [loadingPaperTypes, setLoadingPaperTypes] = useState(false)
  const [pagesPerProduct, setPagesPerProduct] = useState(() => (Number(defaultPages) || 0) || 8)
  const [multiPageQty, setMultiPageQty] = useState(() => Number(testQty) || 100)
  const [printSides, setPrintSides] = useState<1 | 2>(() => (defaultSides === 1 ? 1 : 2))

  useEffect(() => {
    setPagesPerProduct((Number(defaultPages) || 0) || 8)
  }, [defaultPages])

  useEffect(() => {
    setMultiPageQty(Number(testQty) || 100)
  }, [testQty])

  useEffect(() => {
    setPrintSides(defaultSides === 1 ? 1 : 2)
  }, [defaultSides])
  // 🆕 Загружаем типы бумаги для фильтрации
  useEffect(() => {
    if (allowedPaperTypes.length === 0) {
      setPaperTypes([])
      return // Если ограничений нет - не загружаем
    }
    
    let cancelled = false
    const loadPaperTypes = async () => {
      try {
        setLoadingPaperTypes(true)
        // Загружаем типы бумаги через API, чтобы получить реальные ID
        const response = await getPaperTypes()
        const types = Array.isArray(response.data) ? response.data : (Array.isArray(response.data?.data) ? response.data.data : [])
        
        // Создаем маппинг name -> id для быстрого поиска
        const typeMap = types
          .filter((pt: any) => pt.name && pt.id)
          .map((pt: any) => ({ id: Number(pt.id), name: pt.name }))
        
        if (!cancelled) {
          setPaperTypes(typeMap)
          console.log('📋 [MaterialsSection] Загружены типы бумаги для фильтрации:', {
            allowedPaperTypes,
            loadedTypes: typeMap,
            totalTypes: types.length
          })
        }
      } catch (error) {
        console.error('Ошибка загрузки типов бумаги для фильтрации:', error)
        if (!cancelled) {
          setPaperTypes([])
        }
      } finally {
        if (!cancelled) {
          setLoadingPaperTypes(false)
        }
      }
    }
    loadPaperTypes()
    return () => { cancelled = true }
  }, [allowedPaperTypes.length])

  useEffect(() => {
    const map: Record<number, number> = {}
    materials.forEach((material) => {
      const id = Number(material.material_id ?? material.id)
      if (!Number.isFinite(id)) return
      map[id] = Number(material.qty_per_sheet ?? DEFAULT_QTY)
    })
    setEditingQty(map)
  }, [materials])

  // 🆕 Фильтруем материалы по разрешенным типам бумаги
  const filteredMaterials = useMemo(() => {
    let materialsToShow = allMaterials
    
    // Если есть разрешенные типы бумаги - фильтруем материалы
    if (allowedPaperTypes.length > 0 && paperTypes.length > 0) {
      // Получаем ID разрешенных типов бумаги
      const allowedPaperTypeIds = new Set(
        paperTypes
          .filter(pt => allowedPaperTypes.includes(pt.name))
          .map(pt => Number(pt.id))
      )
      
      console.log('🔍 [MaterialsSection] Фильтрация материалов:', {
        allowedPaperTypes,
        allowedPaperTypeIds: Array.from(allowedPaperTypeIds),
        paperTypes,
        totalMaterials: allMaterials.length
      })
      
      // Фильтруем материалы, у которых paper_type_id соответствует разрешенным типам
      materialsToShow = allMaterials.filter((material) => {
        // Если у материала нет paper_type_id - НЕ показываем его (строгая фильтрация)
        if (!material.paper_type_id) return false
        
        // Проверяем, есть ли paper_type_id материала в разрешенных
        const isAllowed = allowedPaperTypeIds.has(Number(material.paper_type_id))
        
        if (!isAllowed) {
          console.log(`❌ [MaterialsSection] Материал "${material.name}" (paper_type_id: ${material.paper_type_id}) не разрешен`)
        }
        
        return isAllowed
      })
      
      console.log('✅ [MaterialsSection] Отфильтровано материалов:', {
        before: allMaterials.length,
        after: materialsToShow.length,
        filtered: materialsToShow.map(m => ({ id: m.id, name: m.name, paper_type_id: m.paper_type_id }))
      })
    } else if (allowedPaperTypes.length > 0 && paperTypes.length === 0 && !loadingPaperTypes) {
      // Если ограничения есть, но типы бумаги еще не загружены - показываем все (временно)
      console.warn('⚠️ [MaterialsSection] Ограничения есть, но типы бумаги не загружены')
    }
    
    // Применяем поиск
    if (!searchTerm.trim()) return materialsToShow
    const term = searchTerm.toLowerCase()
    return materialsToShow.filter((material) =>
      `${material.id}`.includes(term) ||
      material.name.toLowerCase().includes(term) ||
      (material.category_name || '').toLowerCase().includes(term)
    )
  }, [allMaterials, searchTerm, allowedPaperTypes, paperTypes, loadingPaperTypes])

  const summary = useMemo(() => {
    const total = materials.length
    const required = materials.filter((m) => (m.is_required ?? true)).length
    return { total, required }
  }, [materials])

  const resolvedSheetSize = useMemo(() => {
    if (!printSheet) return { width: 0, height: 0 }
    const presetSize = getPresetSize((printSheet.preset ?? '') as 'SRA3' | 'A3' | 'А4' | '')
    const width = Number(presetSize?.width ?? printSheet.width) || 0
    const height = Number(presetSize?.height ?? printSheet.height) || 0
    return { width, height }
  }, [printSheet])

  const resolvedTrimSize = useMemo(() => ({
    width: Number(trimSize?.width) || 0,
    height: Number(trimSize?.height) || 0
  }), [trimSize])

  const itemsPerSheet = useMemo(() => {
    if (!resolvedSheetSize.width || !resolvedSheetSize.height || !resolvedTrimSize.width || !resolvedTrimSize.height) {
      return 0
    }
    return computeItemsPerSheet(resolvedTrimSize, resolvedSheetSize)
  }, [resolvedSheetSize, resolvedTrimSize])

  const pagesPerSheet = itemsPerSheet * (printSides === 2 ? 2 : 1)
  const sheetsPerProduct = pagesPerSheet > 0 && pagesPerProduct > 0 ? Math.ceil(pagesPerProduct / pagesPerSheet) : null
  const totalSheetsNeeded = sheetsPerProduct != null ? sheetsPerProduct * Math.max(0, multiPageQty || 0) : null

  const resetNewMaterialForm = () => {
    setSelectedMaterialId(null)
    setNewQtyPerSheet(DEFAULT_QTY)
    setIsRequired(true)
    setSearchTerm('')
  }

  const handleAddMaterial = async () => {
    if (!selectedMaterialId || newQtyPerSheet <= 0) return
    await onAdd({
      material_id: selectedMaterialId,
      qty_per_sheet: newQtyPerSheet,
      is_required: isRequired
    })
    resetNewMaterialForm()
  }

  const handleQtyBlur = async (material: ProductMaterial) => {
    const materialId = Number(material.material_id ?? material.id)
    if (!materialId) return
    const currentQty = Number(material.qty_per_sheet ?? DEFAULT_QTY)
    const nextQty = Number(editingQty[materialId] ?? currentQty)
    if (!Number.isFinite(nextQty) || nextQty <= 0 || nextQty === currentQty) return
    try {
      setUpdatingId(materialId)
      await onUpdate(materialId, nextQty, Boolean(material.is_required ?? true))
    } finally {
      setUpdatingId(null)
    }
  }

  const handleBulkAdd = async () => {
    if (!onBulkAdd || bulkSelected.size === 0) return
    try {
      setBulkAdding(true)
      const payload = Array.from(bulkSelected).map((materialId) => ({
        material_id: materialId,
        qty_per_sheet: bulkQty[materialId] || DEFAULT_QTY,
        is_required: bulkRequired[materialId] !== false
      }))
      await onBulkAdd(payload)
      setShowBulkModal(false)
      setBulkSelected(new Set())
      setBulkQty({})
      setBulkRequired({})
    } catch (error) {
      console.error('Bulk add failed', error)
    } finally {
      setBulkAdding(false)
    }
  }

  const toggleBulkSelection = (materialId: number) => {
    const next = new Set(bulkSelected)
    if (next.has(materialId)) {
      next.delete(materialId)
      const { [materialId]: _, ...restQty } = bulkQty
      const { [materialId]: __, ...restRequired } = bulkRequired
      setBulkQty(restQty)
      setBulkRequired(restRequired)
    } else {
      next.add(materialId)
      setBulkQty((prev) => ({ ...prev, [materialId]: DEFAULT_QTY }))
      setBulkRequired((prev) => ({ ...prev, [materialId]: true }))
    }
    setBulkSelected(next)
  }

  const availableForBulk = useMemo(() => {
    const existingIds = new Set(materials.map((m) => Number(m.material_id ?? m.id)))
    return allMaterials.filter((m) => !existingIds.has(Number(m.id)))
  }, [allMaterials, materials])

  const renderStockBadge = (option?: MaterialOption) => {
    if (!option || option.quantity === undefined) return null
    const quantity = Number(option.quantity)
    const min = option.min_quantity == null ? null : Number(option.min_quantity)
    const low = min != null && quantity <= min
    return (
      <span
        style={{
          marginLeft: 8,
          padding: '2px 6px',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 500,
          background: low ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)',
          color: low ? '#b91c1c' : '#047857'
        }}
      >
        {quantity} {option.unit || ''}{min != null ? ` (мин. ${min})` : ''}
      </span>
    )
  }

  return (
    <div className="form-section">
      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Материалы</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Всего: {summary.total} • Обязательных: {summary.required}
          </p>
          {allowedPaperTypes.length > 0 && (
            <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#3b82f6' }}>
              ℹ️ Показаны только материалы с разрешенными типами бумаги: {allowedPaperTypes.join(', ')}
            </p>
          )}

          {/* Подсказки для разных типов продуктов */}
          {productType === 'multi_page' && (
            <div className="alert alert-info" style={{ margin: '8px 0', padding: '8px 12px', fontSize: 12 }}>
              <strong>📚 Многостраничные изделия</strong>
              <p style={{ margin: '4px 0 0 0' }}>
                Для буклетов и брошюр часто используют разные материалы для обложки и внутренних страниц.
                Добавьте материалы с пометками "Обложка" и "Внутренние страницы".
              </p>
            </div>
          )}

          {productType === 'universal' && (
            <div className="alert alert-warning" style={{ margin: '8px 0', padding: '8px 12px', fontSize: 12 }}>
              <strong>🔧 Универсальный продукт</strong>
              <p style={{ margin: '4px 0 0 0' }}>
                Укажите все необходимые материалы для вашего специального продукта.
              </p>
            </div>
          )}
          {productType === 'multi_page' && (
            <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#3b82f6', fontWeight: 500 }}>
              ⚠️ Для многостраничных изделий: учитывайте, что на одном печатном листе может быть несколько страниц (4, 8, 16). 
              Поле "Расход, шт/лист" критично для правильного расчета!
            </p>
          )}
        </div>
        {onBulkAdd && availableForBulk.length > 0 && (
          <button
            className="btn-secondary"
            onClick={() => setShowBulkModal(true)}
            style={{ fontSize: 13, padding: '6px 12px' }}
          >
            📦 Массовое добавление ({availableForBulk.length})
          </button>
        )}
      </div>

      {productType === 'multi_page' && (
        <div className="template-card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <h4 style={{ margin: 0 }}>Авторасчёт листов для многостраничного изделия</h4>
              <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#475569' }}>
                Учитываем формат страницы, печатный лист и двусторонность, чтобы понять расход листов.
              </p>
            </div>
            <div style={{ fontSize: 12, color: '#059669' }}>
              {itemsPerSheet > 0 ? `Укладка страницы: ${itemsPerSheet} шт/лист` : 'Укладка не настроена'}
            </div>
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div>
              <label className="form-label">Страниц в изделии</label>
              <input
                type="number"
                min={2}
                step={2}
                className="form-input"
                value={pagesPerProduct}
                onChange={(event) => setPagesPerProduct(Math.max(1, Number(event.target.value) || 0))}
              />
            </div>
            <div>
              <label className="form-label">Тираж, шт</label>
              <input
                type="number"
                min={1}
                className="form-input"
                value={multiPageQty}
                onChange={(event) => setMultiPageQty(Math.max(1, Number(event.target.value) || 1))}
              />
            </div>
            <div>
              <label className="form-label">Печать</label>
              <select
                className="form-select"
                value={printSides}
                onChange={(event) => setPrintSides(event.target.value === '1' ? 1 : 2)}
              >
                <option value="2">Двусторонняя</option>
                <option value="1">Односторонняя</option>
              </select>
            </div>
            <div>
              <label className="form-label">Страниц на лист</label>
              <div className="form-control" style={{ fontWeight: 600 }}>
                {pagesPerSheet > 0 ? pagesPerSheet : '—'}
              </div>
              <p style={{ fontSize: 11, margin: '4px 0 0 0', color: '#475569' }}>
                {itemsPerSheet > 0 ? `${itemsPerSheet} страниц на стороне × ${printSides === 2 ? '2 стороны' : '1 сторона'}` : 'Настройте раскладку в блоке "Печатный лист"'}
              </p>
            </div>
          </div>
          <div style={{ marginTop: 12, padding: 12, border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc' }}>
            {sheetsPerProduct != null ? (
              <>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  Листов на изделие: {sheetsPerProduct}
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  На тираж {multiPageQty} шт потребуется <strong>{totalSheetsNeeded}</strong> листов ({printSides === 2 ? 'двусторонняя' : 'односторонняя'} печать).
                </div>
              </>
            ) : (
              <div style={{ color: '#b91c1c', fontSize: 13 }}>
                Чтобы рассчитать расход листов, задайте обрезной формат и печатный лист в разделе "Конфигурация".
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: 8, textAlign: 'left' }}>Материал</th>
                <th style={{ padding: 8, textAlign: 'left' }}>Категория</th>
                <th style={{ padding: 8, textAlign: 'center' }}>Обязательный</th>
                <th style={{ padding: 8, textAlign: 'center' }}>
                  Расход (шт/лист)
                  {productType === 'multi_page' && (
                    <span style={{ display: 'block', fontSize: '10px', fontWeight: 'normal', color: '#3b82f6', marginTop: '2px' }}>
                      ⚠️ Важно для многостраничных
                    </span>
                  )}
                  {productType === 'sheet_single' && (
                    <span style={{ display: 'block', fontSize: '10px', fontWeight: 'normal', color: '#64748b', marginTop: '2px' }}>
                      Обычно 1 для бумаги
                    </span>
                  )}
                </th>
                <th style={{ padding: 8, textAlign: 'center' }}>Склад</th>
                <th style={{ padding: 8, textAlign: 'center' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {materials.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 12, textAlign: 'center', color: '#64748b' }}>
                    Материалы не привязаны. Добавьте необходимое сырьё для расчёта.
                  </td>
                </tr>
              )}
              {materials.map((material) => {
                const materialId = Number(material.material_id ?? material.id)
                const option = allMaterials.find((m) => Number(m.id) === materialId)
                const qtyValue = editingQty[materialId] ?? Number(material.qty_per_sheet ?? DEFAULT_QTY)
                const required = Boolean(material.is_required ?? true)
                return (
                  <tr key={materialId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: 8, fontWeight: 500 }}>
                      {material.material_name || option?.name || `Материал #${materialId}`}
                    </td>
                    <td style={{ padding: 8, color: '#475569' }}>{material.category_name || option?.category_name || '—'}</td>
                    <td style={{ padding: 8, textAlign: 'center' }}>{required ? '✅' : '—'}</td>
                    <td style={{ padding: 8, textAlign: 'center' }}>
                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        value={qtyValue}
                        onChange={(event) => {
                          const next = Number(event.target.value)
                          setEditingQty((prev) => ({ ...prev, [materialId]: next }))
                        }}
                        onBlur={() => void handleQtyBlur(material)}
                        style={{ width: 100, textAlign: 'center' }}
                        disabled={updatingId === materialId}
                      />
                    </td>
                    <td style={{ padding: 8, textAlign: 'center' }}>
                      {renderStockBadge(option)}
                    </td>
                    <td style={{ padding: 8, textAlign: 'center' }}>
                      <button
                        className="btn-quick-action"
                        onClick={() => onRemove(material)}
                        disabled={updatingId === materialId}
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="template-card" style={{ padding: 16 }}>
          <h4 style={{ marginTop: 0, marginBottom: 12 }}>Добавить материал</h4>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 120px 120px auto' }}>
            <div>
              <label className="form-label">Материал</label>
            <input
              className="form-input"
                placeholder="Поиск по ID, названию или категории"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                list="materials-search-datalist"
              />
              <datalist id="materials-search-datalist">
                {filteredMaterials.map((material) => (
                  <option key={material.id} value={`${material.id} ${material.name}`} />
              ))}
            </datalist>
              <select
                className="form-select"
                value={selectedMaterialId ?? ''}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  setSelectedMaterialId(Number.isFinite(value) ? value : null)
                  const option = allMaterials.find((item) => Number(item.id) === value)
                  if (option) {
                    const existing = materials.find((m) => Number(m.material_id ?? m.id) === value)
                    const defaultQty = existing?.qty_per_sheet ?? DEFAULT_QTY
                    setNewQtyPerSheet(Number(defaultQty))
                  }
                }}
                style={{ marginTop: 8 }}
              >
                <option value="">— Выберите из списка —</option>
                {filteredMaterials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.name} ({material.category_name || 'без категории'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">
                Расход, шт/лист
                {productType === 'multi_page' && (
                  <span style={{ marginLeft: '6px', fontSize: '11px', color: '#3b82f6', fontWeight: 'normal' }}>
                    ⚠️ Важно: на одном листе может быть несколько страниц
                  </span>
                )}
                {productType === 'sheet_single' && (
                  <span style={{ marginLeft: '6px', fontSize: '11px', color: '#64748b', fontWeight: 'normal' }}>
                    (обычно 1 для бумаги)
                  </span>
                )}
              </label>
              <input
                type="number"
                min={0.01}
                step={0.01}
                className="form-input"
                value={newQtyPerSheet}
                onChange={(event) => setNewQtyPerSheet(Number(event.target.value))}
                title={productType === 'multi_page' 
                  ? 'Для многостраничных изделий: на одном печатном листе может быть 4, 8, 16 страниц. Учитывайте это при расчете расхода материалов.'
                  : productType === 'sheet_single'
                  ? 'Для листовых изделий (визитки, листовки) расход бумаги обычно равен 1 шт/лист'
                  : 'Количество единиц материала, расходуемых на один печатный лист'
                }
              />
            </div>

            <div>
              <label className="form-label">Обязательный</label>
              <select
                className="form-select"
                value={isRequired ? '1' : '0'}
                onChange={(event) => setIsRequired(event.target.value === '1')}
              >
                <option value="1">Да</option>
                <option value="0">Нет</option>
              </select>
            </div>

            <div style={{ alignSelf: 'end' }}>
              <button
                className="btn-primary"
                onClick={() => void handleAddMaterial()}
                disabled={!selectedMaterialId || newQtyPerSheet <= 0}
              >
                Добавить
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Модальное окно для массового добавления */}
      {showBulkModal && (
        <Modal
          isOpen={showBulkModal}
          onClose={() => {
            setShowBulkModal(false)
            setBulkSelected(new Set())
            setBulkQty({})
            setBulkRequired({})
          }}
          title={`Массовое добавление материалов (${bulkSelected.size} выбрано)`}
          size="lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {availableForBulk.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#64748b', padding: 20 }}>
                Все доступные материалы уже добавлены к продукту
              </p>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="Поиск материалов..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="form-input"
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      const all = new Set(availableForBulk.map((m) => Number(m.id)))
                      setBulkSelected(all)
                      const qtyMap: Record<number, number> = {}
                      const reqMap: Record<number, boolean> = {}
                      availableForBulk.forEach((m) => {
                        qtyMap[Number(m.id)] = DEFAULT_QTY
                        reqMap[Number(m.id)] = true
                      })
                      setBulkQty(qtyMap)
                      setBulkRequired(reqMap)
                    }}
                  >
                    Выбрать все
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setBulkSelected(new Set())
                      setBulkQty({})
                      setBulkRequired({})
                    }}
                  >
                    Снять все
                  </button>
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  {filteredMaterials
                    .filter((m) => availableForBulk.some((am) => Number(am.id) === Number(m.id)))
                    .map((material) => {
                      const materialId = Number(material.id)
                      const isSelected = bulkSelected.has(materialId)
                      return (
                        <div
                          key={materialId}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'auto 1fr auto auto',
                            gap: 12,
                            alignItems: 'center',
                            padding: 12,
                            border: '1px solid #e2e8f0',
                            borderRadius: 8,
                            background: isSelected ? '#f0f9ff' : 'white'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleBulkSelection(materialId)}
                          />
                          <div>
                            <div style={{ fontWeight: 500 }}>{material.name}</div>
                            {material.category_name && (
                              <div style={{ fontSize: 12, color: '#64748b' }}>{material.category_name}</div>
                            )}
                          </div>
                          {isSelected && (
                            <>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <input
                                  type="number"
                                  min={0.01}
                                  step={0.01}
                                  value={bulkQty[materialId] || DEFAULT_QTY}
                                  onChange={(e) =>
                                    setBulkQty((prev) => ({ ...prev, [materialId]: Number(e.target.value) }))
                                  }
                                  className="form-input"
                                  style={{ width: 100, textAlign: 'center' }}
                                  placeholder="шт/лист"
                                  title={productType === 'multi_page' 
                                    ? 'Для многостраничных изделий: на одном печатном листе может быть 4, 8, 16 страниц. Учитывайте это при расчете расхода материалов.'
                                    : productType === 'sheet_single'
                                    ? 'Для листовых изделий (визитки, листовки) расход бумаги обычно равен 1 шт/лист'
                                    : 'Количество единиц материала, расходуемых на один печатный лист'
                                  }
                                />
                                {productType === 'multi_page' && (
                                  <span style={{ fontSize: '9px', color: '#3b82f6', lineHeight: '1.2' }}>
                                    ⚠️ Важно
                                  </span>
                                )}
                                {productType === 'sheet_single' && (
                                  <span style={{ fontSize: '9px', color: '#64748b', lineHeight: '1.2' }}>
                                    обычно 1
                                  </span>
                                )}
                              </div>
                              <select
                                value={bulkRequired[materialId] !== false ? '1' : '0'}
                                onChange={(e) =>
                                  setBulkRequired((prev) => ({ ...prev, [materialId]: e.target.value === '1' }))
                                }
                                className="form-select"
                                style={{ width: 80 }}
                              >
                                <option value="1">Обязат.</option>
                                <option value="0">Опц.</option>
                              </select>
                            </>
                          )}
                        </div>
                      )
                    })}
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setShowBulkModal(false)
                      setBulkSelected(new Set())
                      setBulkQty({})
                      setBulkRequired({})
                    }}
                  >
                    Отмена
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => void handleBulkAdd()}
                    disabled={bulkSelected.size === 0 || bulkAdding}
                  >
                    {bulkAdding ? 'Добавление...' : `Добавить ${bulkSelected.size} материал(ов)`}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

export default MaterialsSection


