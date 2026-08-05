import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Material, MaterialKind } from '../../types/shared';
import { api, createMaterialType } from '../../api';
import { materialPriceFieldLabel, materialPurchasePriceFieldLabel } from '../../utils/materialPriceLabels';
import { formatRollStockLabel } from '../../utils/materialRollLabels';
import { BynSymbol } from '../ui';
import { AppIcon } from '../ui/AppIcon';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { useUIStore } from '../../stores/uiStore';
import './MaterialFormModal.css';

/** Отображение числа в input: 0 не превращается в пустую строку. */
function numberInputValue(value: unknown): string | number {
  if (value === '' || value === null || value === undefined) return '';
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : '';
}

/** Парсинг числа: пусто → fallback, «0» остаётся 0 (не через ||). */
function parseNumberInput(raw: string, fallback: number, asInt = false): number {
  const trimmed = raw.trim();
  if (trimmed === '') return fallback;
  const n = asInt ? parseInt(trimmed, 10) : parseFloat(trimmed);
  return Number.isFinite(n) ? n : fallback;
}

function parseOptionalNumberInput(raw: string, asInt = false): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const n = asInt ? parseInt(trimmed, 10) : parseFloat(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

interface PaperType {
  id: number;
  name: string;
  display_name: string;
}

interface MaterialFormModalProps {
  isOpen: boolean;
  material?: Material | null;
  onClose: () => void;
  onSave: (materialData: any) => void;
}

interface MaterialTypeOption {
  id: number;
  category_id: number;
  name: string;
  is_active?: number | boolean;
}

const KIND_LABELS: Record<MaterialKind, string> = {
  sheet: 'Листовой',
  roll: 'Рулонный',
  consumable: 'Расходка',
  area: 'Площадной',
};

const KIND_DEFAULT_UNITS: Record<MaterialKind, string> = {
  sheet: 'шт',
  roll: 'м',
  consumable: 'шт',
  area: 'м²',
};

export const MaterialFormModal: React.FC<MaterialFormModalProps> = ({
  isOpen,
  material,
  onClose,
  onSave
}) => {
  type MaterialFormData = Omit<Partial<Material>, 'sheet_width' | 'sheet_height' | 'material_kind' | 'material_type_id'> & {
    finish?: string;
    // поля, которые есть в форме, но могут отсутствовать в shared Material типе
    density?: number;
    paper_type_id?: number;
    material_kind?: MaterialKind;
    material_type_id?: number;
    /** Размер листа (мм) — для расчёта вместимости в калькуляторе (A4: 210×297, SRA3: 320×450) */
    sheet_width?: number | null | '';
    sheet_height?: number | null | '';
  };

  const [formData, setFormData] = useState<MaterialFormData>({
    name: '',
    description: '',
    category_id: undefined, // Изменяем на undefined, чтобы пользователь выбрал категорию
    quantity: 0,
    unit: 'шт',
    price: 0,
    sheet_price_single: 0, // Отпускная цена
    purchase_price: undefined, // Закупочная цена (null = ещё не задана)
    supplier_id: undefined,
    min_stock_level: 0,
    max_stock_level: 100,
    location: '',
    barcode: '',
    sku: '',
    notes: '',
    is_active: true,
    paper_type_id: undefined, // 🆕 Добавляем поле для связи с типом бумаги
    material_type_id: undefined,
    material_kind: 'consumable',
    density: undefined, // 🆕 Добавляем поле плотности
    finish: '', // 🆕 Отделка (для ламинации)
    sheet_width: '',
    sheet_height: ''
  });

  // 🆕 Состояние для типов бумаги
  const [paperTypes, setPaperTypes] = useState<PaperType[]>([]);
  const [loadingPaperTypes, setLoadingPaperTypes] = useState(false);
  
  // 🆕 Состояние для поставщиков
  const [suppliers, setSuppliers] = useState<{id: number, name: string}[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  
  // 🆕 Состояние для категорий
  const [categories, setCategories] = useState<{id: number, name: string}[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);

  // 🆕 Состояние для типов материалов (внутри категорий)
  const [materialTypes, setMaterialTypes] = useState<MaterialTypeOption[]>([]);
  const [loadingMaterialTypes, setLoadingMaterialTypes] = useState(false);
  const [showQuickTypeModal, setShowQuickTypeModal] = useState(false);
  const [quickTypeName, setQuickTypeName] = useState('');
  const [creatingType, setCreatingType] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const initialSnapshotRef = useRef('');
  const { showToast } = useUIStore();

  const formSnapshot = useCallback((data: MaterialFormData) => JSON.stringify(data), []);

  const isDirty = useCallback(() => {
    if (!initialSnapshotRef.current) return false;
    return formSnapshot(formData) !== initialSnapshotRef.current;
  }, [formData, formSnapshot]);

  const requestClose = useCallback(() => {
    if (showQuickTypeModal) return;
    if (isDirty()) {
      setShowCloseConfirm(true);
      return;
    }
    onClose();
  }, [isDirty, onClose, showQuickTypeModal]);

  const inferredKind = React.useMemo<MaterialKind>(() => {
    const explicitKind = formData.material_kind;
    if (explicitKind && ['sheet', 'roll', 'consumable', 'area'].includes(explicitKind)) {
      return explicitKind;
    }

    const normalizedUnit = String(formData.unit || '').trim().toLowerCase();
    if (normalizedUnit === 'м' || normalizedUnit === 'm' || normalizedUnit === 'meter' || normalizedUnit === 'meters') {
      return 'roll';
    }
    if (normalizedUnit === 'м²' || normalizedUnit === 'm²' || normalizedUnit === 'm2' || normalizedUnit === 'sqm') {
      return 'area';
    }
    if (formData.paper_type_id || formData.sheet_height || formData.sheet_width) {
      return 'sheet';
    }
    return 'consumable';
  }, [formData.material_kind, formData.paper_type_id, formData.sheet_height, formData.sheet_width, formData.unit]);

  const isRollKind = inferredKind === 'roll';
  const isSheetKind = inferredKind === 'sheet';
  const showDimensionFields = isSheetKind || isRollKind;

  const selectedCategory = React.useMemo(
    () => categories.find((c) => c.id === formData.category_id),
    [categories, formData.category_id]
  );
  const isLamination = React.useMemo(() => {
    if (!selectedCategory) return false;
    const name = selectedCategory.name.toLowerCase();
    // Показываем ламинационные поля как минимум для категорий, содержащих "лам" или "пленк"
    return name.includes('лам') || name.includes('пленк');
  }, [selectedCategory]);

  // 🆕 Загрузка типов бумаги
  const loadPaperTypes = async () => {
    try {
      setLoadingPaperTypes(true);
      const response = await api.get('/paper-types');
      const data = response.data || [];
      // Дедупликация по id
      const uniquePaperTypes = data.reduce((acc: PaperType[], paperType: PaperType) => {
        if (!acc.find(pt => pt.id === paperType.id)) {
          acc.push(paperType);
        }
        return acc;
      }, []);
      setPaperTypes(uniquePaperTypes);
    } catch (error) {
      console.error('Ошибка загрузки типов бумаги:', error);
      setPaperTypes([]);
    } finally {
      setLoadingPaperTypes(false);
    }
  };

  // 🆕 Загрузка типов материалов
  const loadMaterialTypes = async (categoryId?: number) => {
    try {
      setLoadingMaterialTypes(true);
      const response = await api.get('/material-types', categoryId ? { params: { category_id: categoryId } } : undefined);
      const data = (response.data || []) as MaterialTypeOption[];
      const uniqueMaterialTypes = data.reduce((acc: MaterialTypeOption[], materialType: MaterialTypeOption) => {
        if (!acc.find(mt => mt.id === materialType.id)) {
          acc.push(materialType);
        }
        return acc;
      }, []);
      setMaterialTypes(uniqueMaterialTypes);
    } catch (error) {
      console.error('Ошибка загрузки типов материалов:', error);
      setMaterialTypes([]);
    } finally {
      setLoadingMaterialTypes(false);
    }
  };

  // 🆕 Загрузка поставщиков
  const loadSuppliers = async () => {
    try {
      setLoadingSuppliers(true);
      const response = await api.get('/suppliers');
      const data = response.data || [];
      // Дедупликация по id
      const uniqueSuppliers = data.reduce((acc: {id: number, name: string}[], supplier: {id: number, name: string}) => {
        if (!acc.find(s => s.id === supplier.id)) {
          acc.push(supplier);
        }
        return acc;
      }, []);
      setSuppliers(uniqueSuppliers);
    } catch (error) {
      console.error('Ошибка загрузки поставщиков:', error);
      setSuppliers([]);
    } finally {
      setLoadingSuppliers(false);
    }
  };

  // 🆕 Загрузка категорий
  const loadCategories = async () => {
    try {
      setLoadingCategories(true);
      const response = await api.get('/material-categories');
      const data = response.data || [];
      // Дедупликация по id
      const uniqueCategories = data.reduce((acc: {id: number, name: string}[], category: {id: number, name: string}) => {
        if (!acc.find(c => c.id === category.id)) {
          acc.push(category);
        }
        return acc;
      }, []);
      setCategories(uniqueCategories);
    } catch (error) {
      console.error('Ошибка загрузки категорий:', error);
      setCategories([]);
    } finally {
      setLoadingCategories(false);
    }
  };

  // 🆕 Загружаем типы бумаги, поставщиков и категории при монтировании компонента
  useEffect(() => {
    loadPaperTypes();
    loadSuppliers();
    loadCategories();
    loadMaterialTypes();
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setShowCloseConfirm(false);
      initialSnapshotRef.current = '';
      return;
    }

    let next: MaterialFormData;
    if (material) {
      const price = material.sheet_price_single ?? material.price ?? 0;
      const purchaseRaw = material.purchase_price;
      const purchasePrice =
        purchaseRaw === null || purchaseRaw === undefined
          ? undefined
          : Number(purchaseRaw);

      next = {
        name: material.name || '',
        description: material.description || '',
        category_id: material.category_id || undefined,
        quantity: material.quantity ?? 0,
        unit: material.unit || 'шт',
        price: Number.isFinite(Number(price)) ? Number(price) : 0,
        sheet_price_single: Number.isFinite(Number(price)) ? Number(price) : 0,
        purchase_price: purchasePrice !== undefined && Number.isFinite(purchasePrice) ? purchasePrice : undefined,
        supplier_id: material.supplier_id,
        min_stock_level: material.min_stock_level ?? 0,
        max_stock_level: material.max_stock_level ?? 100,
        location: material.location || '',
        barcode: material.barcode || '',
        sku: material.sku || '',
        notes: material.notes || '',
        is_active: material.is_active !== undefined ? material.is_active : true,
        paper_type_id: (material as any).paper_type_id || undefined,
        material_type_id: (material as any).material_type_id || undefined,
        material_kind: (material as any).material_kind || undefined,
        density: (material as any).density ?? undefined,
        finish: (material as any).finish || '',
        sheet_width: (material as any).sheet_width ?? '',
        sheet_height: (material as any).sheet_height ?? ''
      };
    } else {
      next = {
        name: '',
        description: '',
        category_id: undefined,
        quantity: 0,
        unit: 'шт',
        price: 0,
        sheet_price_single: 0,
        purchase_price: undefined,
        supplier_id: undefined,
        min_stock_level: 0,
        max_stock_level: 100,
        location: '',
        barcode: '',
        sku: '',
        notes: '',
        is_active: true,
        paper_type_id: undefined,
        material_type_id: undefined,
        material_kind: 'consumable',
        density: undefined,
        finish: '',
        sheet_width: '',
        sheet_height: ''
      };
    }

    setFormData(next);
    initialSnapshotRef.current = formSnapshot(next);
    setShowCloseConfirm(false);
  }, [material, isOpen, formSnapshot]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showQuickTypeModal) {
          if (!creatingType) setShowQuickTypeModal(false);
          return;
        }
        if (showCloseConfirm) {
          setShowCloseConfirm(false);
          return;
        }
        requestClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, requestClose, showQuickTypeModal, creatingType, showCloseConfirm]);

  useEffect(() => {
    const categoryId = formData.category_id;
    if (!categoryId) {
      setMaterialTypes([]);
      setFormData(prev => ({ ...prev, material_type_id: undefined }));
      return;
    }

    loadMaterialTypes(categoryId);
  }, [formData.category_id]);

  useEffect(() => {
    if (!formData.material_type_id) return;
    const hasType = materialTypes.some((mt) => mt.id === formData.material_type_id);
    if (!hasType) {
      setFormData(prev => ({ ...prev, material_type_id: undefined }));
    }
  }, [materialTypes, formData.material_type_id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      material_kind: inferredKind,
      material_type_id: formData.material_type_id || undefined,
      unit: formData.unit || KIND_DEFAULT_UNITS[inferredKind],
      quantity: formData.quantity ?? 0,
      price: formData.price ?? 0,
      sheet_price_single: formData.sheet_price_single ?? formData.price ?? 0,
      purchase_price: formData.purchase_price,
      min_stock_level: formData.min_stock_level ?? 0,
      max_stock_level: formData.max_stock_level ?? 100,
    };
    onSave(payload);
  };

  const handleChange = (field: keyof MaterialFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay material-form-modal-overlay" onClick={requestClose}>
      <div className="modal-content material-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header material-form-modal__header">
          <h2>{material ? 'Редактировать материал' : 'Добавить материал'}</h2>
          <button type="button" className="modal-close" onClick={requestClose} aria-label="Закрыть">×</button>
        </div>

        <form onSubmit={handleSubmit} className="material-form">
          <div className="material-form__body">
          <div className="form-row">
            <div className="form-group">
              <label>Название *</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => handleChange('name', e.target.value)}
                required
                placeholder="Введите название материала"
              />
            </div>
            <div className="form-group">
              <label>Описание</label>
              <input
                type="text"
                value={formData.description || ''}
                onChange={(e) => handleChange('description', e.target.value)}
                placeholder="Краткое описание"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Категория *</label>
              <select
                value={formData.category_id || ''}
                onChange={(e) => {
                  const nextCategoryId = e.target.value ? parseInt(e.target.value, 10) : undefined;
                  handleChange('category_id', nextCategoryId);
                  handleChange('material_type_id', undefined);
                }}
                required
                disabled={loadingCategories}
              >
                <option value="">Выберите категорию</option>
                {categories.map((category, index) => (
                  <option key={`category-${category.id}-${index}`} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {loadingCategories && <div className="loading-text">Загрузка категорий...</div>}
            </div>
            <div className="form-group">
              <label>Тип материала</label>
              <div className="material-type-select-row">
                <select
                  value={formData.material_type_id || ''}
                  onChange={(e) => handleChange('material_type_id', e.target.value ? parseInt(e.target.value, 10) : undefined)}
                  disabled={!formData.category_id || loadingMaterialTypes}
                >
                  <option value="">{formData.category_id ? 'Выберите тип' : 'Сначала категория'}</option>
                  {materialTypes
                    .filter((type) => Number(type.is_active ?? 1) !== 0)
                    .map((type) => (
                      <option key={`material-type-${type.id}`} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className="material-type-add-btn"
                  disabled={!formData.category_id || creatingType}
                  title="Создать новый тип в этой категории"
                  onClick={() => {
                    setQuickTypeName('');
                    setShowQuickTypeModal(true);
                  }}
                >
                  <AppIcon name="plus" size="xs" />
                </button>
              </div>
              <small className="form-hint">
                Полный список типов: вкладка «Категории и типы».
              </small>
              {loadingMaterialTypes && <div className="loading-text">Загрузка типов...</div>}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Класс материала *</label>
              <select
                value={inferredKind}
                onChange={(e) => {
                  const nextKind = e.target.value as MaterialKind;
                  handleChange('material_kind', nextKind);
                  if ((formData.unit || '').trim() === '' || formData.unit === KIND_DEFAULT_UNITS[inferredKind]) {
                    handleChange('unit', KIND_DEFAULT_UNITS[nextKind]);
                  }
                }}
                required
              >
                {(['sheet', 'roll', 'consumable', 'area'] as MaterialKind[]).map((kind) => (
                  <option key={kind} value={kind}>
                    {KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
              <small className="form-hint">
                Категория → тип → SKU: этот класс задаёт правила списания и обязательные поля.
              </small>
            </div>
            <div className="form-group">
              <label>Единица измерения *</label>
              <select
                value={formData.unit || 'шт'}
                onChange={(e) => handleChange('unit', e.target.value)}
                required
              >
                <option value="шт">Штуки</option>
                <option value="кг">Килограммы</option>
                <option value="л">Литры</option>
                <option value="м">Метры</option>
                <option value="м²">Квадратные метры</option>
                <option value="м³">Кубические метры</option>
                <option value="упак">Упаковки</option>
              </select>
            </div>
          </div>

          {/* Поля для бумаги */}
          {!isLamination && isSheetKind && (
            <div className="form-row">
              <div className="form-group">
                <label>Тип бумаги</label>
                <select
                  value={formData.paper_type_id || ''}
                  onChange={(e) => handleChange('paper_type_id', e.target.value ? parseInt(e.target.value) : undefined)}
                  disabled={loadingPaperTypes}
                >
                  <option value="">Выберите тип бумаги (опционально)</option>
                  {paperTypes.map((paperType, index) => (
                    <option key={`papertype-${paperType.id}-${index}`} value={paperType.id}>
                      {paperType.display_name}
                    </option>
                  ))}
                </select>
                {loadingPaperTypes && (
                  <small className="form-hint">
                    Загрузка типов бумаги...
                  </small>
                )}
              </div>
              <div className="form-group">
                <label>Плотность (г/м²)</label>
                <input
                  type="number"
                  value={numberInputValue((formData as any).density)}
                  onChange={(e) => {
                    handleChange('density' as any, parseOptionalNumberInput(e.target.value, true));
                  }}
                  placeholder="120, 150, 200..."
                  min="50"
                  max="500"
                  step="1"
                />
                <small className="form-hint">
                  Укажите плотность бумаги для точного сопоставления с калькулятором
                </small>
              </div>
            </div>
          )}

          {/* Поля для ламинации */}
          {isLamination && (
            <div className="form-row">
              <div className="form-group">
                <label>Тип ламинации</label>
                <select
                  value={(formData as any).finish || ''}
                  onChange={(e) => handleChange('finish' as any, e.target.value || '')}
                >
                  <option value="">Выберите тип ламинации</option>
                  <option value="Глянцевая">Глянцевая</option>
                  <option value="Матовая">Матовая</option>
                  <option value="Софт-тач">Софт-тач</option>
                  <option value="Антискретч">Антискретч</option>
                  <option value="UV">UV</option>
                </select>
              </div>
              <div className="form-group">
                <label>Толщина пленки (мк)</label>
                <input
                  type="number"
                  value={numberInputValue((formData as any).density)}
                  onChange={(e) => {
                    handleChange('density' as any, parseOptionalNumberInput(e.target.value, true));
                  }}
                  placeholder="25, 32, 42..."
                  min="10"
                  max="250"
                  step="1"
                />
                <small className="form-hint">
                  Используем поле толщины для ламинации (в микронах)
                </small>
              </div>
            </div>
          )}

          {showDimensionFields && (
            <>
              {isRollKind && (
                <div className="form-section-title">Параметры рулона (ширина × намотка)</div>
              )}
              <div className="form-row">
                <div className="form-group">
                  <label>{isRollKind ? 'Ширина рулона (мм) *' : 'Ширина листа (мм)'}</label>
                  <input
                    type="number"
                    value={numberInputValue(formData.sheet_width === '' ? undefined : formData.sheet_width)}
                    onChange={(e) => {
                      const next = parseOptionalNumberInput(e.target.value);
                      handleChange('sheet_width' as any, next === undefined ? '' : next);
                    }}
                    placeholder={isRollKind ? '630 (это 63 см)' : '210 (A4), 320 (SRA3)'}
                    min="1"
                    max={isRollKind ? undefined : '2000'}
                    step="1"
                    required
                  />
                  <small className="form-hint">
                    {isRollKind
                      ? 'Ширина полотна в миллиметрах. Пример: 630 мм = 63 см.'
                      : 'Размер печатного листа для расчёта вместимости в калькуляторе.'}
                  </small>
                </div>
                <div className="form-group">
                  <label>{isRollKind ? 'Остаток намотки (пог. м) *' : 'Высота листа (мм) *'}</label>
                  <input
                    type="number"
                    value={
                      isRollKind
                        ? numberInputValue(formData.quantity)
                        : numberInputValue(formData.sheet_height === '' ? undefined : formData.sheet_height)
                    }
                    onChange={(e) => {
                      if (isRollKind) {
                        handleChange('quantity', parseNumberInput(e.target.value, 0));
                        return;
                      }
                      const next = parseOptionalNumberInput(e.target.value);
                      handleChange('sheet_height' as any, next === undefined ? '' : next);
                    }}
                    placeholder={isRollKind ? '50' : '297 (A4), 450 (SRA3)'}
                    min={isRollKind ? '0' : '1'}
                    max={isRollKind ? undefined : '2000'}
                    step={isRollKind ? '0.01' : '1'}
                    required
                  />
                  {isRollKind ? (
                    <small className="form-hint">
                      Складской остаток рулона в погонных метрах (не число рулонов).
                      {' '}
                      Сейчас: <strong>{formatRollStockLabel({
                        sheet_width: (() => {
                          const raw = formData.sheet_width;
                          if (raw === '' || raw === null || raw === undefined) return null;
                          const w = Number(raw);
                          return Number.isFinite(w) ? w : null;
                        })(),
                        quantity: formData.quantity,
                      })}</strong>
                    </small>
                  ) : null}
                </div>
              </div>
            </>
          )}

          {!isRollKind && (
            <div className="form-row">
              <div className="form-group">
                <label>Количество *</label>
                <input
                  type="number"
                  value={numberInputValue(formData.quantity)}
                  onChange={(e) => {
                    handleChange('quantity', parseNumberInput(e.target.value, 0, true));
                  }}
                  required
                  min="0"
                  step="1"
                />
              </div>
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label>
                <span>{materialPurchasePriceFieldLabel(formData.unit)}</span>
                <span className="material-form__currency"> (<BynSymbol />)</span>
                <span className="material-form__required" aria-hidden="true"> *</span>
              </label>
              <input
                type="number"
                value={numberInputValue((formData as any).purchase_price)}
                onChange={(e) => {
                  handleChange('purchase_price', parseOptionalNumberInput(e.target.value));
                }}
                required
                min="0"
                step="0.01"
              />
              <small className="form-hint">
                Для стоимости склада и аналитики. Если не задана — временно берётся отпускная.
              </small>
            </div>
            <div className="form-group">
              <label>
                <span>{materialPriceFieldLabel(formData.unit)}</span>
                <span className="material-form__currency"> (<BynSymbol />)</span>
                <span className="material-form__required" aria-hidden="true"> *</span>
              </label>
              <input
                type="number"
                value={numberInputValue(formData.price)}
                onChange={(e) => {
                  const price = parseNumberInput(e.target.value, 0);
                  handleChange('price', price);
                  handleChange('sheet_price_single', price);
                }}
                required
                min="0"
                step="0.01"
              />
              {isRollKind ? (
                <small className="form-hint">
                  В расчёте заказа умножается на списанные погонные метры.
                </small>
              ) : (
                <small className="form-hint">
                  Цена для калькулятора и клиента.
                </small>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>{isRollKind ? 'Мин. остаток намотки (пог. м)' : 'Минимальный запас'}</label>
              <input
                type="number"
                value={numberInputValue(formData.min_stock_level)}
                onChange={(e) => {
                  handleChange('min_stock_level', parseNumberInput(e.target.value, 0, !isRollKind));
                }}
                min="0"
                step={isRollKind ? '0.01' : '1'}
              />
            </div>
            <div className="form-group">
              <label>{isRollKind ? 'Макс. намотка (пог. м)' : 'Максимальный запас'}</label>
              <input
                type="number"
                value={numberInputValue(formData.max_stock_level)}
                onChange={(e) => {
                  handleChange('max_stock_level', parseNumberInput(e.target.value, 100, !isRollKind));
                }}
                min="0"
                step={isRollKind ? '0.01' : '1'}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Местоположение</label>
              <input
                type="text"
                value={formData.location || ''}
                onChange={(e) => handleChange('location', e.target.value)}
                placeholder="Стеллаж, полка, ящик"
              />
            </div>
            <div className="form-group">
              <label>Штрих-код</label>
              <input
                type="text"
                value={formData.barcode || ''}
                onChange={(e) => handleChange('barcode', e.target.value)}
                placeholder="Штрих-код или QR-код"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Артикул (SKU)</label>
              <input
                type="text"
                value={formData.sku || ''}
                onChange={(e) => handleChange('sku', e.target.value)}
                placeholder="Внутренний артикул"
              />
            </div>
            <div className="form-group">
              <label>Поставщик</label>
              <select
                value={formData.supplier_id || ''}
                onChange={(e) => handleChange('supplier_id', e.target.value ? parseInt(e.target.value) : undefined)}
                disabled={loadingSuppliers}
              >
                <option value="">Выберите поставщика</option>
                {suppliers.map((supplier, index) => (
                  <option key={`supplier-${supplier.id}-${index}`} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
              {loadingSuppliers && <small>Загрузка поставщиков...</small>}
            </div>
          </div>

          <div className="form-group">
            <label>Примечания</label>
            <textarea
              value={formData.notes || ''}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Дополнительная информация о материале"
              rows={3}
            />
          </div>

          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={formData.is_active !== false}
                onChange={(e) => handleChange('is_active', e.target.checked)}
              />
              Материал активен
            </label>
          </div>
          </div>

          <div className="modal-actions material-form-modal__actions">
            <button type="button" className="btn btn-secondary" onClick={requestClose}>
              Отмена
            </button>
            <button type="submit" className="btn btn-primary">
              {material ? 'Сохранить изменения' : 'Добавить материал'}
            </button>
          </div>
        </form>
      </div>

      <ConfirmDialog
        isOpen={showCloseConfirm}
        onClose={() => setShowCloseConfirm(false)}
        onConfirm={onClose}
        title="Закрыть форму?"
        message="Есть несохранённые изменения. Закрыть без сохранения?"
        confirmText="Закрыть"
        cancelText="Остаться"
        variant="warning"
      />

      {showQuickTypeModal && (
        <div className="modal-overlay material-type-quick-overlay" onClick={() => !creatingType && setShowQuickTypeModal(false)}>
          <div className="modal-content material-type-quick-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Новый тип материала</h3>
            <p className="form-hint">
              Тип будет создан в выбранной категории и сразу выбран в форме.
            </p>
            <div className="form-group">
              <label>Название типа *</label>
              <input
                type="text"
                value={quickTypeName}
                onChange={(e) => setQuickTypeName(e.target.value)}
                placeholder="Например, Плёнка глянец"
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={creatingType}
                onClick={() => setShowQuickTypeModal(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={creatingType || !quickTypeName.trim() || !formData.category_id}
                onClick={async () => {
                  if (!formData.category_id || !quickTypeName.trim()) return;
                  try {
                    setCreatingType(true);
                    const res = await createMaterialType({
                      category_id: formData.category_id,
                      name: quickTypeName.trim(),
                      is_active: true,
                    });
                    const created = res.data;
                    await loadMaterialTypes(formData.category_id);
                    if (created?.id) {
                      handleChange('material_type_id', created.id);
                    }
                    setShowQuickTypeModal(false);
                    showToast('Тип материала создан', 'success');
                  } catch (error: any) {
                    showToast(error?.response?.data?.error || error?.message || 'Не удалось создать тип', 'error');
                  } finally {
                    setCreatingType(false);
                  }
                }}
              >
                {creatingType ? 'Создание...' : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
