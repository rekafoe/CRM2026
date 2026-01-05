import { useState, useCallback, useEffect } from 'react';
import { useUIStore } from '../../../stores/uiStore';
import { 
  getPaperTypes, 
  createPaperType, 
  updatePaperType, 
  deletePaperType,
  addPrintingPrice
} from '../../../api';

export interface PaperType {
  id: number;
  name: string;
  display_name: string;
  search_keywords: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  materials?: any[];
  prices?: { [density: number]: number };
}

export interface Material {
  id: number;
  name: string;
  category_id: number;
  paper_type_id?: number;
  density?: number;
  sheet_price_single?: number;
  price?: number;
  quantity: number;
  min_stock_level: number;
  max_stock_level: number;
  unit: string;
  supplier: string;
  created_at: string;
  updated_at: string;
  category_name?: string;
}

export const usePaperTypesManagement = (onRefresh?: () => void) => {
  const { showToast } = useUIStore();
  
  // Основные состояния
  const [paperTypes, setPaperTypes] = useState<PaperType[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'types' | 'materials'>('types');
  
  // Модальные окна
  const [modals, setModals] = useState({
    showAdd: false,
    showPrice: false,
    editingPaperType: null as PaperType | null
  });
  
  // Формы
  const [forms, setForms] = useState({
    newPaperType: {
      name: '',
      display_name: '',
      search_keywords: ''
    },
    newPrice: {
      paper_type_id: 0,
      density: 0,
      price: 0
    }
  });

  // Загрузка типов бумаги
  const loadPaperTypes = useCallback(async () => {
    try {
      console.log('🔄 Loading paper types...');
      setLoading(true);
      const response = await getPaperTypes();
      console.log('📥 Paper types response:', response);
      const newPaperTypes = response.data || [];
      console.log('📋 Setting paper types:', newPaperTypes.length, 'items');
      
      // Дедупликация по id - оставляем только первое вхождение каждого id
      const uniquePaperTypes = newPaperTypes.reduce((acc, paperType) => {
        if (!acc.find(pt => pt.id === paperType.id)) {
          acc.push(paperType);
        }
        return acc;
      }, [] as PaperType[]);
      
      setPaperTypes(uniquePaperTypes);
    } catch (error) {
      console.error('❌ Ошибка загрузки типов бумаги:', error);
      showToast('Ошибка загрузки типов бумаги', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadPaperTypes();
  }, [loadPaperTypes]);

  // Действия с типами бумаги
  const handleCreatePaperType = async () => {
    if (!forms.newPaperType.name || !forms.newPaperType.display_name) {
      showToast('Заполните обязательные поля', 'error');
      return;
    }

    try {
      await createPaperType(forms.newPaperType);
      showToast('Тип бумаги создан', 'success');
      setForms(prev => ({ ...prev, newPaperType: { name: '', display_name: '', search_keywords: '' } }));
      setModals(prev => ({ ...prev, showAdd: false }));
      // Инвалидируем кэш типов бумаги перед перезагрузкой
      try { localStorage.removeItem('paper-types'); } catch {}
      loadPaperTypes();
      onRefresh?.();
    } catch (error) {
      console.error('Ошибка создания типа бумаги:', error);
      showToast('Ошибка создания типа бумаги', 'error');
    }
  };

  const handleUpdatePaperType = async () => {
    console.log('🔍 handleUpdatePaperType called', modals.editingPaperType);
    if (!modals.editingPaperType) {
      console.log('❌ No editingPaperType');
      return;
    }

    try {
      console.log('📤 Sending update request:', {
        id: modals.editingPaperType.id,
        data: {
          name: modals.editingPaperType.name,
          display_name: modals.editingPaperType.display_name,
          search_keywords: modals.editingPaperType.search_keywords,
          is_active: modals.editingPaperType.is_active
        }
      });
      
      await updatePaperType(modals.editingPaperType.id, {
        name: modals.editingPaperType.name,
        display_name: modals.editingPaperType.display_name,
        search_keywords: modals.editingPaperType.search_keywords,
        is_active: modals.editingPaperType.is_active
      });
      
      console.log('✅ Update successful');
      showToast('Тип бумаги обновлен', 'success');
      setModals(prev => ({ ...prev, editingPaperType: null }));
      
      // Принудительно обновляем данные
      console.log('🔄 Forcing data reload after update...');
      // Инвалидируем кэш перед перезагрузкой
      try { localStorage.removeItem('paper-types'); } catch {}
      await loadPaperTypes();
      onRefresh?.();
    } catch (error) {
      console.error('❌ Ошибка обновления типа бумаги:', error);
      showToast('Ошибка обновления типа бумаги', 'error');
    }
  };

  const handleDeletePaperType = async (id: number) => {
    console.log('🔍 handleDeletePaperType called', id);
    
    if (!confirm('Удалить тип бумаги?')) {
      console.log('❌ User cancelled deletion');
      return;
    }

    try {
      console.log('📤 Sending delete request for ID:', id);
      await deletePaperType(id);
      console.log('✅ Delete successful');
      showToast('Тип бумаги удален', 'success');
      
      // Принудительно обновляем данные
      console.log('🔄 Forcing data reload after delete...');
      // Инвалидируем кэш перед перезагрузкой
      try { localStorage.removeItem('paper-types'); } catch {}
      await loadPaperTypes();
      onRefresh?.();
    } catch (error) {
      console.error('❌ Ошибка удаления типа бумаги:', error);
      showToast('Ошибка удаления типа бумаги', 'error');
    }
  };

  const handleAddPrice = async () => {
    if (!forms.newPrice.paper_type_id || !forms.newPrice.density || !forms.newPrice.price) {
      showToast('Заполните все поля', 'error');
      return;
    }

    try {
      await addPrintingPrice({
        paper_type_id: forms.newPrice.paper_type_id,
        density: forms.newPrice.density,
        price: forms.newPrice.price
      });
      showToast('Цена добавлена', 'success');
      setForms(prev => ({ ...prev, newPrice: { paper_type_id: 0, density: 0, price: 0 } }));
      setModals(prev => ({ ...prev, showPrice: false }));
      loadPaperTypes();
    } catch (error) {
      console.error('Ошибка добавления цены:', error);
      showToast('Ошибка добавления цены', 'error');
    }
  };

  // Утилиты для обновления состояний
  const updateModal = (key: keyof typeof modals, value: any) => {
    setModals(prev => ({ ...prev, [key]: value }));
  };

  const updateForm = (formKey: keyof typeof forms, field: string, value: any) => {
    setForms(prev => ({
      ...prev,
      [formKey]: { ...prev[formKey], [field]: value }
    }));
  };

  const updateEditingPaperType = (field: string, value: any) => {
    if (!modals.editingPaperType) return;
    setModals(prev => ({
      ...prev,
      editingPaperType: { ...prev.editingPaperType!, [field]: value }
    }));
  };

  return {
    // Состояния
    paperTypes,
    loading,
    activeTab,
    modals,
    forms,
    
    // Действия
    setActiveTab,
    loadPaperTypes,
    handleCreatePaperType,
    handleUpdatePaperType,
    handleDeletePaperType,
    handleAddPrice,
    
    // Утилиты
    updateModal,
    updateForm,
    updateEditingPaperType
  };
};
