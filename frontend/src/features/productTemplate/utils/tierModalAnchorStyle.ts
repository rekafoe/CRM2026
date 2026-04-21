import type { CSSProperties } from 'react'

const MARGIN = 8
/** Согласовано с .simplified-tier-modal (max-width ~260px) + запас */
const POPUP_W = 280
const POPUP_H = 200

/**
 * Позиция попапа «диапазон» у якоря в координатах viewport.
 * Используйте только с position: fixed (не absolute — getBoundingClientRect относится к окну).
 */
export function getTierModalAnchorStyle(anchor: HTMLElement): CSSProperties {
  return getTierModalAnchorStyleFromRect(anchor.getBoundingClientRect())
}

export function getTierModalAnchorStyleFromRect(rect: DOMRectReadOnly): CSSProperties {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768

  let left = rect.left
  let top = rect.bottom + 5

  if (left + POPUP_W > vw - MARGIN) {
    left = Math.max(MARGIN, rect.right - POPUP_W)
  }
  if (left < MARGIN) left = MARGIN
  if (left + POPUP_W > vw - MARGIN) {
    left = Math.max(MARGIN, vw - MARGIN - POPUP_W)
  }

  if (top + POPUP_H > vh - MARGIN) {
    top = Math.max(MARGIN, rect.top - POPUP_H - 5)
  }

  return {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    transform: 'none',
    zIndex: 2003,
  }
}
