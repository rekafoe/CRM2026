import React from 'react';
import { usePaperTypesManagement } from './hooks/usePaperTypesManagement';
import { BynSymbol, MoneyAmount } from '../ui';
import './PaperTypesManagement.css';

interface PaperTypesManagementProps {
  onRefresh?: () => void;
}

export const PaperTypesManagement: React.FC<PaperTypesManagementProps> = ({ onRefresh }) => {
  const {
    paperTypes,
    loading,
    activeTab,
    modals,
    forms,
    setActiveTab,
    handleCreatePaperType,
    handleUpdatePaperType,
    handleDeletePaperType,
    handleAddPrice,
    updateModal,
    updateForm,
    updateEditingPaperType
  } = usePaperTypesManagement(onRefresh);

  return (
    <div className="paper-types-management">
      {/* Заголовок и кнопки */}
      <div className="paper-header">
        <div className="paper-tabs">
          <button 
            className={`tab-button ${activeTab === 'types' ? 'active' : ''}`}
            onClick={() => setActiveTab('types')}
          >
            📄 Типы бумаги ({paperTypes.length})
          </button>
          <button 
            className={`tab-button ${activeTab === 'materials' ? 'active' : ''}`}
            onClick={() => setActiveTab('materials')}
          >
            📦 Материалы
          </button>
        </div>
        
        <div className="paper-actions">
          {activeTab === 'types' && (
            <button 
              className="btn btn-primary"
              onClick={() => updateModal('showAdd', true)}
            >
              ➕ Добавить тип
            </button>
          )}
          {activeTab === 'materials' && (
            <div className="info-text">
              💡 Материалы связываются с типами бумаги через форму добавления материалов
              <button 
                className="btn btn-primary"
                onClick={() => updateModal('showPrice', true)}
                style={{ marginLeft: '10px' }}
              >
                💰 Добавить цену
              </button>
            </div>
          )}
        </div>
      </div>

      {loading && <div className="loading">Загрузка...</div>}

      {/* Содержимое вкладок */}
      {activeTab === 'types' && (
        <div className="paper-types-grid">
          {paperTypes.map(paperType => (
            <div key={paperType.id} className="paper-type-card">
              <div className="paper-type-header">
                <h3>{paperType.display_name}</h3>
                <div className="paper-type-actions">
                  <button 
                    className="btn btn-sm btn-secondary"
                    onClick={() => updateModal('editingPaperType', paperType)}
                  >
                    ✏️
                  </button>
                  <button 
                    className="btn btn-sm btn-danger"
                    onClick={() => {
                      console.log('🗑️ Delete button clicked for ID:', paperType.id);
                      handleDeletePaperType(paperType.id);
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
              
              <div className="paper-type-details">
                <p><strong>Системное имя:</strong> {paperType.name}</p>
                <p><strong>Ключевые слова:</strong> {paperType.search_keywords || 'Не указаны'}</p>
                <p><strong>Статус:</strong> 
                  <span className={`status ${paperType.is_active ? 'active' : 'inactive'}`}>
                    {paperType.is_active ? 'Активен' : 'Неактивен'}
                  </span>
                </p>
                
                {paperType.materials && paperType.materials.length > 0 && (
                  <div className="paper-materials">
                    <strong>Связанные материалы:</strong>
                    <div className="materials-grid">
                      {paperType.materials
                        .reduce((acc: typeof paperType.materials, material) => {
                          if (!acc.find((m) => m.id === material.id)) {
                            acc.push(material);
                          }
                          return acc;
                        }, [] as NonNullable<typeof paperType.materials>)
                        .map((material, index: number) => (
                        <div key={`${paperType.id}-card-${material.id}-${index}`} className="material-item">
                          <span className="material-name">{material.name}</span>
                          {material.density && (
                            <span className="material-density">{material.density}г/м²</span>
                          )}
                          <span className="material-price">
                            <MoneyAmount value={material.sheet_price_single || material.price || 0} />
                          </span>
                          <span className="material-stock">
                            {material.quantity} {material.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'materials' && (
        <div className="materials-management">
          <div className="materials-grid">
            {paperTypes.map(paperType => (
              <div key={paperType.id} className="material-section">
                <h3>{paperType.display_name}</h3>
                {paperType.materials && paperType.materials.length > 0 ? (
                  <div className="material-list">
                    {paperType.materials
                      .reduce((acc: typeof paperType.materials, material) => {
                        if (!acc.find((m) => m.id === material.id)) {
                          acc.push(material);
                        }
                        return acc;
                      }, [] as NonNullable<typeof paperType.materials>)
                      .map((material, index: number) => (
                      <div key={`${paperType.id}-${material.id}-${index}`} className="material-item">
                        <div className="material-info">
                          <span className="material-name">{material.name}</span>
                          {material.density && (
                            <span className="material-density">{material.density} г/м²</span>
                          )}
                          <span className="material-category">{material.category_name || 'Без категории'}</span>
                        </div>
                        <div className="material-details">
                          <span className="material-price">
                            <MoneyAmount value={material.sheet_price_single || material.price || 0} />
                          </span>
                          <span className="material-stock">
                            {material.quantity} {material.unit}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="no-materials">Материалы не связаны</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Модальное окно добавления типа бумаги */}
      {modals.showAdd && (
        <div className="modal-overlay" onClick={() => updateModal('showAdd', false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Добавить тип бумаги</h2>
              <button className="close-btn" onClick={() => updateModal('showAdd', false)}>✕</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Системное имя *</label>
                <input
                  type="text"
                  value={forms.newPaperType.name}
                  onChange={e => updateForm('newPaperType', 'name', e.target.value)}
                  placeholder="semi-matte"
                />
              </div>
              
              <div className="form-group">
                <label>Отображаемое имя *</label>
                <input
                  type="text"
                  value={forms.newPaperType.display_name}
                  onChange={e => updateForm('newPaperType', 'display_name', e.target.value)}
                  placeholder="Полуматовая"
                />
              </div>
              
              <div className="form-group">
                <label>Ключевые слова</label>
                <input
                  type="text"
                  value={forms.newPaperType.search_keywords}
                  onChange={e => updateForm('newPaperType', 'search_keywords', e.target.value)}
                  placeholder="полуматовая,мелованная,130г"
                />
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => updateModal('showAdd', false)}>
                Отмена
              </button>
              <button className="btn btn-primary" onClick={handleCreatePaperType}>
                Создать
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно редактирования типа бумаги */}
      {modals.editingPaperType && (
        <div className="modal-overlay" onClick={() => updateModal('editingPaperType', null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Редактировать тип бумаги</h2>
              <button className="close-btn" onClick={() => updateModal('editingPaperType', null)}>✕</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Системное имя *</label>
                <input
                  type="text"
                  value={modals.editingPaperType.name}
                  onChange={e => updateEditingPaperType('name', e.target.value)}
                />
              </div>
              
              <div className="form-group">
                <label>Отображаемое имя *</label>
                <input
                  type="text"
                  value={modals.editingPaperType.display_name}
                  onChange={e => updateEditingPaperType('display_name', e.target.value)}
                />
              </div>
              
              <div className="form-group">
                <label>Ключевые слова</label>
                <input
                  type="text"
                  value={modals.editingPaperType.search_keywords}
                  onChange={e => updateEditingPaperType('search_keywords', e.target.value)}
                />
              </div>
              
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={modals.editingPaperType.is_active}
                    onChange={e => updateEditingPaperType('is_active', e.target.checked)}
                  />
                  Активен
                </label>
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => updateModal('editingPaperType', null)}>
                Отмена
              </button>
              <button className="btn btn-primary" onClick={() => {
                console.log('💾 Save button clicked');
                handleUpdatePaperType();
              }}>
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно добавления цены */}
      {modals.showPrice && (
        <div className="modal-overlay" onClick={() => updateModal('showPrice', false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Добавить цену</h2>
              <button className="close-btn" onClick={() => updateModal('showPrice', false)}>✕</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Тип бумаги *</label>
                <select
                  value={forms.newPrice.paper_type_id}
                  onChange={e => updateForm('newPrice', 'paper_type_id', parseInt(e.target.value))}
                >
                  <option value={0}>Выберите тип бумаги</option>
                  {paperTypes.map(pt => (
                    <option key={pt.id} value={pt.id}>{pt.display_name}</option>
                  ))}
                </select>
              </div>
              
              <div className="form-group">
                <label>Плотность (г/м²) *</label>
                <input
                  type="number"
                  value={forms.newPrice.density}
                  onChange={e => updateForm('newPrice', 'density', parseInt(e.target.value))}
                  placeholder="130"
                />
              </div>
              
              <div className="form-group">
                <label>Цена (<BynSymbol />) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={forms.newPrice.price}
                  onChange={e => updateForm('newPrice', 'price', parseFloat(e.target.value))}
                  placeholder="0.20"
                />
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => updateModal('showPrice', false)}>
                Отмена
              </button>
              <button className="btn btn-primary" onClick={handleAddPrice}>
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};