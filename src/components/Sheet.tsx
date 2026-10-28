import { useEffect, useRef, type PointerEvent, type ReactNode } from 'react'
import { Icon } from './Icon'

/** Pull a bottom panel down farther than this (px) to close it. */
const PULL_TO_CLOSE = 90

/**
 * A form on its own layer above the page: full screen on phones (like an
 * Android "new item" screen), a centered panel on computers. Back/Esc closes it.
 * `bottom`: on phones a panel rising from the bottom instead (a handle, the title, no ✕; a tap above it or
 * pulling it down by its handle closes it): the Logbook's settings, GPS help and place details.
 */
export function Sheet({ title, onClose, bottom, children }: { title: string; onClose: () => void; bottom?: boolean; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    // Focus the sheet itself: not the close button, and no keyboard popping up on phones.
    element?.focus()
    return () => element?.close()
  }, [])

  // A bottom panel follows the finger down from its handle/title and closes past PULL_TO_CLOSE (User's choice 3B).
  const drag = useRef<number | null>(null)
  const pullDown = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' || !dialog.current) return
      drag.current = e.clientY
      e.currentTarget.setPointerCapture(e.pointerId)
      dialog.current.style.transition = 'none'
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (drag.current == null || !dialog.current) return
      dialog.current.style.transform = `translateY(${Math.max(0, e.clientY - drag.current)}px)`
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => release(e.clientY),
    onPointerCancel: () => release(null),
  }
  const release = (y: number | null) => {
    const element = dialog.current
    if (drag.current == null || !element) return
    const pulled = y == null ? 0 : y - drag.current
    drag.current = null
    if (pulled > PULL_TO_CLOSE) return onClose()
    element.style.transition = 'transform 0.2s ease-out'
    element.style.transform = ''
  }

  return (
    <dialog
      ref={dialog}
      className={`sheet${bottom ? ' bottom' : ''}`}
      aria-label={title}
      tabIndex={-1}
      onCancel={(e) => {
        // Esc: let the parent decide (it unmounts the sheet).
        e.preventDefault()
        onClose()
      }}
      // A tap on the backdrop lands on the dialog itself.
      onClick={bottom ? (e) => e.target === e.currentTarget && onClose() : undefined}
    >
      <header className="sheet-bar" {...(bottom ? pullDown : {})}>
        {bottom && <span className="sheet-handle" aria-hidden="true" />}
        <button type="button" className="ghost icon-button sheet-close" onClick={onClose} aria-label="Close">
          <Icon name="close" size={20} />
        </button>
        <h2>{title}</h2>
      </header>
      <div className="sheet-body">{children}</div>
    </dialog>
  )
}
