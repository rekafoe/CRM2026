import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { createProduct, Product } from '../../services/products'
import { getAxiosErrorMessage } from '../../utils/errorUtils'
import './NewProductModal.css'

type ProductType = 'sheet_single' | 'multi_page' | 'universal' | 'sheet_item' | 'multi_page_item'

interface NewProductModalProps {
  onClose: () => void
  onCreated: (product: Product) => void
}

const NewProductModal: React.FC<NewProductModalProps> = ({ onClose, onCreated }) => {
  const [name, setName] = useState('')
  const [calculatorType, setCalculatorType] = useState<'product' | 'operation'>('product')
  const [productType, setProductType] = useState<ProductType>('sheet_single')
  const [description, setDescription] = useState('')
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const productTypeOptions = useMemo(() => (
    calculatorType === 'product'
      ? [
          { value: 'sheet_single', label: 'Листовое изделие' },
          { value: 'multi_page', label: 'Многостраничное' },
          { value: 'universal', label: 'Универсальное' }
        ]
      : [
          { value: 'sheet_item', label: 'Листовое изделие' },
          { value: 'multi_page_item', label: 'Многостраничное изделие' }
        ]
  ), [calculatorType])

  useEffect(() => {
    // сбрасываем тип при переключении калькулятора
    setProductType(calculatorType === 'product' ? 'sheet_single' : 'sheet_item' as ProductType)
  }, [calculatorType])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // без категорий

  const handleSave = async () => {
    if (!name.trim()) return
    try {
      setSaving(true)
      // Иконку пока не загружаем (нет эндпоинта). Используем эмодзи/пусто
      const created = await createProduct({
        // без category_id
        name: name.trim(),
        description: description || undefined,
        icon: undefined,
        calculator_type: calculatorType,
        product_type: productType
      })
      // createProduct возвращает { id, name }, но onCreated ожидает Product
      // Создаем минимальный объект Product для обратной совместимости
      const product: Product = {
        id: created.id,
        name: created.name,
        category_id: 0, // будет установлено позже
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        calculator_type: calculatorType,
        product_type: productType
      }
      onCreated(product)
    } catch (e: unknown) {
      console.error(e)
      const msg = getAxiosErrorMessage(e, 'Ошибка при создании продукта')
      alert(msg)
    } finally {
      setSaving(false)
    }
  }

  const modal = (
    <div className="np-modal-overlay" onMouseDown={(e)=>{ if (e.target === e.currentTarget) onClose() }}>
      <div className="np-modal" onMouseDown={(e)=>e.stopPropagation()}>
        <div className="np-header">
          <h3>Новый продукт</h3>
          <button className="np-close" onClick={onClose}>✕</button>
        </div>
        <div className="np-content">
          <div className="np-form">
            <div className="np-row">
              <label className="np-label">Название</label>
              <input className="np-input" placeholder="Название" value={name} onChange={(e)=>setName(e.target.value)} />
            </div>

            <div className="np-row">
              <label className="np-label">Для расчёта</label>
              <select 
                className="np-select" 
                value={calculatorType} 
                onChange={(e) => {
                  const value = e.target.value as 'product' | 'operation'
                  setCalculatorType(value)
                }}
              >
                <option value="product">Продуктовый калькулятор</option>
                <option value="operation">Операционный калькулятор</option>
              </select>
            </div>

            <div className="np-row">
              <label className="np-label">Тип продукции</label>
              <select 
                className="np-select" 
                value={productType} 
                onChange={(e) => {
                  const value = e.target.value as ProductType
                  setProductType(value)
                }}
              >
                {productTypeOptions.map(o=> (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            

            <div className="np-row">
              <label className="np-label">Иконка</label>
              <div className="np-file">
                <input type="file" onChange={(e)=>setIconFile(e.target.files?.[0] || null)} />
                <span className="np-file-name">{iconFile?.name || 'Файл не выбран'}</span>
              </div>
            </div>

            <div className="np-row np-row-textarea">
              <label className="np-label">Описание</label>
              <textarea className="np-textarea" placeholder="Описание" value={description} onChange={(e)=>setDescription(e.target.value)} />
            </div>

            
          </div>
        </div>
        <div className="np-footer">
          <button className="np-save" disabled={!name.trim() || saving} onClick={handleSave}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

export default NewProductModal


