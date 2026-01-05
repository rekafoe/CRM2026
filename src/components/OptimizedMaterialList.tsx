import React, { memo, useMemo, useCallback, useState } from 'react'
import type { Material } from '../types'

interface OptimizedMaterialListProps {
  materials: Material[]
  onEdit: (material: Material) => void
  onDelete: (id: number) => void
  searchTerm?: string
  categoryFilter?: number
  supplierFilter?: number
}

// Мемоизированный компонент элемента материала
const MaterialItem = memo(({ 
  material, 
  onEdit, 
  onDelete 
}: {
  material: Material
  onEdit: (material: Material) => void
  onDelete: (id: number) => void
}) => {
  const handleEdit = useCallback(() => {
    onEdit(material)
  }, [material, onEdit])

  const handleDelete = useCallback(() => {
    onDelete(material.id)
  }, [material.id, onDelete])

  const isLowStock = material.quantity <= (material.min_quantity || 0)

  return (
    <div className={`material-item ${isLowStock ? 'low-stock' : ''}`}>
      <div className="material-info">
        <h4>{material.name}</h4>
        <p>Остаток: {material.quantity} {material.unit}</p>
        {material.category_name && (
          <span className="category-tag" style={{ backgroundColor: material.category_color }}>
            {material.category_name}
          </span>
        )}
        {material.supplier_name && (
          <span className="supplier-tag">{material.supplier_name}</span>
        )}
        {material.sheet_price_single && (
          <span className="price-tag">{material.sheet_price_single} BYN/шт</span>
        )}
      </div>
      <div className="material-actions">
        <button onClick={handleEdit} className="btn-edit">✏️</button>
        <button onClick={handleDelete} className="btn-delete">🗑️</button>
      </div>
    </div>
  )
})

MaterialItem.displayName = 'MaterialItem'

// Компонент поиска и фильтров
const MaterialFilters = memo(({ 
  searchTerm, 
  onSearchChange, 
  categoryFilter, 
  onCategoryChange, 
  supplierFilter, 
  onSupplierChange,
  categories,
  suppliers
}: {
  searchTerm: string
  onSearchChange: (term: string) => void
  categoryFilter: number | undefined
  onCategoryChange: (id: number | undefined) => void
  supplierFilter: number | undefined
  onSupplierChange: (id: number | undefined) => void
  categories: Array<{ id: number; name: string }>
  suppliers: Array<{ id: number; name: string }>
}) => {
  return (
    <div className="material-filters">
      <input
        type="text"
        placeholder="Поиск материалов..."
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        className="search-input"
      />
      <select
        value={categoryFilter || ''}
        onChange={(e) => onCategoryChange(e.target.value ? Number(e.target.value) : undefined)}
        className="filter-select"
      >
        <option value="">Все категории</option>
        {categories.map(cat => (
          <option key={cat.id} value={cat.id}>{cat.name}</option>
        ))}
      </select>
      <select
        value={supplierFilter || ''}
        onChange={(e) => onSupplierChange(e.target.value ? Number(e.target.value) : undefined)}
        className="filter-select"
      >
        <option value="">Все поставщики</option>
        {suppliers.map(supp => (
          <option key={supp.id} value={supp.id}>{supp.name}</option>
        ))}
      </select>
    </div>
  )
})

MaterialFilters.displayName = 'MaterialFilters'

// Основной компонент списка материалов
const OptimizedMaterialList = memo(({ 
  materials, 
  onEdit, 
  onDelete,
  searchTerm = '',
  categoryFilter,
  supplierFilter
}: OptimizedOrderListProps) => {
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm)
  const [localCategoryFilter, setLocalCategoryFilter] = useState(categoryFilter)
  const [localSupplierFilter, setLocalSupplierFilter] = useState(supplierFilter)

  // Мемоизируем фильтрацию материалов
  const filteredMaterials = useMemo(() => {
    return materials.filter(material => {
      const matchesSearch = !localSearchTerm || 
        material.name.toLowerCase().includes(localSearchTerm.toLowerCase())
      
      const matchesCategory = !localCategoryFilter || 
        material.category_id === localCategoryFilter
      
      const matchesSupplier = !localSupplierFilter || 
        material.supplier_id === localSupplierFilter

      return matchesSearch && matchesCategory && matchesSupplier
    })
  }, [materials, localSearchTerm, localCategoryFilter, localSupplierFilter])

  // Мемоизируем категории и поставщиков
  const categories = useMemo(() => {
    const uniqueCategories = new Map()
    materials.forEach(material => {
      if (material.category_id && material.category_name) {
        uniqueCategories.set(material.category_id, {
          id: material.category_id,
          name: material.category_name
        })
      }
    })
    return Array.from(uniqueCategories.values())
  }, [materials])

  const suppliers = useMemo(() => {
    const uniqueSuppliers = new Map()
    materials.forEach(material => {
      if (material.supplier_id && material.supplier_name) {
        uniqueSuppliers.set(material.supplier_id, {
          id: material.supplier_id,
          name: material.supplier_name
        })
      }
    })
    return Array.from(uniqueSuppliers.values())
  }, [materials])

  const handleSearchChange = useCallback((term: string) => {
    setLocalSearchTerm(term)
  }, [])

  const handleCategoryChange = useCallback((id: number | undefined) => {
    setLocalCategoryFilter(id)
  }, [])

  const handleSupplierChange = useCallback((id: number | undefined) => {
    setLocalSupplierFilter(id)
  }, [])

  return (
    <div className="optimized-material-list">
      <MaterialFilters
        searchTerm={localSearchTerm}
        onSearchChange={handleSearchChange}
        categoryFilter={localCategoryFilter}
        onCategoryChange={handleCategoryChange}
        supplierFilter={localSupplierFilter}
        onSupplierChange={handleSupplierChange}
        categories={categories}
        suppliers={suppliers}
      />
      <div className="materials-grid">
        {filteredMaterials.map((material) => (
          <MaterialItem
            key={material.id}
            material={material}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
      {filteredMaterials.length === 0 && (
        <div className="no-results">
          Материалы не найдены
        </div>
      )}
    </div>
  )
})

OptimizedMaterialList.displayName = 'OptimizedMaterialList'

export default OptimizedMaterialList

