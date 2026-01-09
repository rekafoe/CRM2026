import { useState, useEffect, useRef, useCallback } from 'react';
import { TierRangeModalState } from '../ServiceVariantsTable.types';

/**
 * Хук для управления модальным окном диапазонов
 */
export function useTierModal() {
  const [tierModal, setTierModal] = useState<TierRangeModalState>({
    type: 'add',
    isOpen: false,
    boundary: '',
  });
  const tierModalRef = useRef<HTMLDivElement>(null);
  const addRangeButtonRef = useRef<HTMLButtonElement>(null);

  // Закрытие модалки при клике вне её
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tierModalRef.current && !tierModalRef.current.contains(e.target as Node)) {
        setTierModal({ type: 'add', isOpen: false, boundary: '' });
      }
    };

    if (tierModal.isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [tierModal.isOpen]);

  const openAddModal = useCallback((anchorElement?: HTMLElement) => {
    setTierModal({
      type: 'add',
      isOpen: true,
      boundary: '',
      anchorElement,
    });
  }, []);

  const openEditModal = useCallback((tierIndex: number, boundary: number, anchorElement?: HTMLElement) => {
    setTierModal({
      type: 'edit',
      isOpen: true,
      tierIndex,
      boundary: String(boundary),
      anchorElement,
    });
  }, []);

  const closeModal = useCallback(() => {
    setTierModal({ type: 'add', isOpen: false, boundary: '' });
  }, []);

  return {
    tierModal,
    setTierModal,
    tierModalRef,
    addRangeButtonRef,
    openAddModal,
    openEditModal,
    closeModal,
  };
}
