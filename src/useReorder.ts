import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'

/** Margin (px) near the top/bottom of the screen where dragging scrolls the page. */
const EDGE = 80
const SLIDE = 'transform 180ms ease'

/**
 * Reorders a list by dragging a handle (finger or mouse, no dependency). The
 * dragged item follows the pointer; it swaps with a neighbour when the pointer
 * passes that neighbour's middle, and the others slide to their new place
 * (FLIP: measure before and after, animate the difference). The new order is
 * saved on release. Arrow keys on a focused handle move by one.
 * Items are found by `data-reorder-id` inside `listRef`.
 */
export function useReorder(ids: string[], onReorder: (ids: string[]) => Promise<void>) {
  const listRef = useRef<HTMLOListElement>(null)
  const [drag, setDrag] = useState<{ id: string; order: string[] } | null>(null)
  // Shown after the drop until the saved order arrives (avoids a flash of the old order).
  const [dropped, setDropped] = useState<{ order: string[]; base: string } | null>(null)
  // Positions before the last change (for the slide), and where the pointer holds the dragged item.
  const before = useRef<Map<string, number> | null>(null)
  const pointer = useRef<{ id: string; y: number; grab: number } | null>(null)

  const items = () =>
    new Map([...(listRef.current?.querySelectorAll<HTMLElement>('[data-reorder-id]') ?? [])].map((el) => [el.dataset.reorderId!, el]))

  /** Remembers where every item is on screen now. */
  const snapshot = () => {
    before.current = new Map([...items()].map(([id, el]) => [id, el.getBoundingClientRect().top]))
  }

  /** Puts the dragged item under the pointer. */
  const follow = () => {
    const p = pointer.current
    const el = p && items().get(p.id)
    if (!p || !el) return
    el.style.transition = 'none'
    el.style.transform = ''
    const natural = el.getBoundingClientRect().top
    el.style.transform = `translateY(${p.y - p.grab - natural}px)`
  }

  // After each change of order: slide every other item from where it was to where it is now.
  useLayoutEffect(() => {
    const previous = before.current
    before.current = null
    const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (previous && animate) {
      for (const [id, el] of items()) {
        const was = previous.get(id)
        if (id === pointer.current?.id || was == null) continue
        el.style.transition = 'none'
        el.style.transform = ''
        const now = el.getBoundingClientRect().top
        if (Math.abs(was - now) < 1) continue
        el.style.transform = `translateY(${was - now}px)`
        void el.offsetHeight // apply the start position before animating
        el.style.transition = SLIDE
        el.style.transform = ''
        el.addEventListener('transitionend', () => (el.style.transition = ''), { once: true })
      }
    }
    follow()
  }, [drag])

  function start(id: string, e: ReactPointerEvent<HTMLElement>) {
    if (e.button !== 0) return
    const el = items().get(id)
    if (!el) return
    e.preventDefault()
    navigator.vibrate?.(10)
    pointer.current = { id, y: e.clientY, grab: e.clientY - el.getBoundingClientRect().top }
    let order = ids
    snapshot() // the legs between items hide while dragging: slide into the closer list
    setDrag({ id, order })

    // Followed on the window, not the handle: React moves the item's element
    // while it is dragged, which would end a pointer capture.
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId || !pointer.current) return
      const y = ev.clientY
      pointer.current.y = y
      const all = items()
      const middleOf = (other: string) => {
        const rect = all.get(other)?.getBoundingClientRect()
        return rect ? rect.top + rect.height / 2 : null
      }
      const from = order.indexOf(id)
      let to = from
      while (to > 0 && y < (middleOf(order[to - 1]) ?? -Infinity)) to--
      if (to === from) while (to < order.length - 1 && y > (middleOf(order[to + 1]) ?? Infinity)) to++
      if (to !== from) {
        order = order.filter((other) => other !== id)
        order.splice(to, 0, id)
        snapshot()
        setDrag({ id, order })
      } else {
        follow()
      }
      if (y < EDGE) window.scrollBy(0, -12)
      else if (y > window.innerHeight - EDGE) window.scrollBy(0, 12)
    }
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      const save = ev.type === 'pointerup' && order.join() !== ids.join()
      pointer.current = null
      snapshot() // the dropped item settles into its place, the legs come back
      if (save) setDropped({ order, base: ids.join() })
      setDrag(null)
      if (save) void onReorder(order)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  function handleProps(id: string) {
    return {
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => start(id, e),
      onKeyDown(e: KeyboardEvent<HTMLElement>) {
        const delta = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
        const from = ids.indexOf(id)
        if (!delta || from + delta < 0 || from + delta >= ids.length) return
        e.preventDefault()
        const next = [...ids]
        ;[next[from], next[from + delta]] = [next[from + delta], next[from]]
        void onReorder(next)
      },
    }
  }

  const order = drag?.order ?? (dropped && dropped.base === ids.join() ? dropped.order : ids)
  return { listRef, draggingId: drag?.id ?? null, order, handleProps }
}
