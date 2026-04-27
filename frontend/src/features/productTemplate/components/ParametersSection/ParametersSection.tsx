import React, { useMemo, useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Modal } from '../../../../components/common/Modal'
import { apiClient } from '../../../../api/client'
import { MultiPagePresetHelper } from '../../../../components/admin/ProductCreationWizard/components/MultiPagePresetHelper'
import { getParameterPresetsForProductType } from '../../config/productParameterPresets'
import type { ProductParameter, ProductParameterPreset } from '../../../../services/products/types'

const REQUIRED_PARAMETER_KEYS = [
  'tip',
  'format',
  'duplex',
  // Старый параметр (оставляем для обратной совместимости)
  'print_method',
  // 🆕 Новый справочник печати
  'print_technology',
  'print_color_mode',
  'material',
  'density',
  'lamination',
  'round_corners',
  'design',
  'card_holder',
  'stand',
  'proof'
]

interface ParameterPreset {
  preset_key: string;
  label: string;
  field_type: 'select' | 'checkbox' | 'number' | 'text';
  options?: string[];
  is_required?: boolean;
  help_text?: string | null;
}

interface Parameter {
  id?: number;
  name: string;
  label?: string;
  type: 'select' | 'checkbox' | 'number' | 'text' | 'range' | string;
  options?: any;
  default_value?: string | number;
  is_required?: boolean;
  sort_order?: number;
  linked_operation_id?: number;
}

interface ParametersSectionProps {
  parameters: Parameter[];
  presets?: ProductParameterPreset[];
  presetsLoading?: boolean;
  onAddParam: (param: Partial<ProductParameter>) => Promise<void> | void;
  onDeleteParam: (param: { id: number; name?: string; label?: string }) => Promise<void> | void;
  onUpdateParam?: (param: Partial<ProductParameter> & { id: number }) => Promise<void> | void;
  productType?: string; // Тип продукта для адаптации UI
}

const ParametersSection: React.FC<ParametersSectionProps> = ({
  parameters,
  presets = [],
  presetsLoading = false,
  onAddParam,
  onDeleteParam,
  onUpdateParam,
  productType,
}) => {
  const normalized = parameters || []
  const [customParam, setCustomParam] = useState<Parameter>({
    name: '',
    label: '',
    type: 'select',
    options: '',
    is_required: false,
    sort_order: (normalized.length || 0) + 1,
  })
  const [editingParam, setEditingParam] = useState<Parameter | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [availableOperations, setAvailableOperations] = useState<any[]>([])
  const [selectedOperationId, setSelectedOperationId] = useState<number | null>(null)
  const { id: productIdParam } = useParams<{ id: string }>()
  const productId = productIdParam ? Number(productIdParam) : undefined

  // Загружаем доступные операции при открытии модалки
  useEffect(() => {
    if (showAddModal && productId) {
      apiClient.get(`/products/${productId}/operations`)
        .then(response => {
          // API может вернуть { data: [...] } или сразу [...]
          const data = response.data?.data || response.data
          const ops = Array.isArray(data) ? data : []
          setAvailableOperations(ops)
        })
        .catch(err => {
          console.error('❌ Failed to load operations:', err)
          setAvailableOperations([])
        })
    }
  }, [showAddModal, productId])

  const missingPreset = useMemo(() => {
    // Получаем рекомендуемые пресеты для типа продукта
    const recommendedPresets = productType ? getParameterPresetsForProductType(productType) : [];

    // Фильтруем по тем, которые уже есть в продукте
    return recommendedPresets.filter((preset) =>
      !normalized.some((param) => param.name === preset.key)
    );
  }, [presets, normalized, productType])
  const optionalParams = normalized.filter((param) => !REQUIRED_PARAMETER_KEYS.includes(param.name))

  const handleAddPreset = async (preset: any) => {
    // Поддержка старого формата ParameterPreset (из API)
    if (preset.preset_key) {
      await onAddParam({
        name: preset.preset_key,
        label: preset.label,
        type:
          preset.field_type === 'checkbox'
            ? 'checkbox'
            : preset.field_type === 'number'
              ? 'number'
              : 'select',
        options:
          preset.field_type === 'select' && Array.isArray(preset.options)
            ? preset.options
            : undefined,
        is_required: preset.is_required ?? true,
        sort_order: (normalized.length || 0) + 1,
      })
      return
    }

    // Поддержка нового формата ParameterPreset (из конфига)
    if (preset.key) {
      await onAddParam({
        name: preset.key,
        label: preset.label,
        type: preset.type,
        options:
          preset.type === 'select' && Array.isArray(preset.options)
            ? preset.options
            : undefined,
        is_required: preset.is_required,
        sort_order: preset.sort_order || (normalized.length || 0) + 1,
      })
    }
  }

  const handleAddCustom = async () => {
    if (!customParam.label?.trim()) return
    const parsedOptions =
      customParam.type === 'select'
        ? String(customParam.options || '')
            .split(';')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined

    await onAddParam({
      ...customParam,
      name: customParam.name.trim() || customParam.label.trim().toLowerCase().replace(/\s+/g, '_'),
      label: customParam.label.trim(),
      type: customParam.type,
      options: parsedOptions,
      linked_operation_id: selectedOperationId || undefined,
    } as any)
    setCustomParam({
      name: '',
      label: '',
      type: 'select',
      options: '',
      is_required: false,
      sort_order: (normalized.length || 0) + 1,
    })
    setSelectedOperationId(null)
    setShowAddModal(false)
  }

  const handleStartEdit = (param: Parameter) => {
    setEditingParam({
      ...param,
      options: Array.isArray(param.options) ? param.options.join('; ') : String(param.options || '')
    })
    setSelectedOperationId((param as any).linked_operation_id || null)
    
    // Загружаем операции для редактирования
    if (productId) {
      apiClient.get(`/products/${productId}/operations`)
        .then(response => {
          const data = response.data?.data || response.data
          const ops = Array.isArray(data) ? data : []
          setAvailableOperations(ops)
        })
        .catch(err => {
          console.error('Failed to load operations:', err)
          setAvailableOperations([])
        })
    }
  }

  const handleSaveEdit = async () => {
    if (!editingParam || !onUpdateParam) return
    const parsedOptions =
      editingParam.type === 'select'
        ? String(editingParam.options || '')
            .split(';')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined
    await onUpdateParam({
      ...editingParam,
      id: editingParam.id as number,
      label: editingParam.label?.trim() || editingParam.name.trim(),
      options: parsedOptions,
      linked_operation_id: selectedOperationId || undefined,
    } as any)
    setEditingParam(null)
    setSelectedOperationId(null)
  }

  const handleCancelEdit = () => {
    setEditingParam(null)
    setSelectedOperationId(null)
  }

  const handleDeleteParam = async (param: Parameter) => {
    const isRequired = REQUIRED_PARAMETER_KEYS.includes(param.name)
    const paramLabel = param.label || param.name
    
    if (isRequired) {
      const confirmed = window.confirm(
        `⚠️ Внимание!\n\n` +
        `Параметр "${paramLabel}" является рекомендуемым параметром.\n\n` +
        `Вы уверены, что хотите его удалить? Это может повлиять на работу калькулятора.`
      )
      if (!confirmed) return
    } else {
      const confirmed = window.confirm(
        `Удалить параметр "${paramLabel}"?\n\n` +
        `Это действие нельзя отменить.`
      )
      if (!confirmed) return
    }
    
    try {
      if (!param.id) return
      await onDeleteParam({ id: param.id, name: param.name, label: param.label })
    } catch (error) {
      console.error('Failed to delete parameter', error)
      alert('Ошибка удаления параметра')
    }
  }

  return (
    <div className="form-section">
      <h3>Параметры продукта</h3>

      {/* Специфические настройки для разных типов продуктов */}
      {productType === 'multi_page' && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-primary mb-2">Настройки многостраничного изделия</h4>
          <MultiPagePresetHelper
            productType="multi_page"
            onApplyPreset={(preset) => {
              console.log('Applying multi-page preset:', preset);
              // TODO: Реализовать применение пресета
            }}
            currentPages={Number(parameters.find(p => p.name === 'pages')?.default_value ?? 0)}
            currentBinding={String(parameters.find(p => p.name === 'binding')?.default_value ?? '')}
          />
        </div>
      )}

      {productType === 'universal' && (
        <div className="mb-4">
          <div className="alert alert-info">
            <strong>🔧 Универсальный продукт</strong>
            <p className="text-sm mt-1">Все параметры настраиваются вручную. Добавьте нужные параметры для вашего продукта.</p>
          </div>
        </div>
      )}

      <div className="mb-4">
        <h4 className="text-sm font-semibold text-primary mb-2">Рекомендуемые параметры</h4>
        {presetsLoading ? (
          <span className="text-secondary text-sm">Загрузка пресетов…</span>
        ) : missingPreset.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {missingPreset.map((preset) => (
              <button
                key={preset.key}
                type="button"
                className="btn-secondary text-sm"
                onClick={() => void handleAddPreset(preset)}
              >
                + {preset.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-sm text-muted">
            {productType ? `Все рекомендуемые параметры для ${productType === 'sheet_single' ? 'листовых изделий' : productType === 'multi_page' ? 'многостраничных изделий' : 'универсальных продуктов'} добавлены.` : 'Все основные параметры добавлены.'}
          </span>
        )}
      </div>

      <div className="parameters-list">
        {normalized.map((param) => {
          const isEditing = editingParam?.id === param.id || editingParam?.name === param.name
          
          if (isEditing && editingParam) {
            return (
              <div key={param.id ?? param.name} className="parameter-item editing" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <input
                      className="form-input"
                      placeholder="Метка"
                      value={editingParam.label || ''}
                      onChange={(e) => setEditingParam({ ...editingParam, label: e.target.value })}
                    />
                  </div>
                  <select
                    className="form-select"
                    value={editingParam.type}
                    onChange={(e) => setEditingParam({ ...editingParam, type: e.target.value })}
                    disabled={REQUIRED_PARAMETER_KEYS.includes(param.name)}
                    style={{ width: 150 }}
                  >
                    <option value="select">Список</option>
                    <option value="checkbox">Флажок</option>
                    <option value="number">Число</option>
                  </select>
                </div>
                {editingParam.type === 'select' && (
                  <>
                    {editingParam.name === 'print_technology' ? (
                      <div className="text-muted text-sm" style={{ marginTop: 8 }}>
                        Опции для <strong>Тип печати</strong> подтягиваются автоматически из раздела “Принтеры”.
                      </div>
                    ) : (
                      <input
                        className="form-input"
                        placeholder="Опции через ;"
                        value={editingParam.options || ''}
                        onChange={(e) => setEditingParam({ ...editingParam, options: e.target.value })}
                      />
                    )}
                  </>
                )}
                {editingParam.type === 'checkbox' && (
                  <div>
                    <label className="form-label" style={{ marginBottom: 6 }}>
                      <strong>Связанная операция</strong>
                    </label>
                    <select
                      className="form-select"
                      value={selectedOperationId || ''}
                      onChange={(e) => setSelectedOperationId(e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">Без операции</option>
                      {Array.isArray(availableOperations) && availableOperations.map((op) => (
                        <option key={op.id} value={op.id}>
                          {op.operation_name || op.service_name} — {op.price || op.price_per_unit || 0}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex gap-2" style={{ marginTop: 12 }}>
                  <button className="btn-primary" onClick={handleSaveEdit}>
                    💾 Сохранить
                  </button>
                  <button className="btn-secondary" onClick={handleCancelEdit}>
                    ✖️ Отмена
                  </button>
                </div>
              </div>
            )
          }
          
          return (
            <div key={param.id ?? param.name} className="parameter-item">
              <div className="parameter-info" style={{ flex: 1 }}>
                <h5>{param.label || param.name}</h5>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="parameter-type">{param.type}</span>
                  {param.type === 'select' && param.options && (
                    <span className="text-muted text-sm">
                      ({Array.isArray(param.options) ? param.options.join(', ') : String(param.options)})
                    </span>
                  )}
                  {param.type === 'checkbox' && (param as any).linked_operation_id && (
                    <span className="preview-chip" style={{ fontSize: 11 }}>
                      🔗 Связана с операцией
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-3 items-center">
                <button className="btn-quick-action" onClick={() => handleStartEdit(param)}>
                  ✏️ Редактировать
                </button>
                <button 
                  className={`btn-quick-action ${REQUIRED_PARAMETER_KEYS.includes(param.name) ? 'btn-quick-action--warning' : 'btn-quick-action--danger'}`}
                  onClick={() => handleDeleteParam(param)}
                  title={REQUIRED_PARAMETER_KEYS.includes(param.name) ? 'Удалить рекомендуемый параметр' : 'Удалить параметр'}
                >
                  🗑️ Удалить
                </button>
              </div>
            </div>
          )
        })}

        <div className="parameter-item add-param-trigger">
          <button 
            className="btn-primary" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowAddModal(true);
            }}
            type="button"
            style={{ width: '100%' }}
          >
            ➕ Добавить свой параметр
          </button>
        </div>
      </div>

      {/* Модальное окно добавления параметра */}
      {showAddModal && (
        <Modal 
          isOpen={showAddModal} 
          onClose={() => setShowAddModal(false)}
          title="Добавить параметр"
          size="lg"
        >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="form-group">
            <label className="form-label">
              <strong>Название параметра</strong>
              <span className="form-hint">Например: "Цвет", "Размер", "Тип бумаги"</span>
            </label>
            <input
              className="form-input"
              placeholder="Введите название"
              value={customParam.label}
              onChange={(e) => setCustomParam((prev) => ({ ...prev, label: e.target.value }))}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              <strong>Тип параметра</strong>
              <span className="form-hint">Как будет выбираться значение</span>
            </label>
            <div className="type-selector">
              <button
                type="button"
                className={`type-option ${customParam.type === 'select' ? 'active' : ''}`}
                onClick={() => setCustomParam((prev) => ({ ...prev, type: 'select' }))}
              >
                <span className="type-icon">📋</span>
                <span className="type-name">Список</span>
                <span className="type-desc">Выбор из вариантов</span>
              </button>
              <button
                type="button"
                className={`type-option ${customParam.type === 'checkbox' ? 'active' : ''}`}
                onClick={() => setCustomParam((prev) => ({ ...prev, type: 'checkbox' }))}
              >
                <span className="type-icon">☑️</span>
                <span className="type-name">Да/Нет</span>
                <span className="type-desc">Включить/выключить</span>
              </button>
              <button
                type="button"
                className={`type-option ${customParam.type === 'number' ? 'active' : ''}`}
                onClick={() => setCustomParam((prev) => ({ ...prev, type: 'number' }))}
              >
                <span className="type-icon">🔢</span>
                <span className="type-name">Число</span>
                <span className="type-desc">Ввод числа</span>
              </button>
            </div>
          </div>

          {customParam.type === 'select' && (
            <div className="form-group">
              <label className="form-label">
                <strong>Варианты выбора</strong>
                <span className="form-hint">Укажите через точку с запятой. Например: Красный; Синий; Зеленый</span>
              </label>
              <textarea
                className="form-textarea"
                placeholder="Вариант 1; Вариант 2; Вариант 3"
                value={customParam.options || ''}
                onChange={(e) => setCustomParam((prev) => ({ ...prev, options: e.target.value }))}
                rows={3}
              />
              {customParam.options && (
                <div className="options-preview">
                  <span className="preview-label">Предпросмотр:</span>
                  {customParam.options.split(';').filter((o: string) => o.trim()).map((opt: string, i: number) => (
                    <span key={i} className="preview-chip">{opt.trim()}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {customParam.type === 'checkbox' && (
            <div className="form-group">
              <label className="form-label">
                <strong>Связанная операция (опционально)</strong>
                <span className="form-hint">Операция, которая будет добавлена при включении этого параметра</span>
              </label>
              
              {availableOperations.length === 0 ? (
                <div className="alert alert-warning" style={{ marginTop: 8, padding: 12 }}>
                  ⚠️ У продукта нет операций. Сначала добавьте операции на вкладке "Операции"
                </div>
              ) : (
                <>
                  <select
                    className="form-select"
                    value={selectedOperationId || ''}
                    onChange={(e) => setSelectedOperationId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Без операции</option>
                    {availableOperations.map((op) => (
                      <option key={op.id} value={op.id}>
                        {op.operation_name || op.service_name} — {op.price || op.price_per_unit || 0}
                      </option>
                    ))}
                  </select>
                  {selectedOperationId && (
                    <div className="alert alert-info" style={{ marginTop: 8, padding: 10 }}>
                      💡 При включении параметра "{customParam.label}" будет автоматически добавлена выбранная операция
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
            <button 
              type="button"
              className="btn-secondary" 
              onClick={() => setShowAddModal(false)}
            >
              Отмена
            </button>
            <button 
              type="button"
              className="btn-primary" 
              disabled={!customParam.label?.trim()} 
              onClick={() => void handleAddCustom()}
            >
              ✅ Добавить параметр
            </button>
          </div>
        </div>
      </Modal>
      )}

      {optionalParams.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-primary mb-2">Дополнительные параметры</h4>
          <ul className="text-sm text-muted">
            {optionalParams.map((param) => (
              <li key={param.id ?? param.name}>
                {param.label || param.name} — {param.type}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default ParametersSection


