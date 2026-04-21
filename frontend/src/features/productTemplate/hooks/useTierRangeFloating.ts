import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/react'
import { useMemo } from 'react'
import type { CSSProperties, MutableRefObject, RefObject } from 'react'

/** Слой поверх карточек админки / оверлеев */
export const TIER_RANGE_POPOVER_Z_INDEX = 10050

/**
 * Позиционирование попапа «диапазон» у якоря (flip/shift, автообновление при scroll/resize).
 * Ренерьте floating в портале в document.body.
 */
export function useTierRangeFloating(
  anchorElement: HTMLElement | null,
  enabled: boolean
): {
  floatingStyles: CSSProperties | null
  setFloating: (node: HTMLElement | null) => void
} {
  const { refs, floatingStyles } = useFloating({
    placement: 'bottom-start',
    middleware: [
      offset(5),
      flip({ fallbackPlacements: ['top-start', 'bottom-end', 'top-end'] }),
      shift({ padding: 8 }),
    ],
    whileElementsMounted: autoUpdate,
    elements: {
      reference: enabled && anchorElement ? anchorElement : null,
    },
  })

  const merged = useMemo((): CSSProperties | null => {
    if (!enabled || !anchorElement) return null
    return {
      ...floatingStyles,
      zIndex: TIER_RANGE_POPOVER_Z_INDEX,
    }
  }, [enabled, anchorElement, floatingStyles])

  return { floatingStyles: merged, setFloating: refs.setFloating }
}

/** Ref колбэк: DOM-узел попапа + регистрация в Floating UI при якоре */
export function tierModalFloatingRef(
  modalRef: RefObject<HTMLDivElement | null> | MutableRefObject<HTMLDivElement | null>,
  setFloating: (node: HTMLElement | null) => void,
  anchorActive: boolean
) {
  return (node: HTMLDivElement | null) => {
    ;(modalRef as MutableRefObject<HTMLDivElement | null>).current = node
    if (anchorActive) {
      setFloating(node)
    }
  }
}
