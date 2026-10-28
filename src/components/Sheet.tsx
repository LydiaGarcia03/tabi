import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'

/**
 * A form on its own layer above the page: full screen on phones (like an
 * Android "new item" screen), a centered panel on computers. Back/Esc closes it.
 * `bottom`: on phones a short panel rising from the bottom instead (a handle, the title, no ✕; a tap above it
 * closes it), for a few settings (the Logbook's, User's mock A).
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
      <header className="sheet-bar">
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
