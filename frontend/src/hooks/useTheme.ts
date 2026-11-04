import { useEffect } from 'react'
import { applyCrmAppearance } from './useCrmAppearance'

/**
 * Системная тёмная тема больше не включается сама.
 * Оформление CRM задаёт useCrmAppearance: на этом этапе доступна только светлая тема.
 */
export const useTheme = () => {
  useEffect(() => {
    applyCrmAppearance()
  }, [])

  return {
    theme: 'light' as const,
    toggleTheme: () => {
      applyCrmAppearance()
    },
    isDark: false,
    isLight: true,
  }
}
