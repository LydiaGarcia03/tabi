import { useEffect, type RefObject } from 'react'

/**
 * Closes a dropdown (or the "i" of an InfoTip) when the pointer goes down anywhere outside `ref` while it is open:
 * `setOpen(false)`. Shared by the app's own dropdowns (days, cities, categories, options).
 */
export function useDismiss(ref: RefObject<Element | null>, open: boolean, setOpen: (open: boolean) => void): void {
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [ref, open, setOpen])
}
