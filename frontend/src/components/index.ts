/**
 * ЕДИНАЯ ТОЧКА ВХОДА ДЛЯ ВСЕХ КОМПОНЕНТОВ
 * Используйте: import { ComponentName } from '@/components'
 */

// ============================================
// ОБЩИЕ КОМПОНЕНТЫ (Используйте эти!)
// ============================================
export { LoadingState } from './common/LoadingState';
export { ErrorState } from './common/ErrorState';
export { EmptyState } from './common/EmptyState';
export { ImprovedToast, ToastContainer } from './common/ImprovedToast';
export type { ToastType } from './common/ImprovedToast';

// ============================================
// ГЛАВНЫЙ КАЛЬКУЛЯТОР (Используйте этот!)
// ============================================
export { ImprovedPrintingCalculatorModal } from './calculator/ImprovedPrintingCalculatorModal';

// ============================================
// СКЛАДСКИЕ КОМПОНЕНТЫ
// ============================================
export { WarehouseDashboard } from './warehouse/WarehouseDashboard';
export { MaterialsManagement } from './warehouse/MaterialsManagement';
export { MaterialFormModal } from './warehouse/MaterialFormModal';
export { default as MaterialReservations } from './warehouse/MaterialReservations';
export { default as MaterialReservationModal } from './warehouse/MaterialReservationModal';
export { default as MaterialAvailability } from './warehouse/MaterialAvailability';

// ============================================
// УПРАВЛЕНИЕ ЗАКАЗАМИ
// ============================================
export { OrdersManagement } from './orders/OrdersManagement';

