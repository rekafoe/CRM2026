import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Material } from '../../types/shared';
import { useUIStore } from '../../stores/uiStore';
import { EnhancedMaterialTransactionModal } from './EnhancedMaterialTransactionModal';
import { getMaterialMoves, getAutoOrderRules, checkMaterialsForAutoOrder, deleteAutoOrderRule, getSuppliers, createAutoOrderRule, updateAutoOrderRule } from '../../api';
import { getSuggestedReplenishQty } from '../../utils/materialStockOps';
import './InventoryControl.css';
import { MaterialsTab, TransactionsTab, AlertsTab } from './inventory-control';

type TransactionType = 'in' | 'out' | 'adjustment' | 'transfer';
type ViewMode = 'stock' | 'history' | 'deficit' | 'auto-order';

interface InventoryControlProps {
  materials: Material[];
  onRefresh: () => void;
  initialView?: ViewMode;
  onOpenCatalog?: () => void;
}

function getMaterialStockStatus(material: Material): 'ok' | 'low' | 'out_of_stock' {
  const qty = material.quantity || 0;
  const minStock = material.min_stock_level || (material as any).min_quantity || 10;
  if (qty <= 0) return 'out_of_stock';
  if (qty <= minStock) return 'low';
  return 'ok';
}

export const InventoryControl: React.FC<InventoryControlProps> = ({
  materials,
  onRefresh,
  initialView = 'stock',
  onOpenCatalog,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [transactionType, setTransactionType] = useState<TransactionType>('in');
  const [initialQuantity, setInitialQuantity] = useState<number | null>(null);

  const { showToast } = useUIStore();

  useEffect(() => {
    setViewMode(initialView);
  }, [initialView]);

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
    if (viewMode === 'history') {
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

  const filteredMaterials = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (materials || []).filter(m => {
      const nameOk = !q || (m.name || '').toLowerCase().includes(q) || ((m as any).description || '').toLowerCase().includes(q);
      const catOk = !categoryFilter || ((m as any).category_name || '') === categoryFilter;
      const statusOk = !statusFilter || getMaterialStockStatus(m) === statusFilter;
      return nameOk && catOk && statusOk;
    });
  }, [materials, search, categoryFilter, statusFilter]);

  const openMaterialOp = useCallback((
    material: Material,
    action: 'in' | 'out' | 'adjustment',
    options?: { suggestQty?: boolean }
  ) => {
    setSelectedMaterial(material);
    setTransactionType(action);
    setInitialQuantity(
      action === 'in' && options?.suggestQty
        ? getSuggestedReplenishQty(material)
        : null
    );
    setShowAddTransaction(true);
  }, []);

  const openMaterialHistory = useCallback((materialId: number) => {
    setMoveFilters(prev => ({ ...prev, materialId }));
    setViewMode('history');
  }, []);

  return (
    <div className="inventory-control">
      <div className="inventory-header">
        <div>
          <h2>Остатки</h2>
          <p className="inv-header-sub">
            Операции со складом: приход, списание, история.
            {onOpenCatalog ? ' Карточки и цены — в справочнике.' : ''}
          </p>
        </div>
        <div className="header-actions">
          {onOpenCatalog ? (
            <button type="button" className="action-btn action-btn--text" onClick={onOpenCatalog}>
              К справочнику
            </button>
          ) : null}
        </div>
      </div>

      <div className="inventory-tabs">
        <div className="tabs-header">
          <button
            type="button"
            className={`tab-btn ${viewMode === 'stock' ? 'active' : ''}`}
            onClick={() => setViewMode('stock')}
          >
            Остатки и операции
          </button>
          <button
            type="button"
            className={`tab-btn ${viewMode === 'history' ? 'active' : ''}`}
            onClick={() => setViewMode('history')}
          >
            История движений
          </button>
          <button
            type="button"
            className={`tab-btn ${viewMode === 'deficit' ? 'active' : ''}`}
            onClick={() => setViewMode('deficit')}
          >
            Дефицит{alerts.length ? ` (${alerts.length})` : ''}
          </button>
          <button
            type="button"
            className={`tab-btn ${viewMode === 'auto-order' ? 'active' : ''}`}
            onClick={() => setViewMode('auto-order')}
          >
            Автозаказ
          </button>
        </div>

        <div className="tabs-content">
          {viewMode === 'stock' && (
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
                  openMaterialHistory(material.id!);
                } else {
                  openMaterialOp(material, action as 'in' | 'out' | 'adjustment');
                }
              }}
              onViewTransactions={openMaterialHistory}
            />
          )}
          {viewMode === 'history' && (
            <TransactionsTab
              moves={moves}
              materials={materials}
              loading={movesLoading}
              filters={moveFilters}
              onFilterChange={(updates) => setMoveFilters(prev => ({ ...prev, ...updates }))}
              onRefresh={loadMoves}
            />
          )}

          {viewMode === 'deficit' && (
            <AlertsTab
              alerts={alerts}
              onReceive={(material) => openMaterialOp(material, 'in', { suggestQty: true })}
              onViewHistory={(material) => openMaterialHistory(material.id!)}
              onOpenAutoOrder={() => setViewMode('auto-order')}
            />
          )}

          {viewMode === 'auto-order' && (
            <div className="auto-order-view">
              <div className="materials-table-wrapper">
                <p className="inv-section-hint">Правила: когда остаток ниже порога — система предлагает заказ поставщику.</p>
                <div className="inv-actions inv-actions--toolbar">
                  <button type="button" className="action-btn action-btn--text primary" onClick={openCreateRule}>
                    Добавить правило
                  </button>
                  <button
                    type="button"
                    className="action-btn action-btn--text"
                    onClick={async () => {
                      try {
                        await checkMaterialsForAutoOrder();
                        showToast('Проверка выполнена', 'success');
                      } catch {
                        showToast('Ошибка проверки', 'error');
                      }
                    }}
                  >
                    Проверить сейчас
                  </button>
                </div>
                <table className="inv-table">
                  <thead>
                    <tr>
                      <th className="col-name">Материал</th>
                      <th>Поставщик</th>
                      <th>Порог</th>
                      <th>Заказ</th>
                      <th>Статус</th>
                      <th className="col-actions">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {autoLoading ? (
                      <tr><td colSpan={6}>Загрузка...</td></tr>
                    ) : autoRules.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="inv-empty-cell">Правила не настроены</td>
                      </tr>
                    ) : (
                      autoRules.map((r: any) => (
                        <tr key={r.id}>
                          <td className="col-name">{r.material_name || r.material_id}</td>
                          <td>{r.supplier_name || r.supplier_id}</td>
                          <td>{r.threshold_quantity}</td>
                          <td>{r.order_quantity}</td>
                          <td>
                            <span className={`inv-badge ${r.is_active ? 'status-ok' : 'status-out_of_stock'}`}>
                              {r.is_active ? 'Активно' : 'Выкл.'}
                            </span>
                          </td>
                          <td className="col-actions">
                            <div className="inv-actions inv-actions--labeled">
                              <button type="button" className="action-btn action-btn--text" onClick={() => openEditRule(r)}>
                                Изменить
                              </button>
                              <button
                                type="button"
                                className="action-btn action-btn--text danger"
                                onClick={async () => {
                                  if (!window.confirm('Удалить правило?')) return;
                                  try {
                                    await deleteAutoOrderRule(r.id);
                                    await loadAutoRules();
                                    showToast('Правило удалено', 'success');
                                  } catch {
                                    showToast('Ошибка удаления', 'error');
                                  }
                                }}
                              >
                                Удалить
                              </button>
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
                      <button type="button" className="action-btn small" onClick={() => setShowRuleModal(false)}>×</button>
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
                            const suggestedSupplierId = (mat as any)?.supplier_id || (mat as any)?.supplier?.id || ruleForm.supplier_id || '';
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
                      <button type="button" className="action-btn action-btn--text primary" onClick={saveRule}>Сохранить</button>
                      <button type="button" className="action-btn action-btn--text" onClick={() => setShowRuleModal(false)}>Отмена</button>
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
        onClose={() => {
          setShowAddTransaction(false);
          setInitialQuantity(null);
        }}
        material={selectedMaterial}
        transactionType={transactionType}
        initialQuantity={initialQuantity}
        onSuccess={onRefresh}
      />
    </div>
  );
};
