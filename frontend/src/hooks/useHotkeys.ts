import { useEffect } from 'react';

interface HotkeyConfig {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  callback: () => void;
  description?: string;
}

/**
 * Хук для обработки горячих клавиш
 * 
 * @example
 * useHotkeys([
 *   { key: 'n', ctrl: true, callback: () => createNewOrder(), description: 'Новый заказ' },
 *   { key: 'k', ctrl: true, callback: () => openCalculator(), description: 'Открыть калькулятор' }
 * ]);
 */
export function useHotkeys(hotkeys: HotkeyConfig[], enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      for (const hotkey of hotkeys) {
        const matchesKey = event.key.toLowerCase() === hotkey.key.toLowerCase();
        const matchesCtrl = hotkey.ctrl ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey;
        const matchesAlt = hotkey.alt ? event.altKey : !event.altKey;
        const matchesShift = hotkey.shift ? event.shiftKey : !event.shiftKey;

        if (matchesKey && matchesCtrl && matchesAlt && matchesShift) {
          event.preventDefault();
          hotkey.callback();
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [hotkeys, enabled]);
}

/**
 * Предустановленные горячие клавиши для CRM
 */
export const CRM_HOTKEYS = {
  NEW_ORDER: { key: 'n', ctrl: true, description: 'Создать новый заказ' },
  OPEN_CALCULATOR: { key: 'k', ctrl: true, description: 'Открыть калькулятор' },
  SEARCH: { key: 'f', ctrl: true, description: 'Поиск' },
  MATERIALS: { key: 'm', ctrl: true, description: 'Материалы' },
  SAVE: { key: 's', ctrl: true, description: 'Сохранить' },
  CANCEL: { key: 'Escape', description: 'Отмена/Закрыть' },
  REFRESH: { key: 'r', ctrl: true, description: 'Обновить данные' },
};

export default useHotkeys;
