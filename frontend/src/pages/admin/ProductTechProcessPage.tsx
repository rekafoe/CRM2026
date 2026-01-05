import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import '../../components/admin/ProductManagement.css';
import { getProductDetails, updateProduct, ProductWithDetails } from '../../services/products';
import { apiClient } from '../../api/client';

interface Operation {
  id: number;
  name: string;
  operation_type: string;
  description?: string;
}

interface ProductOperationLink {
  id: number;
  operation_id: number;
  operation_name: string;
  operation_type: string;
  sequence: number;
  is_required: boolean;
  is_default: boolean;
  price_multiplier: number;
}

const ProductTechProcessPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const productId = Number(id);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<ProductWithDetails | null>(null);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);
  
  const [operations, setOperations] = useState<Operation[]>([]);
  const [productOperations, setProductOperations] = useState<ProductOperationLink[]>([]);
  const [loadingOps, setLoadingOps] = useState(false);
  const [selectedOperationId, setSelectedOperationId] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const p = await getProductDetails(productId);
        if (p) {
          setProduct(p);
          setIsActive((p as any).is_active !== false);
        }
      } finally {
        setLoading(false);
      }
    };
    if (productId) load();
  }, [productId]);

  useEffect(() => {
    loadOperations();
    loadProductOperations();
  }, [productId]);

  const loadOperations = async () => {
    try {
      const response = await apiClient.get('/operations');
      const data = response.data?.data || response.data || [];
      setOperations(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading operations:', error);
      setOperations([]);
    }
  };

  const loadProductOperations = async () => {
    try {
      setLoadingOps(true);
      const response = await apiClient.get(`/products/${productId}/operations`);
      const data = response.data?.data || response.data || [];
      setProductOperations(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading product operations:', error);
      setProductOperations([]);
    } finally {
      setLoadingOps(false);
    }
  };

  const handleAddOperation = async () => {
    if (!selectedOperationId) {
      alert('Выберите операцию');
      return;
    }

    try {
      setSaving(true);
      await apiClient.post(`/products/${productId}/operations`, {
        operation_id: selectedOperationId,
        sequence: productOperations.length + 1,
        is_required: true,
        is_default: true,
        price_multiplier: 1.0
      });
      await loadProductOperations();
      setSelectedOperationId(null);
    } catch (error) {
      console.error('Error adding operation:', error);
      alert('Ошибка добавления операции');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveOperation = async (linkId: number) => {
    if (!confirm('Удалить эту операцию из продукта?')) return;

    try {
      await apiClient.delete(`/products/${productId}/operations/${linkId}`);
      await loadProductOperations();
    } catch (error) {
      console.error('Error removing operation:', error);
      alert('Ошибка удаления операции');
    }
  };

  return (
    <div className="product-management">
      <div className="management-header">
        <div className="header-content">
          <button onClick={() => navigate('/adminpanel/products')} className="btn-quick-action" style={{ marginRight: 12 }}>
            ← Назад к списку
          </button>
          <h2>⚙️ Технологический процесс</h2>
          {product && <p>{(product as any).icon || '📦'} {(product as any).name}</p>}
        </div>
      </div>

      <div className="management-content">
        <div className="tab-content">
          {loading && <p>Загрузка…</p>}
          {!loading && (
            <>
              <div className="form-section">
                <h3>Общие настройки</h3>
                <div className="parameters-list">
                  <div className="parameter-item">
                    <div className="parameter-info"><h5>Доступность продукта</h5></div>
                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input type="checkbox" checked={isActive} onChange={(e)=>setIsActive(e.target.checked)} />
                        <span>{isActive ? 'Активен' : 'Скрыт'}</span>
                      </label>
                    </div>
                  </div>
                  <div>
                    <button
                      className="btn-primary"
                      disabled={saving}
                      onClick={async ()=>{
                        try { setSaving(true); await updateProduct(productId, { is_active: isActive }); alert('Сохранено'); }
                        catch(e){ console.error(e); alert('Ошибка сохранения'); }
                        finally { setSaving(false); }
                      }}
                    >{saving ? 'Сохранение...' : 'Сохранить'}</button>
                  </div>
                </div>
              </div>

              <div className="form-section">
                <h3>⚙️ Операции продукта</h3>
                
                {loadingOps ? (
                  <p>Загрузка операций...</p>
                ) : (
                  <>
                    {productOperations.length > 0 ? (
                      <div style={{ marginBottom: 20 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#f5f5f5' }}>
                              <th style={{ padding: 8, textAlign: 'left', borderBottom: '1px solid #ddd' }}>#</th>
                              <th style={{ padding: 8, textAlign: 'left', borderBottom: '1px solid #ddd' }}>Операция</th>
                              <th style={{ padding: 8, textAlign: 'left', borderBottom: '1px solid #ddd' }}>Тип</th>
                              <th style={{ padding: 8, textAlign: 'center', borderBottom: '1px solid #ddd' }}>Обязательна</th>
                              <th style={{ padding: 8, textAlign: 'center', borderBottom: '1px solid #ddd' }}>Действия</th>
                            </tr>
                          </thead>
                          <tbody>
                            {productOperations.map((op, index) => (
                              <tr key={op.id} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: 8 }}>{index + 1}</td>
                                <td style={{ padding: 8 }}>{op.operation_name}</td>
                                <td style={{ padding: 8 }}>
                                  <span style={{ 
                                    padding: '2px 8px', 
                                    backgroundColor: '#e3f2fd', 
                                    borderRadius: 4, 
                                    fontSize: 12 
                                  }}>
                                    {op.operation_type}
                                  </span>
                                </td>
                                <td style={{ padding: 8, textAlign: 'center' }}>
                                  {op.is_required ? '✅' : '⭕'}
                                </td>
                                <td style={{ padding: 8, textAlign: 'center' }}>
                                  <button 
                                    className="btn btn-danger"
                                    style={{ fontSize: 12, padding: '4px 12px' }}
                                    onClick={() => handleRemoveOperation(op.id)}
                                  >
                                    🗑️ Удалить
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ 
                        padding: 20, 
                        backgroundColor: '#fff3cd', 
                        border: '1px solid #ffc107', 
                        borderRadius: 4,
                        marginBottom: 20
                      }}>
                        <p>⚠️ У продукта нет операций. Добавьте хотя бы одну операцию для расчета цены.</p>
                      </div>
                    )}

                    {operations.length === 0 ? (
                      <div style={{ 
                        padding: 20, 
                        backgroundColor: '#ffebee', 
                        border: '1px solid #f44336', 
                        borderRadius: 4,
                        marginTop: 20
                      }}>
                        <p>❌ В системе нет доступных операций. Сначала создайте операции в разделе "Операции".</p>
                      </div>
                    ) : (
                      <div className="parameter-item">
                        <div className="parameter-info"><h5>Добавить операцию</h5></div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <select 
                            className="form-select" 
                            value={selectedOperationId || ''}
                            onChange={(e) => setSelectedOperationId(Number(e.target.value))}
                            style={{ flex: 1 }}
                          >
                            <option value="">-- Выберите операцию --</option>
                            {operations
                              .filter(op => !productOperations.find(po => po.operation_id === op.id))
                              .map(op => (
                                <option key={op.id} value={op.id}>
                                  {op.name} ({op.operation_type})
                                </option>
                              ))}
                          </select>
                          <button 
                            className="btn-primary" 
                            onClick={handleAddOperation}
                            disabled={!selectedOperationId || saving}
                          >
                            {saving ? '⏳ Добавление...' : '➕ Добавить'}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="list-section">
                <p>💡 Совет: После добавления операций вернитесь к <Link to={`/adminpanel/products/${productId}/template`}>редактору шаблона</Link> и проверьте расчет цены.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductTechProcessPage;


