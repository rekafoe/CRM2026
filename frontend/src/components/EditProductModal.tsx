import React, { useState, useEffect } from 'react';
import { ProductConfig, updateProductConfig } from '../config/calculatorConfig';
import { getPaperTypesFromWarehouse } from '../services/calculatorMaterialService';
import '../styles/edit-product-modal.css';

interface EditProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  productKey: string;
  productConfig: ProductConfig;
  onProductUpdated: () => void;
}

export const EditProductModal: React.FC<EditProductModalProps> = ({
  isOpen,
  onClose,
  productKey,
  productConfig,
  onProductUpdated
}) => {
  const [editingData, setEditingData] = useState<Partial<ProductConfig>>({});
  const [warehousePaperTypes, setWarehousePaperTypes] = useState<any[]>([]);
  const [loadingPaperTypes, setLoadingPaperTypes] = useState(false);

  useEffect(() => {
    if (isOpen && productConfig) {
      setEditingData({ ...productConfig });
      loadPaperTypes();
    }
  }, [isOpen, productConfig]);

  const loadPaperTypes = async () => {
    setLoadingPaperTypes(true);
    try {
      const paperTypes = await getPaperTypesFromWarehouse();
      setWarehousePaperTypes(paperTypes);
    } catch (error) {
      // Ошибка обрабатывается через UI
    } finally {
      setLoadingPaperTypes(false);
    }
  };

  const handleFormatChange = (format: string, checked: boolean) => {
    if (checked) {
      setEditingData(prev => ({
        ...prev,
        formats: [...(prev.formats || []), format]
      }));
    } else {
      setEditingData(prev => ({
        ...prev,
        formats: (prev.formats || []).filter(f => f !== format)
      }));
    }
  };

  const handleDensityChange = (density: number, checked: boolean) => {
    if (checked) {
      setEditingData(prev => ({
        ...prev,
        paperDensities: [...(prev.paperDensities || []), density]
      }));
    } else {
      setEditingData(prev => ({
        ...prev,
        paperDensities: (prev.paperDensities || []).filter(d => d !== density)
      }));
    }
  };

  const handleSideChange = (side: number, checked: boolean) => {
    if (checked) {
      setEditingData(prev => ({
        ...prev,
        sides: [...(prev.sides || []), side]
      }));
    } else {
      setEditingData(prev => ({
        ...prev,
        sides: (prev.sides || []).filter(s => s !== side)
      }));
    }
  };

  const handleLaminationChange = (lamination: string, checked: boolean) => {
    if (checked) {
      setEditingData(prev => ({
        ...prev,
        laminations: [...(prev.laminations || []), lamination]
      }));
    } else {
      setEditingData(prev => ({
        ...prev,
        laminations: (prev.laminations || []).filter(l => l !== lamination)
      }));
    }
  };

  const handleSpecialOptionChange = (option: 'magnetic' | 'cutting' | 'folding' | 'roundCorners', checked: boolean) => {
    setEditingData(prev => ({
      ...prev,
      [option]: checked
    }));
  };

  const handlePagesChange = (pages: number, checked: boolean) => {
    if (checked) {
      setEditingData(prev => ({
        ...prev,
        pages: [...(prev.pages || []), pages]
      }));
    } else {
      setEditingData(prev => ({
        ...prev,
        pages: (prev.pages || []).filter(p => p !== pages)
      }));
    }
  };

  const handlePaperTypeChange = (paperType: string, checked: boolean) => {
    if (checked) {
      setEditingData(prev => ({
        ...prev,
        paperTypes: [...(prev.paperTypes || []), paperType]
      }));
    } else {
      setEditingData(prev => ({
        ...prev,
        paperTypes: (prev.paperTypes || []).filter(pt => pt !== paperType)
      }));
    }
  };

  const handlePaperDensityChange = (density: number, checked: boolean) => {
    if (checked) {
      setEditingData(prev => ({
        ...prev,
        paperDensities: [...(prev.paperDensities || []), density]
      }));
    } else {
      setEditingData(prev => ({
        ...prev,
        paperDensities: (prev.paperDensities || []).filter(d => d !== density)
      }));
    }
  };

  const handleSave = () => {
    if (editingData.name && editingData.formats && editingData.formats.length > 0) {
      updateProductConfig(productKey, editingData as ProductConfig);
      onProductUpdated();
      onClose();
      alert('Продукт успешно обновлен!');
    } else {
      alert('Пожалуйста, заполните все обязательные поля');
    }
  };

  const handleCancel = () => {
    setEditingData({ ...productConfig });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="edit-product-modal-overlay">
      <div className="edit-product-modal">
        <div className="edit-product-header">
          <h2>Редактировать продукт: {productConfig.name}</h2>
          <button className="close-btn" onClick={handleCancel}>×</button>
        </div>

        <div className="edit-product-content">
          <div className="form-group">
            <label>Название продукта:</label>
            <input
              type="text"
              value={editingData.name || ''}
              onChange={(e) => setEditingData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Например: Наклейки"
              className="form-control"
            />
          </div>

          <div className="form-group">
            <label>Форматы:</label>
            <div className="checkbox-group">
              {['A6', 'A5', 'A4', 'A3', 'A2', 'A1', 'A0', 'стандартные', 'произвольный'].map(format => (
                <label key={format} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={editingData.formats?.includes(format) || false}
                    onChange={(e) => handleFormatChange(format, e.target.checked)}
                  />
                  {format}
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Типы бумаги (из складского сервиса):</label>
            {loadingPaperTypes ? (
              <div className="loading-state">Загрузка типов бумаги...</div>
            ) : (
              <div className="checkbox-group">
                {warehousePaperTypes.map(paperType => (
                  <label key={paperType.name} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={editingData.paperTypes?.includes(paperType.name) || false}
                      onChange={(e) => handlePaperTypeChange(paperType.name, e.target.checked)}
                    />
                    {paperType.display_name} {paperType.densities && paperType.densities.length > 0 && 
                      `(${paperType.densities.length} плотностей)`
                    }
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Плотности бумаги (г/м²):</label>
            {loadingPaperTypes ? (
              <div className="loading-state">Загрузка плотностей...</div>
            ) : (
              <div className="checkbox-group">
                {(() => {
                  // Получаем все уникальные плотности из типов бумаги со склада
                  const allDensities = new Set<number>();
                  warehousePaperTypes.forEach(paperType => {
                    if (paperType.densities && Array.isArray(paperType.densities)) {
                      paperType.densities.forEach((d: any) => {
                        if (d.value && typeof d.value === 'number') {
                          allDensities.add(d.value);
                        }
                      });
                    }
                  });
                  const sortedDensities = Array.from(allDensities).sort((a, b) => a - b);
                  
                  return sortedDensities.length > 0 ? (
                    sortedDensities.map(density => (
                      <label key={density} className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={editingData.paperDensities?.includes(density) || false}
                          onChange={(e) => handlePaperDensityChange(density, e.target.checked)}
                        />
                        {density} г/м²
                      </label>
                    ))
                  ) : (
                    <div className="text-muted">Нет доступных плотностей. Добавьте материалы на склад.</div>
                  );
                })()}
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Количество сторон:</label>
            <div className="checkbox-group">
              {[1, 2].map(side => (
                <label key={side} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={editingData.sides?.includes(side) || false}
                    onChange={(e) => handleSideChange(side, e.target.checked)}
                  />
                  {side === 1 ? 'Односторонние' : 'Двусторонние'}
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Типы ламинации:</label>
            <div className="checkbox-group">
              {['none', 'matte', 'glossy'].map(lamination => (
                <label key={lamination} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={editingData.laminations?.includes(lamination) || false}
                    onChange={(e) => handleLaminationChange(lamination, e.target.checked)}
                  />
                  {lamination === 'none' ? 'Без ламинации' : 
                   lamination === 'matte' ? 'Матовая' : 'Глянцевая'}
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Дополнительные опции:</label>
            <div className="checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={editingData.magnetic || false}
                  onChange={(e) => handleSpecialOptionChange('magnetic', e.target.checked)}
                />
                Магнитные
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={editingData.cutting || false}
                  onChange={(e) => handleSpecialOptionChange('cutting', e.target.checked)}
                />
                Резка
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={editingData.folding || false}
                  onChange={(e) => handleSpecialOptionChange('folding', e.target.checked)}
                />
                Фальцовка
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={editingData.roundCorners || false}
                  onChange={(e) => handleSpecialOptionChange('roundCorners', e.target.checked)}
                />
                Скругленные углы
              </label>
            </div>
          </div>

          {editingData.pages && (
            <div className="form-group">
              <label>Количество страниц:</label>
              <div className="checkbox-group">
                {[4, 8, 12, 16, 20, 24, 28, 32].map(pages => (
                  <label key={pages} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={editingData.pages?.includes(pages) || false}
                      onChange={(e) => handlePagesChange(pages, e.target.checked)}
                    />
                    {pages} стр.
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="edit-product-footer">
          <button className="btn btn-secondary" onClick={handleCancel}>
            Отмена
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Сохранить изменения
          </button>
        </div>
      </div>
    </div>
  );
};
