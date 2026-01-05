import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface UIState {
  // Модальные окна
  isCalculatorOpen: boolean;
  isMaterialManagerOpen: boolean;
  isPresetManagerOpen: boolean;
  isConfigModalOpen: boolean;
  
  // Уведомления
  notifications: Array<{
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
    duration?: number;
  }>;
  
  // Настройки UI
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
  showAdvancedOptions: boolean;
  
  // Действия для модальных окон
  openCalculator: () => void;
  closeCalculator: () => void;
  openMaterialManager: () => void;
  closeMaterialManager: () => void;
  openPresetManager: () => void;
  closePresetManager: () => void;
  openConfigModal: () => void;
  closeConfigModal: () => void;
  
  // Действия для уведомлений
  addNotification: (notification: Omit<UIState['notifications'][0], 'id'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  
  // Действия для настроек
  setTheme: (theme: 'light' | 'dark') => void;
  toggleSidebar: () => void;
  setShowAdvancedOptions: (show: boolean) => void;
}

export const useUIStore = create<UIState>()(
  devtools(
    (set, get) => ({
      // Начальное состояние
      isCalculatorOpen: false,
      isMaterialManagerOpen: false,
      isPresetManagerOpen: false,
      isConfigModalOpen: false,
      notifications: [],
      theme: 'light',
      sidebarCollapsed: false,
      showAdvancedOptions: false,
      
      // Действия для модальных окон
      openCalculator: () => set({ isCalculatorOpen: true }),
      closeCalculator: () => set({ isCalculatorOpen: false }),
      
      openMaterialManager: () => set({ isMaterialManagerOpen: true }),
      closeMaterialManager: () => set({ isMaterialManagerOpen: false }),
      
      openPresetManager: () => set({ isPresetManagerOpen: true }),
      closePresetManager: () => set({ isPresetManagerOpen: false }),
      
      openConfigModal: () => set({ isConfigModalOpen: true }),
      closeConfigModal: () => set({ isConfigModalOpen: false }),
      
      // Действия для уведомлений
      addNotification: (notification) => {
        const id = Math.random().toString(36).substr(2, 9);
        const newNotification = { ...notification, id };
        
        set((state) => ({
          notifications: [...state.notifications, newNotification]
        }));
        
        // Автоматическое удаление уведомления
        const duration = notification.duration || 5000;
        setTimeout(() => {
          get().removeNotification(id);
        }, duration);
      },
      
      removeNotification: (id) => set((state) => ({
        notifications: state.notifications.filter(n => n.id !== id)
      })),
      
      clearNotifications: () => set({ notifications: [] }),
      
      showToast: (message, type) => {
        get().addNotification({ message, type });
      },
      
      // Действия для настроек
      setTheme: (theme) => {
        set({ theme });
        localStorage.setItem('theme', theme);
      },
      
      toggleSidebar: () => set((state) => ({
        sidebarCollapsed: !state.sidebarCollapsed
      })),
      
      setShowAdvancedOptions: (show) => set({ showAdvancedOptions: show })
    }),
    {
      name: 'ui-store',
    }
  )
);
