import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Material, InventoryTransaction } from '../../types/shared';
import { useUIStore } from '../../stores/uiStore';
import { EnhancedMaterialTransactionModal } from './EnhancedMaterialTransactionModal';
import { getMaterialMoves, getAutoOrderRules, checkMaterialsForAutoOrder, deleteAutoOrderRule, getSuppliers, createAutoOrderRule, updateAutoOrderRule, getMaterialCategories, createMaterialCategory, updateMaterialCategory, deleteMaterialCategory } from '../../api';
import './InventoryControl.css';
import { MaterialsTab, TransactionsTab, AlertsTab, MovementsTab } from './inventory-control';

interface InventoryControlProps {
  materials: Material[];
  onRefresh: () => void;
}

type TransactionType = 'in' | 'out' | 'adjustment' | 'transfer';
type ViewMode = 'materials' | 'transactions' | 'alerts' | 'movements' | 'auto-order' | 'categories';

export const InventoryControl: React.FC<InventoryControlProps> = ({
  materials,
  onRefresh
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('materials');
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [transactionType, setTransactionType] = useState<TransactionType>('in');
  const [transactionQuantity, setTransactionQuantity] = useState<number>(0);
  const [transactionReason, setTransactionReason] = useState<string>('');

  const { showToast } = useUIStore();

  // Фильтры материалов
  const [search, setSearch] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const m of materials || []) {
      const name = (m as any).category_name || '';
      if (name) set.add(name);
    }
    return Array.from(set).sort();
  }, [materials]);

  // Mock данные для транзакций
  const [moves, setMoves] = useState<any[]>([]);
  const [movesLoading, setMovesLoading] = useState(false);
  const [moveFilters, setMoveFilters] = useState<{ from?: string; to?: string; user?: string; order?: string; materialId?: number | null; }>(
    { from: undefined, to: undefined, user: '', order: '', materialId: null }
  );

  const transactions: InventoryTransaction[] = useMemo(() => {
    // Приводим moves к интерфейсу для отображения
    return (moves || []).map((mm: any, idx: number) => ({
      id: mm.id || idx,
      material_id: mm.materialId,
      transaction_type: (mm.delta || 0) > 0 ? 'in' : 'out',
      quantity: mm.delta,
      reason: mm.reason,
      user_id: mm.user_id,
      created_at: mm.created_at,
      updated_at: mm.created_at,
      material: materials.find(m => m.id === mm.materialId)
    }));
  }, [moves, materials]);

  const loadMoves = useCallback(async () => {
    try {
      setMovesLoading(true);
      const params: any = {};
      if (moveFilters.materialId) params.materialId = moveFilters.materialId;
      if (moveFilters.from) params.from = moveFilters.from;
      if (moveFilters.to) params.to = moveFilters.to;
      if (moveFilters.order) params.orderId = moveFilters.order;
      if (moveFilters.user) params.user_id = moveFilters.user;
      const res = await getMaterialMoves(params);
      setMoves(res.data || []);
    } catch (e) {
      showToast('Ошибка загрузки движений материалов', 'error');
    } finally {
      setMovesLoading(false);
    }
  }, [moveFilters, showToast]);

  useEffect(() => {
    if (viewMode === 'transactions') {
      loadMoves();
    }
  }, [viewMode, loadMoves]);

  // Автозаказ: правила и проверки
  const [autoRules, setAutoRules] = useState<any[]>([]);
  const [autoLoading, setAutoLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Array<{ id: number; name: string }>>([]);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<any | null>(null);
  const [ruleForm, setRuleForm] = useState<{ material_id: number | ''; supplier_id: number | ''; threshold_quantity: number | ''; order_quantity: number | ''; is_active: boolean }>({ material_id: '', supplier_id: '', threshold_quantity: '', order_quantity: '', is_active: true });

  const loadAutoRules = useCallback(async () => {
    try {
      setAutoLoading(true);
      const res = await getAutoOrderRules();
      setAutoRules(res.data || []);
    } catch (e) {
      showToast('Ошибка загрузки правил автозаказа', 'error');
    } finally {
      setAutoLoading(false);
    }
  }, [showToast]);

  const loadSuppliers = useCallback(async () => {
    try {
      const res = await getSuppliers();
      const list = (res.data || []).map((s: any) => ({ id: s.id, name: s.name }));
      setSuppliers(list);
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (viewMode === 'auto-order') {
      loadAutoRules();
      loadSuppliers();
    }
  }, [viewMode, loadAutoRules, loadSuppliers]);

  const openCreateRule = useCallback(() => {
    setEditingRule(null);
    setRuleForm({ material_id: '', supplier_id: '', threshold_quantity: '', order_quantity: '', is_active: true });
    setShowRuleModal(true);
  }, []);

  const openEditRule = useCallback((r: any) => {
    setEditingRule(r);
    setRuleForm({
      material_id: r.material_id,
      supplier_id: r.supplier_id,
      threshold_quantity: r.threshold_quantity,
      order_quantity: r.order_quantity,
      is_active: !!r.is_active
    });
    setShowRuleModal(true);
  }, []);

  const saveRule = useCallback(async () => {
    const { material_id, supplier_id, threshold_quantity, order_quantity, is_active } = ruleForm;
    if (!material_id || !supplier_id || !threshold_quantity || !order_quantity) {
      showToast('Заполните все поля', 'warning');
      return;
    }
    try {
      if (editingRule) {
        await updateAutoOrderRule(editingRule.id, {
          material_id: Number(material_id),
          supplier_id: Number(supplier_id),
          threshold_quantity: Number(threshold_quantity),
          order_quantity: Number(order_quantity),
          is_active
        });
        showToast('Правило обновлено', 'success');
      } else {
        await createAutoOrderRule({
          material_id: Number(material_id),
          supplier_id: Number(supplier_id),
          threshold_quantity: Number(threshold_quantity),
          order_quantity: Number(order_quantity),
          is_active
        });
        showToast('Правило создано', 'success');
      }
      setShowRuleModal(false);
      await loadAutoRules();
    } catch (e) {
      showToast('Ошибка сохранения правила', 'error');
    }
  }, [ruleForm, editingRule, loadAutoRules, showToast]);

  // Категории состояние и логика
  const [categoriesState, setCategoriesState] = useState<Array<{ id: number; name: string; color?: string; description?: string; created_at?: string }>>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{ id?: number; name: string; color?: string; description?: string } | null>(null);
  const [categoryForm, setCategoryForm] = useState<{ name: string; color?: string; description?: string }>({ name: '', color: '', description: '' });

  const loadCategories = useCallback(async () => {
    try {
      setCategoriesLoading(true);
      const res = await getMaterialCategories();
      setCategoriesState(res.data || []);
    } catch {
      showToast('Ошибка загрузки категорий', 'error');
    } finally {
      setCategoriesLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (viewMode === 'categories') {
      loadCategories();
    }
  }, [viewMode, loadCategories]);

  const openCreateCategory = useCallback(() => {
    setEditingCategory(null);
    setCategoryForm({ name: '', color: '', description: '' });
    setShowCategoryModal(true);
  }, []);

  const openEditCategory = useCallback((c: any) => {
    setEditingCategory(c);
    setCategoryForm({ name: c.name || '', color: c.color || '', description: c.description || '' });
    setShowCategoryModal(true);
  }, []);

  const saveCategory = useCallback(async () => {
    if (!categoryForm.name.trim()) {
      showToast('Введите имя категории', 'warning');
      return;
    }
    try {
      if (editingCategory && editingCategory.id) {
        await updateMaterialCategory(editingCategory.id, categoryForm);
        showToast('Категория обновлена', 'success');
      } else {
        await createMaterialCategory(categoryForm);
        showToast('Категория создана', 'success');
      }
      setShowCategoryModal(false);
      await loadCategories();
    } catch {
      showToast('Ошибка сохранения категории', 'error');
    }
  }, [categoryForm, editingCategory, loadCategories, showToast]);

  // Алерты о низких остатках
  const alerts = useMemo(() => {
    return materials
      .filter(m => (m.quantity || 0) <= (m.min_stock_level || 10))
      .map(material => ({
        id: material.id,
        material_id: material.id,
        alert_type: (material.quantity || 0) <= 0 ? 'out_of_stock' as const : 'low_stock' as const,
        threshold_value: material.min_stock_level || 10,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        material
      }));
  }, [materials]);

  // Отфильтрованные материалы
  const filteredMaterials = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (materials || []).filter(m => {
      const nameOk = !q || (m.name || '').toLowerCase().includes(q) || ((m as any).description || '').toLowerCase().includes(q);
      const catOk = !categoryFilter || ((m as any).category_name || '') === categoryFilter;
      const status: string = (m as any).status || '';
      const statusOk = !statusFilter || status === statusFilter;
      return nameOk && catOk && statusOk;
    });
  }, [materials, search, categoryFilter, statusFilter]);

  // Обработчики
  const handleAddTransaction = useCallback(async () => {
    if (!selectedMaterial || transactionQuantity === 0 || !transactionReason.trim()) {
      showToast('Заполните все поля', 'warning');
      return;
    }

    try {
      // Здесь будет API вызов для создания транзакции
      showToast('Транзакция добавлена', 'success');
      setShowAddTransaction(false);
      setSelectedMaterial(null);
      setTransactionQuantity(0);
      setTransactionReason('');
      onRefresh();
    } catch (error) {
      showToast('Ошибка при добавлении транзакции', 'error');
    }
  }, [selectedMaterial, transactionQuantity, transactionReason, showToast, onRefresh]);

  const handleAdjustStock = useCallback((material: Material, newQuantity: number) => {
    setSelectedMaterial(material);
    setTransactionType('adjustment');
    setTransactionQuantity(newQuantity - (material.quantity || 0));
    setTransactionReason('Корректировка остатков');
    setShowAddTransaction(true);
  }, []);

  // Убрали статистику - не несёт полезной информации

  return (
    <div className="inventory-control">
      {/* Заголовок */}
      <div className="inventory-header">
        <h2>📋 Управление инвентарем</h2>
        <div className="header-actions" />
      </div>

      {/* Убрали статистику */}

      {/* Вкладки */}
      <div className="inventory-tabs">
        <div className="tabs-header">
          <button 
            className={`tab-btn ${viewMode === 'materials' ? 'active' : ''}`}
            onClick={() => setViewMode('materials')}
          >
            📦 Материалы
          </button>
          <button 
            className={`tab-btn ${viewMode === 'transactions' ? 'active' : ''}`}
            onClick={() => setViewMode('transactions')}
          >
            📊 Транзакции
          </button>
          <button 
            className={`tab-btn ${viewMode === 'alerts' ? 'active' : ''}`}
            onClick={() => setViewMode('alerts')}
          >
            ⚠️ Алерты ({alerts.length})
          </button>
          <button 
            className={`tab-btn ${viewMode === 'movements' ? 'active' : ''}`}
            onClick={() => setViewMode('movements')}
          >
            🔄 Движения
          </button>
          <button 
            className={`tab-btn ${viewMode === 'categories' ? 'active' : ''}`}
            onClick={() => setViewMode('categories')}
          >
            🗂️ Категории
          </button>
          <button 
            className={`tab-btn ${viewMode === 'auto-order' ? 'active' : ''}`}
            onClick={() => setViewMode('auto-order')}
          >
            🤖 Автозаказ
          </button>
        </div>

        <div className="tabs-content">
          {viewMode === 'materials' && (
            <MaterialsTab
              materials={filteredMaterials}
              search={search}
              categoryFilter={categoryFilter}
              statusFilter={statusFilter}
              categories={categories}
              onSearchChange={setSearch}
              onCategoryFilterChange={setCategoryFilter}
              onStatusFilterChange={setStatusFilter}
              onMaterialAction={(material, action) => {
                if (action === 'history') {
                  setViewMode('transactions');
                  setMoveFilters(prev => ({ ...prev, materialId: material.id }));
                } else {
                  setSelectedMaterial(material);
                  setTransactionType(action as 'in' | 'out' | 'adjustment');
                  setShowAddTransaction(true);
                }
              }}
              onViewTransactions={(materialId) => {
                setViewMode('transactions');
                setMoveFilters(prev => ({ ...prev, materialId }));
              }}
            />
          )}
          {viewMode === 'transactions' && (
            <TransactionsTab
              moves={moves}
              materials={materials}
              loading={movesLoading}
              filters={moveFilters}
              onFilterChange={(updates) => setMoveFilters(prev => ({ ...prev, ...updates }))}
              onRefresh={loadMoves}
            />
          )}

          {viewMode === 'alerts' && (
            <AlertsTab
              alerts={alerts}
              onAdjustStock={handleAdjustStock}
              onMaterialAction={(material) => {
                setSelectedMaterial(material);
                setTransactionType('out');
                setShowAddTransaction(true);
              }}
            />
          )}

          {viewMode === 'movements' && (
            <MovementsTab
              materials={materials}
              onMaterialAction={(material, action) => {
                if (action === 'adjustment') {
                  handleAdjustStock(material, material.quantity || 0);
                } else {
                  setSelectedMaterial(material);
                  setTransactionType(action);
                  setShowAddTransaction(true);
                }
              }}
            />
          )}

          {viewMode === 'auto-order' && (
            <div className="auto-order-view">
              <div className="materials-table-wrapper">
                <div className="inv-actions" style={{ marginBottom: 8 }}>
                  <button className="action-btn" onClick={openCreateRule}>➕ Добавить правило</button>
                  <button className="action-btn" onClick={async () => {
                    try {
                      await checkMaterialsForAutoOrder();
                      showToast('Проверка выполнена', 'success');
                    } catch {
                      showToast('Ошибка проверки', 'error');
                    }
                  }}>🔍 Проверить сейчас</button>
                </div>
                <table className="inv-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Материал</th>
                      <th>Поставщик</th>
                      <th>Порог</th>
                      <th>Заказ</th>
                      <th>Активно</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {autoLoading ? (
                      <tr><td colSpan={7}>Загрузка...</td></tr>
                    ) : autoRules.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '24px' }}>Правила не настроены</td>
                      </tr>
                    ) : (
                      autoRules.map((r: any) => (
                        <tr key={r.id}>
                          <td>{r.id}</td>
                          <td style={{ textAlign: 'left' }}>{r.material_name || r.material_id}</td>
                          <td style={{ textAlign: 'left' }}>{r.supplier_name || r.supplier_id}</td>
                          <td>{r.threshold_quantity}</td>
                          <td>{r.order_quantity}</td>
                          <td>{r.is_active ? '✅' : '⏸️'}</td>
                          <td>
                            <div className="inv-actions">
                              <button className="action-btn small" onClick={() => openEditRule(r)}>✏️</button>
                              <button className="action-btn small" onClick={async () => {
                                try {
                                  await checkMaterialsForAutoOrder();
                                  showToast('Проверка выполнена', 'success');
                                } catch {
                                  showToast('Ошибка проверки', 'error');
                                }
                              }}>🔍</button>
                              <button className="action-btn small danger" onClick={async () => {
                                if (!window.confirm('Удалить правило?')) return;
                                try {
                                  await deleteAutoOrderRule(r.id);
                                  await loadAutoRules();
                                  showToast('Правило удалено', 'success');
                                } catch {
                                  showToast('Ошибка удаления', 'error');
                                }
                              }}>🗑️</button>
        </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
      </div>

              {showRuleModal && (
                <div className="modal-backdrop">
                  <div className="modal">
            <div className="modal-header">
                      <h3>{editingRule ? 'Редактировать правило' : 'Новое правило'}</h3>
                      <button className="action-btn small" onClick={() => setShowRuleModal(false)}>✖</button>
            </div>
            <div className="modal-body">
                      <div className="form-row">
              <div className="form-group">
                          <label>Материал</label>
                          <select value={ruleForm.material_id} onChange={e => {
                            const mid = Number(e.target.value) || '' as any;
                            if (!mid) {
                              setRuleForm(prev => ({ ...prev, material_id: '', supplier_id: prev.supplier_id }));
                              return;
                            }
                            const mat = materials.find(m => m.id === Number(mid));
                            const suggestedThreshold = ((mat as any)?.min_quantity ?? (mat as any)?.min_stock_level ?? 10) as number;
                            const suggestedOrder = Math.max( (suggestedThreshold || 10) * 2, 10 );
                            const suggestedSupplierId = (mat as any)?.supplier_id || (mat as any)?.supplier?.id || prev.supplier_id || '';
                            setRuleForm(prev => ({
                              ...prev,
                              material_id: Number(mid),
                              supplier_id: suggestedSupplierId,
                              threshold_quantity: prev.threshold_quantity === '' ? suggestedThreshold : prev.threshold_quantity,
                              order_quantity: prev.order_quantity === '' ? suggestedOrder : prev.order_quantity
                            }));
                          }}>
                  <option value="">Выберите материал</option>
                            {materials.map(m => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                          <label>Поставщик</label>
                          <select value={ruleForm.supplier_id} onChange={e => setRuleForm(prev => ({ ...prev, supplier_id: Number(e.target.value) || '' }))}>
                            <option value="">Выберите поставщика</option>
                            {suppliers.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                </select>
              </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Порог</label>
                          <input type="number" min={1} step={1} value={ruleForm.threshold_quantity as any} onChange={e => setRuleForm(prev => ({ ...prev, threshold_quantity: e.target.value === '' ? '' : Math.max(1, Math.floor(Number(e.target.value))) }))} />
                        </div>
              <div className="form-group">
                          <label>Заказ (кол-во)</label>
                          <input type="number" min={1} step={1} value={ruleForm.order_quantity as any} onChange={e => setRuleForm(prev => ({ ...prev, order_quantity: e.target.value === '' ? '' : Math.max(1, Math.floor(Number(e.target.value))) }))} />
                        </div>
              </div>
                      <div className="form-row">
              <div className="form-group">
                          <label>
                            <input type="checkbox" checked={ruleForm.is_active} onChange={e => setRuleForm(prev => ({ ...prev, is_active: e.target.checked }))} /> Активно
                          </label>
                        </div>
              </div>
            </div>
            <div className="modal-footer">
                      <button className="action-btn" onClick={saveRule}>💾 Сохранить</button>
                      <button className="action-btn" onClick={() => setShowRuleModal(false)}>Отмена</button>
            </div>
          </div>
        </div>
      )}
            </div>
          )}
        </div>
      </div>

      {/* Единое модальное окно транзакций склада */}
      <EnhancedMaterialTransactionModal
        isOpen={showAddTransaction}
        onClose={() => setShowAddTransaction(false)}
        material={selectedMaterial}
        transactionType={transactionType}
        onSuccess={onRefresh}
      />
    </div>
  );
};
