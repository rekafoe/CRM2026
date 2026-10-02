import React, { useMemo, useState, useEffect } from 'react'
import { getPaperTypesFromWarehouse, type PaperTypeForCalculator } from '../../../services/calculatorMaterialService'
import './AllowedMaterialsSection.css'

const AllowedMaterialsSection: React.FC<{
  selectedPaperTypes: string[] // Теперь храним типы бумаги (строки), а не ID материалов
  saving: boolean
  onChange: (paperTypes: string[]) => void
  onSave: () => Promise<void> | void
}> = ({ selectedPaperTypes, saving, onChange, onSave }) => {
  const [q, setQ] = useState('')
  const [paperTypes, setPaperTypes] = useState<PaperTypeForCalculator[]>([])
  const [loading, setLoading] = useState(true)
  //  По умолчанию показываем только выбранные типы, если они есть
  const [showAllTypes, setShowAllTypes] = useState(false)

  useEffect(() => {
    const loadPaperTypes = async () => {
      try {
        setLoading(true)
        const types = await getPaperTypesFromWarehouse()
        setPaperTypes(types)
      } catch (error) {
        console.error('Ошибка загрузки типов бумаги:', error)
      } finally {
        setLoading(false)
      }
    }
    loadPaperTypes()
  }, [])

  //  Фильтруем типы бумаги: если есть выбранные типы и не показываем все - показываем только выбранные
  const filtered = useMemo(() => {
    let typesToShow = paperTypes
    
    // Если есть выбранные типы и не показываем все - показываем только выбранные
    if (selectedPaperTypes.length > 0 && !showAllTypes) {
      typesToShow = paperTypes.filter(pt => selectedPaperTypes.includes(pt.name))
    }
    
    // Применяем поиск
    const term = q.trim().toLowerCase()
    if (!term) return typesToShow
    return typesToShow.filter(pt => 
      `${pt.display_name || pt.name} ${pt.description || ''}`.toLowerCase().includes(term)
    )
  }, [q, paperTypes, selectedPaperTypes, showAllTypes])
  
  //  Если ничего не выбрано - автоматически показываем все типы
  useEffect(() => {
    if (selectedPaperTypes.length === 0 && !showAllTypes) {
      setShowAllTypes(true) // Если ничего не выбрано - показываем все типы
    }
  }, [selectedPaperTypes.length, showAllTypes])

  const toggle = (paperTypeName: string) => {
    if (selectedPaperTypes.includes(paperTypeName)) {
      onChange(selectedPaperTypes.filter(x => x !== paperTypeName))
    } else {
      onChange([...selectedPaperTypes, paperTypeName])
    }
  }

  return (
    <div className="form-section">
      <div className="form-section__header">
        <h3>Разрешённые типы бумаги</h3>
        <p className="form-section__subtitle">
          Выберите типы бумаги из склада, которые разрешены для этого продукта в калькуляторе
        </p>
      </div>
      <div className="form-section__content">
        <div className="am-selected-count">
          Выбрано: {selectedPaperTypes.length}
          {selectedPaperTypes.length > 0 && !showAllTypes && (
            <button 
              type="button"
              className="btn-secondary" 
              style={{ marginLeft: '10px', fontSize: '0.85em', padding: '4px 8px' }}
              onClick={() =>setShowAllTypes(true)}
            >
              Показать все типы
            </button>
          )}
          {selectedPaperTypes.length > 0 && showAllTypes && (
            <button 
              type="button"
              className="btn-secondary" 
              style={{ marginLeft: '10px', fontSize: '0.85em', padding: '4px 8px' }}
              onClick={() =>setShowAllTypes(false)}
            >
              Показать только выбранные
            </button>
          )}
        </div>
        <div className="parameters-list">
          <div className="parameter-item">
            <div className="parameter-info"><h5>Поиск</h5></div>
            <input 
              className="form-input" 
              value={q} 
              onChange={(e) => setQ(e.target.value)} 
              placeholder="Поиск по названию типа бумаги" 
            />
          </div>
          <div className="parameter-item">
            <div className="parameter-info"><h5>Выбор типов бумаги</h5></div>
            {loading ? (
              <div className="form-control" style={{ color: '#666' }}>
                Загрузка типов бумаги из склада...
              </div>
            ) : (
              <>
                {selectedPaperTypes.length > 0 && !showAllTypes && (
                  <div className="alert alert-info" style={{ fontSize: '0.85em', marginBottom: '1rem' }}>
                    <small> Показаны только выбранные типы бумаги ({selectedPaperTypes.length}). Нажмите "Показать все типы", чтобы добавить новые.</small>
                  </div>
                )}
                <div className="am-list-box">
                <div className="am-group">
                  <div className="am-group-header">
                    <div className="am-group-title">Типы бумаги</div>
                    <div className="am-actions">
                      <button 
                        type="button" 
                        className="btn-secondary" 
                        onClick={() =>{
                          const allTypes = filtered.map(pt => pt.name)
                          onChange([...new Set([...selectedPaperTypes, ...allTypes])])
                        }}
                      >
                        Выбрать все
                      </button>
                      <button 
                        type="button" 
                        className="btn-secondary" 
                        onClick={() =>{
                          const filteredNames = filtered.map(pt => pt.name)
                          onChange(selectedPaperTypes.filter(name => !filteredNames.includes(name)))
                        }}
                      >
                        Снять все
                      </button>
                    </div>
                  </div>
                  {filtered.length === 0 ? (
                    <div className="am-item" style={{ color: '#666', fontStyle: 'italic' }}>
                      Типы бумаги не найдены
                    </div>
                  ) : (
                    filtered.map(pt => (
                      <label key={pt.name} className="am-item">
                        <input 
                          type="checkbox" 
                          checked={selectedPaperTypes.includes(pt.name)} 
                          onChange={() => toggle(pt.name)} 
                        />
                        <span>{pt.display_name || pt.name}</span>
                        {pt.densities && pt.densities.length > 0 && (
                          <span className="am-meta">
                            &nbsp;• {pt.densities.length} плотност{pt.densities.length === 1 ? 'ь' : 'ей'}
                          </span>
                        )}
                        {pt.description && (
                          <span className="am-meta" style={{ fontSize: '0.85em', color: '#666' }}>
                            &nbsp;• {pt.description}
                          </span>
                        )}
                      </label>
                    ))
                  )}
                </div>
              </div>
              </>
            )}
          </div>
          <div className="form-section__actions">
            <button 
              className="btn-primary" 
              disabled={saving || loading} 
              onClick={() =>onSave()}
            >
              {saving ? 'Сохранение…' : 'Сохранить разрешённые типы'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AllowedMaterialsSection


