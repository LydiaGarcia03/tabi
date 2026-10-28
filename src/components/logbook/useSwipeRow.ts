import { useRef, useState, type MouseEvent, type PointerEvent } from 'react'

/** Swipe farther than this (px) to tick / untick. */
const SWIPE = 80
/** How far the row follows the finger. */
const MAX = 120

/**
 * A row swiped to the right (User's choice A from a mock, 2026-10-28: like archiving in Gmail). `dx` is how far it
 * is pulled, to move the row over the colored layer under it; a vertical move is left to the page's scroll
 * (the row has `touch-action: pan-y`), and the tap that ends a swipe doesn't open the row.
 */
export function useSwipeRow(onSwipe: () => void) {
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number } | null>(null)
  const pulled = useRef(0)
  const swiped = useRef(false)

  const end = (apply: boolean) => {
    if (apply && pulled.current > SWIPE) onSwipe()
    start.current = null
    pulled.current = 0
    setDx(0)
  }

  return {
    dx,
    handlers: {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (e.button !== 0) return
        start.current = { x: e.clientX, y: e.clientY }
        swiped.current = false
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        if (!start.current) return
        const x = e.clientX - start.current.x
        const y = Math.abs(e.clientY - start.current.y)
        // Mostly vertical before it started: a scroll, not a swipe.
        if (!swiped.current && y > Math.abs(x)) {
          start.current = null
          return
        }
        if (!swiped.current && x < 10) return
        if (!swiped.current) {
          swiped.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
        }
        pulled.current = Math.max(0, Math.min(x, MAX))
        setDx(pulled.current)
      },
      onPointerUp: () => end(true),
      onPointerCancel: () => end(false),
      onClickCapture: (e: MouseEvent<HTMLElement>) => {
        if (!swiped.current) return
        swiped.current = false
        e.preventDefault()
        e.stopPropagation()
      },
    },
  }
}
