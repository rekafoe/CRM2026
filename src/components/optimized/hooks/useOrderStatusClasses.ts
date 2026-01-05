import { useMemo } from 'react';

interface StatusInfo {
  name: string;
  color?: string;
}

/**
 * Хук для определения CSS классов статуса заказа
 */
export const useOrderStatusClasses = (statusInfo: StatusInfo | undefined, status: number) => {
  return useMemo(() => {
    // Определяем класс статуса на основе названия
    const statusName = statusInfo?.name?.toLowerCase() || '';
    
    let statusClass = '';
    if (statusName.includes('ожидан') || statusName.includes('pending')) {
      statusClass = 'pending';
    } else if (statusName.includes('рабо') || statusName.includes('progress')) {
      statusClass = 'in-progress';
    } else if (statusName.includes('заверш') || statusName.includes('completed')) {
      statusClass = 'completed';
    } else if (statusName.includes('отмен') || statusName.includes('cancelled')) {
      statusClass = 'cancelled';
    }

    return {
      pillClass: statusClass ? `status-pill--${statusClass}` : '',
      barClass: statusClass ? `status-bar__fill--${statusClass}` : '',
      color: statusInfo?.color || '#1976d2'
    };
  }, [statusInfo, status]);
};
