import { useState, useCallback } from 'react';

interface ModalState {
  // Основные модальные окна
  showAddItem: boolean;
  showMaterials: boolean;
  showPrepaymentModal: boolean;
  showPrintingCalculator: boolean;
  showFilesModal: boolean;
  showPrepaymentDetailsModal: boolean;
  showOrderPool: boolean;
  showUserOrderPage: boolean;
  showCountersPage: boolean;
  showPageSwitcher: boolean;
  showTopPicker: boolean;
  
  // Новая система продуктов
  showProductSelector: boolean;
  showProductCalculator: boolean;
  
  // Управление заказами
  orderManagementTab: 'pool' | 'page';
}

interface ModalActions {
  // Основные модальные окна
  setShowAddItem: (show: boolean) => void;
  setShowMaterials: (show: boolean) => void;
  setShowPrepaymentModal: (show: boolean) => void;
  setShowPrintingCalculator: (show: boolean) => void;
  setShowFilesModal: (show: boolean) => void;
  setShowPrepaymentDetailsModal: (show: boolean) => void;
  setShowOrderPool: (show: boolean) => void;
  setShowUserOrderPage: (show: boolean) => void;
  setShowCountersPage: (show: boolean) => void;
  setShowPageSwitcher: (show: boolean) => void;
  setShowTopPicker: (show: boolean) => void;
  
  // Новая система продуктов
  setShowProductSelector: (show: boolean) => void;
  setShowProductCalculator: (show: boolean) => void;
  
  // Управление заказами
  setOrderManagementTab: (tab: 'pool' | 'page') => void;
  
  // Удобные методы
  openModal: (modalName: keyof ModalState) => void;
  closeModal: (modalName: keyof ModalState) => void;
  closeAllModals: () => void;
}

export function useModalState(): ModalState & ModalActions {
  // Состояния модальных окон
  const [showAddItem, setShowAddItem] = useState(false);
  const [showMaterials, setShowMaterials] = useState(false);
  const [showPrepaymentModal, setShowPrepaymentModal] = useState(false);
  const [showPrintingCalculator, setShowPrintingCalculator] = useState(false);
  const [showFilesModal, setShowFilesModal] = useState(false);
  const [showPrepaymentDetailsModal, setShowPrepaymentDetailsModal] = useState(false);
  const [showOrderPool, setShowOrderPool] = useState(false);
  const [showUserOrderPage, setShowUserOrderPage] = useState(false);
  const [showCountersPage, setShowCountersPage] = useState(false);
  const [showPageSwitcher, setShowPageSwitcher] = useState(false);
  const [showTopPicker, setShowTopPicker] = useState(false);
  
  // Новая система продуктов
  const [showProductSelector, setShowProductSelector] = useState(false);
  const [showProductCalculator, setShowProductCalculator] = useState(false);
  
  // Управление заказами
  const [orderManagementTab, setOrderManagementTab] = useState<'pool' | 'page'>('pool');

  // Удобные методы
  const openModal = useCallback((modalName: keyof ModalState) => {
    const setterMap = {
      showAddItem: setShowAddItem,
      showMaterials: setShowMaterials,
      showPrepaymentModal: setShowPrepaymentModal,
      showPrintingCalculator: setShowPrintingCalculator,
      showFilesModal: setShowFilesModal,
      showPrepaymentDetailsModal: setShowPrepaymentDetailsModal,
      showOrderPool: setShowOrderPool,
      showUserOrderPage: setShowUserOrderPage,
      showCountersPage: setShowCountersPage,
      showPageSwitcher: setShowPageSwitcher,
      showTopPicker: setShowTopPicker,
      showProductSelector: setShowProductSelector,
      showProductCalculator: setShowProductCalculator,
      orderManagementTab: setOrderManagementTab,
    };
    
    const setter = setterMap[modalName];
    if (setter && typeof setter === 'function') {
      setter(true as any);
    }
  }, []);

  const closeModal = useCallback((modalName: keyof ModalState) => {
    const setterMap = {
      showAddItem: setShowAddItem,
      showMaterials: setShowMaterials,
      showPrepaymentModal: setShowPrepaymentModal,
      showPrintingCalculator: setShowPrintingCalculator,
      showFilesModal: setShowFilesModal,
      showPrepaymentDetailsModal: setShowPrepaymentDetailsModal,
      showOrderPool: setShowOrderPool,
      showUserOrderPage: setShowUserOrderPage,
      showCountersPage: setShowCountersPage,
      showPageSwitcher: setShowPageSwitcher,
      showTopPicker: setShowTopPicker,
      showProductSelector: setShowProductSelector,
      showProductCalculator: setShowProductCalculator,
      orderManagementTab: setOrderManagementTab,
    };
    
    const setter = setterMap[modalName];
    if (setter && typeof setter === 'function') {
      setter(false as any);
    }
  }, []);

  const closeAllModals = useCallback(() => {
    setShowAddItem(false);
    setShowMaterials(false);
    setShowPrepaymentModal(false);
    setShowPrintingCalculator(false);
    setShowFilesModal(false);
    setShowPrepaymentDetailsModal(false);
    setShowOrderPool(false);
    setShowUserOrderPage(false);
    setShowCountersPage(false);
    setShowPageSwitcher(false);
    setShowTopPicker(false);
    setShowProductSelector(false);
    setShowProductCalculator(false);
  }, []);

  return {
    // Состояния
    showAddItem,
    showMaterials,
    showPrepaymentModal,
    showPrintingCalculator,
    showFilesModal,
    showPrepaymentDetailsModal,
    showOrderPool,
    showUserOrderPage,
    showCountersPage,
    showPageSwitcher,
    showTopPicker,
    showProductSelector,
    showProductCalculator,
    orderManagementTab,
    
    // Сеттеры
    setShowAddItem,
    setShowMaterials,
    setShowPrepaymentModal,
    setShowPrintingCalculator,
    setShowFilesModal,
    setShowPrepaymentDetailsModal,
    setShowOrderPool,
    setShowUserOrderPage,
    setShowCountersPage,
    setShowPageSwitcher,
    setShowTopPicker,
    setShowProductSelector,
    setShowProductCalculator,
    setOrderManagementTab,
    
    // Удобные методы
    openModal,
    closeModal,
    closeAllModals,
  };
}
