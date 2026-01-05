import React, { useState, useEffect } from 'react';
import { Supplier } from '../../types/shared';
import { api } from '../../api/client';
import './SupplierMaterialsModal.css';

interface Material {
  id: number;
  name: string;
  unit: string;
  quantity: number;
  min_quantity: number | null;
  sheet_price_single: number | null;
  category_name: string | null;
  category_color: string | null;
}

interface SupplierMaterialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: Supplier | null;
}

export const SupplierMaterialsModal: React.FC<SupplierMaterialsModalProps> = ({
  isOpen,
  onClose,
  supplier
}) => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && supplier?.id) {
      loadMaterials();
    }
  }, [isOpen, supplier?.id]);

  const loadMaterials = async () => {
    if (!supplier?.id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await api.get(`/suppliers/${supplier.id}/materials`);
      setMaterials(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка загрузки материалов');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const totalValue = materials.reduce((sum, material) => {
    const price = material.sheet_price_single || 0;
    return sum + (material.quantity * price);
  }, 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="supplier-materials-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Материалы поставщика: {supplier?.name}</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-content">
          {loading && (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Загрузка материалов...</p>
            </div>
          )}

          {error && (
            <div className="error-state">
              <div className="error-icon">⚠️</div>
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && (
            <>
              <div className="materials-stats">
                <div className="stat-item">
                  <span className="stat-label">Всего материалов:</span>
                  <span className="stat-value">{materials.length}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Общая стоимость:</span>
                  <span className="stat-value">{totalValue.toFixed(2)} BYN</span>
                </div>
              </div>

              {materials.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📦</div>
                  <p>У этого поставщика нет материалов</p>
                </div>
              ) : (
                <div className="materials-list">
                  {materials.map((material) => (
                    <div key={material.id} className="material-item">
                      <div className="material-info">
                        <div className="material-name">{material.name}</div>
                        <div className="material-details">
                          <span className="category" style={{ 
                            backgroundColor: material.category_color || '#e0e0e0',
                            color: material.category_color ? '#fff' : '#333'
                          }}>
                            {material.category_name || 'Без категории'}
                          </span>
                          <span className="quantity">
                            {material.quantity} {material.unit}
                          </span>
                          {material.min_quantity && (
                            <span className="min-quantity">
                              Мин: {material.min_quantity} {material.unit}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="material-price">
                        {material.sheet_price_single ? (
                          <span className="price">
                            {material.sheet_price_single.toFixed(2)} BYN
                          </span>
                        ) : (
                          <span className="no-price">Цена не указана</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
