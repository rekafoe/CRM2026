import React, { useState } from 'react'
import { getMaterials, createOrUpdateRule } from '../api'

interface Material {
  id: number
  name: string
  unit: string
  sheet_price_single?: number
  category_name?: string
  category_color?: string
}

interface BulkRule {
  material_id: number
  qty_per_item: number
  calculation_type: 'per_item' | 'per_sheet' | 'per_sqm' | 'fixed'
  is_required: boolean
  notes?: string
}

interface BulkRulesCreatorProps {
  productType: string
  productName: string
  onRulesCreated: () => void
  onClose: () => void
}

export const BulkRulesCreator: React.FC<BulkRulesCreatorProps> = ({
  productType,
  productName,
  onRulesCreated,
  onClose
}) => {
  const [materials, setMaterials] = useState<Material[]>([])
  const [rules, setRules] = useState<BulkRule[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  React.useEffect(() => {
    loadMaterials()
  }, [])

  const loadMaterials = async () => {
    try {
      setLoading(true)
      const materialsData = await getMaterials()
      setMaterials(materialsData)
    } catch (error) {
      console.error('Ошибка загрузки материалов:', error)
    } finally {
      setLoading(false)
    }
  }

  const addRule = () => {
    setRules(prev => [...prev, {
      material_id: 0,
      qty_per_item: 1,
      calculation_type: 'per_item',
      is_required: true
    }])
  }

  const updateRule = (index: number, field: keyof BulkRule, value: any) => {
    setRules(prev => prev.map((rule, i) => 
      i === index ? { ...rule, [field]: value } : rule
    ))
  }

  const removeRule = (index: number) => {
    setRules(prev => prev.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    const validRules = rules.filter(rule => rule.material_id > 0)
    
    if (validRules.length === 0) {
      alert('Добавьте хотя бы одно правило')
      return
    }

    try {
      setSaving(true)
      
      for (const rule of validRules) {
        await createOrUpdateRule({
          product_type: productType,
          product_name: productName,
          material_id: rule.material_id,
          qty_per_item: rule.qty_per_item,
          calculation_type: rule.calculation_type,
          is_required: rule.is_required,
          notes: rule.notes
        })
      }
      
      onRulesCreated()
      onClose()
    } catch (error) {
      console.error('Ошибка сохранения правил:', error)
      alert('Ошибка при сохранении правил')
    } finally {
      setSaving(false)
    }
  }

  const getCalculationTypeText = (type: string) => {
    switch (type) {
      case 'per_item': return 'На единицу'
      case 'per_sheet': return 'На лист'
      case 'per_sqm': return 'На кв.м'
      case 'fixed': return 'Фиксированно'
      default: return type
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '20px' }}>
        <div>Загрузка материалов...</div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '24px',
        width: '90%',
        maxWidth: '1000px',
        maxHeight: '90%',
        overflowY: 'auto'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          borderBottom: '2px solid #f0f0f0',
          paddingBottom: '15px'
        }}>
          <h3 style={{ margin: 0 }}>
            Массовое создание правил для {productType} - {productName}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#666'
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <button
            onClick={addRule}
            style={{
              padding: '10px 20px',
              backgroundColor: '#4caf50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            + Добавить правило
          </button>
        </div>

        {rules.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px', 
            backgroundColor: '#f9f9f9', 
            borderRadius: '8px',
            border: '2px dashed #ddd'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '15px' }}>➕</div>
            <h4 style={{ margin: '0 0 10px 0', color: '#666' }}>Нет правил для добавления</h4>
            <p style={{ margin: 0, color: '#888' }}>Нажмите "Добавить правило" чтобы начать</p>
          </div>
        ) : (
          <div style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            overflow: 'hidden',
            backgroundColor: 'white'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f5f5f5' }}>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Материал</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Количество</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Тип расчета</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Обязательный</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Примечания</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '12px' }}>
                      <select
                        value={rule.material_id}
                        onChange={(e) => updateRule(index, 'material_id', Number(e.target.value))}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          fontSize: '14px'
                        }}
                      >
                        <option value={0}>Выберите материал</option>
                        {materials.map(material => (
                          <option key={material.id} value={material.id}>
                            {material.name} ({material.unit}) - {material.sheet_price_single || 0} BYN
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <input
                        type="number"
                        value={rule.qty_per_item}
                        onChange={(e) => updateRule(index, 'qty_per_item', Number(e.target.value))}
                        min="0.01"
                        step="0.01"
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          fontSize: '14px'
                        }}
                      />
                    </td>
                    <td style={{ padding: '12px' }}>
                      <select
                        value={rule.calculation_type}
                        onChange={(e) => updateRule(index, 'calculation_type', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          fontSize: '14px'
                        }}
                      >
                        <option value="per_item">На единицу</option>
                        <option value="per_sheet">На лист</option>
                        <option value="per_sqm">На кв.м</option>
                        <option value="fixed">Фиксированно</option>
                      </select>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <input
                        type="checkbox"
                        checked={rule.is_required}
                        onChange={(e) => updateRule(index, 'is_required', e.target.checked)}
                        style={{ transform: 'scale(1.2)' }}
                      />
                    </td>
                    <td style={{ padding: '12px' }}>
                      <input
                        type="text"
                        value={rule.notes || ''}
                        onChange={(e) => updateRule(index, 'notes', e.target.value)}
                        placeholder="Примечания..."
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          fontSize: '14px'
                        }}
                      />
                    </td>
                    <td style={{ padding: '12px' }}>
                      <button
                        onClick={() => removeRule(index)}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: '#f44336',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '10px 20px',
              backgroundColor: '#f5f5f5',
              color: '#333',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '14px'
            }}
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving || rules.length === 0}
            style={{
              padding: '10px 20px',
              backgroundColor: saving || rules.length === 0 ? '#ccc' : '#4caf50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: saving || rules.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: '14px'
            }}
          >
            {saving ? 'Сохранение...' : `Сохранить ${rules.length} правил`}
          </button>
        </div>
      </div>
    </div>
  )
}
