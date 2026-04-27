import React, { useState, useEffect } from 'react';
import { 
  getPaperTypes, 
  createPaperType, 
  updatePaperType, 
  deletePaperType,
  addPrintingPrice,
  deletePrintingPrice 
} from '../api';
import { BynSymbol, MoneyAmount } from './ui';
import '../styles/paper-types-manager.css';

interface PaperType {
  id: number;
  name: string;
  display_name: string;
  search_keywords: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  prices?: { [density: number]: number };
}

interface PrintingPrice {
  id: number;
  paper_type_id: number;
  density: number;
  price: number;
}

interface PaperTypesManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PaperTypesManager: React.FC<PaperTypesManagerProps> = ({ isOpen, onClose }) => {
  const [paperTypes, setPaperTypes] = useState<PaperType[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'types' | 'prices'>('types');
  
  // Форма для нового типа бумаги
  const [newPaperType, setNewPaperType] = useState({
    name: '',
    display_name: '',
    search_keywords: ''
  });
  
  // Форма для новой цены печати
  const [newPrice, setNewPrice] = useState({
    paper_type_id: 0,
    density: 0,
    price: 0
  });
  
  // Редактирование
  const [editingType, setEditingType] = useState<PaperType | null>(null);
  const [editingPrice, setEditingPrice] = useState<PrintingPrice | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadPaperTypes();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const loadPaperTypes = async () => {
    try {
      setLoading(true);
      const response = await getPaperTypes();
      const data = response.data || response;
      
      // Обрабатываем данные для правильного отображения цен
      const processedData = data.map((type: any) => {
        // Если prices - это массив, преобразуем в объект
        let prices = {};
        if (Array.isArray(type.prices)) {
          prices = type.prices.reduce((acc: any, price: any) => {
            acc[price.density] = price.price;
            return acc;
          }, {});
        } else if (type.prices && typeof type.prices === 'object') {
          prices = type.prices;
        }
        
        return {
          ...type,
          prices: prices
        };
      });
      
      setPaperTypes(processedData);
    } catch (error) {
      // Ошибка обрабатывается через UI
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePaperType = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createPaperType(newPaperType);
      setNewPaperType({ name: '', display_name: '', search_keywords: '' });
      await loadPaperTypes();
    } catch (error) {
      // Ошибка обрабатывается через UI
    }
  };

  const handleUpdatePaperType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingType) return;
    
    try {
      await updatePaperType(editingType.id, {
        name: editingType.name,
        display_name: editingType.display_name,
        search_keywords: editingType.search_keywords
      });
      setEditingType(null);
      await loadPaperTypes();
    } catch (error) {
      // Ошибка обрабатывается через UI
    }
  };

  const handleDeletePaperType = async (id: number) => {
    if (!confirm('Вы уверены, что хотите удалить этот тип бумаги?')) return;
    
    try {
      await deletePaperType(id);
      await loadPaperTypes();
    } catch (error) {
      // Ошибка обрабатывается через UI
    }
  };

  const handleAddPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addPrintingPrice(newPrice);
      setNewPrice({ paper_type_id: 0, density: 0, price: 0 });
      await loadPaperTypes();
    } catch (error) {
      // Ошибка обрабатывается через UI
    }
  };

  const handleDeletePrice = async (priceId: number) => {
    if (!confirm('Вы уверены, что хотите удалить эту цену?')) return;
    
    try {
      await deletePrintingPrice(priceId);
      await loadPaperTypes();
    } catch (error) {
      // Ошибка обрабатывается через UI
    }
  };

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content paper-types-manager">
        <div className="modal-header">
          <h2>Управление типами бумаги</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="tabs">
          <button 
            className={`tab ${activeTab === 'types' ? 'active' : ''}`}
            onClick={() => setActiveTab('types')}
          >
            📄 Типы бумаги
          </button>
          <button 
            className={`tab ${activeTab === 'prices' ? 'active' : ''}`}
            onClick={() => setActiveTab('prices')}
          >
            💰 Цены печати
          </button>
        </div>

        {activeTab === 'types' && (
          <div className="tab-content">
            <div className="form-section">
              <h3>{editingType ? 'Редактировать тип бумаги' : 'Добавить новый тип бумаги'}</h3>
              <form onSubmit={editingType ? handleUpdatePaperType : handleCreatePaperType}>
                <div className="form-group">
                  <label>Название (для системы):</label>
                  <input
                    type="text"
                    value={editingType ? editingType.name : newPaperType.name}
                    onChange={(e) => editingType 
                      ? setEditingType({...editingType, name: e.target.value})
                      : setNewPaperType({...newPaperType, name: e.target.value})
                    }
                    placeholder="например: kraft"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Отображаемое название:</label>
                  <input
                    type="text"
                    value={editingType ? editingType.display_name : newPaperType.display_name}
                    onChange={(e) => editingType 
                      ? setEditingType({...editingType, display_name: e.target.value})
                      : setNewPaperType({...newPaperType, display_name: e.target.value})
                    }
                    placeholder="например: Крафтовая"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Ключевые слова (через запятую):</label>
                  <input
                    type="text"
                    value={editingType ? editingType.search_keywords : newPaperType.search_keywords}
                    onChange={(e) => editingType 
                      ? setEditingType({...editingType, search_keywords: e.target.value})
                      : setNewPaperType({...newPaperType, search_keywords: e.target.value})
                    }
                    placeholder="например: крафт, kraft, крафтовая"
                    required
                  />
                </div>
                <div className="form-actions">
                  {editingType ? (
                    <>
                      <button type="submit">Сохранить</button>
                      <button type="button" onClick={() => setEditingType(null)}>Отмена</button>
                    </>
                  ) : (
                    <button type="submit">Добавить</button>
                  )}
                </div>
              </form>
            </div>

            <div className="list-section">
              <h3>Существующие типы бумаги</h3>
              {loading ? (
                <div className="loading">Загрузка...</div>
              ) : (
                <div className="paper-types-list">
                  {paperTypes.map(type => (
                    <div key={type.id} className="paper-type-item">
                      <div className="paper-type-info">
                        <h4>{type.display_name}</h4>
                        <p><strong>Системное название:</strong> {type.name}</p>
                        <p><strong>Ключевые слова:</strong> {type.search_keywords}</p>
                      </div>
                      <div className="paper-type-actions">
                        <button onClick={() => setEditingType(type)}>Редактировать</button>
                        <button onClick={() => handleDeletePaperType(type.id)} className="delete-btn">
                          Удалить
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'prices' && (
          <div className="tab-content">
            <div className="form-section">
              <h3>Добавить цену печати</h3>
              <form onSubmit={handleAddPrice}>
                <div className="form-group">
                  <label>Тип бумаги:</label>
                  <select
                    value={newPrice.paper_type_id}
                    onChange={(e) => setNewPrice({...newPrice, paper_type_id: Number(e.target.value)})}
                    required
                  >
                    <option value={0}>Выберите тип бумаги</option>
                    {paperTypes.map(type => (
                      <option key={type.id} value={type.id}>{type.display_name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Плотность (г/м²):</label>
                  <input
                    type="number"
                    value={newPrice.density}
                    onChange={(e) => setNewPrice({...newPrice, density: Number(e.target.value)})}
                    placeholder="например: 130"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Цена за лист (<BynSymbol />):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newPrice.price}
                    onChange={(e) => setNewPrice({...newPrice, price: Number(e.target.value)})}
                    placeholder="например: 9.50"
                    required
                  />
                </div>
                <button type="submit">Добавить цену</button>
              </form>
            </div>

            <div className="list-section">
              <h3>Цены печати по типам бумаги</h3>
              {loading ? (
                <div className="loading">Загрузка...</div>
              ) : (
                <div className="prices-list">
                  {paperTypes.map(type => (
                    <div key={type.id} className="price-group">
                      <h4>{type.display_name}</h4>
                      {type.prices && Object.keys(type.prices).length > 0 ? (
                        <div className="price-grid">
                          {Object.entries(type.prices).map(([density, price]) => {
                            return (
                              <div key={density} className="price-item">
                                <span>{density}г/м²</span>
                                <span>{typeof price === 'number' ? <><MoneyAmount value={price} />/лист</> : 'N/A'}</span>
                                <button 
                                  onClick={() => {
                                    // Пока что просто показываем сообщение, так как у нас нет ID цены
                                    alert('Для удаления цены нужно сначала получить ID из базы данных');
                                  }}
                                  className="delete-btn"
                                  title="Удаление цены будет добавлено позже"
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="no-prices">Цены не установлены</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
