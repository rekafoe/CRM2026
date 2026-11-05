import { useEffect } from 'react'
import { applyCrmAppearance, currentAppearanceUserId, readCrmAppearance } from './useCrmAppearance'

/**
 * Системная тёмная тема больше не включается сама.
 * Оформление задаёт useCrmAppearance: Светлая, Пудра, Deep Ink.
 */
export const useTheme = () => {
  useEffect(() => {
    applyCrmAppearance(readCrmAppearance(currentAppearanceUserId()))
  }, [])

  return {
    theme: 'light' as const,
    toggleTheme: () => {
      applyCrmAppearance(readCrmAppearance(currentAppearanceUserId()))
    },
    isDark: false,
    isLight: true,
  }
}
