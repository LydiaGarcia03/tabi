import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'

/**
 * A form on its own layer above the page: full screen on phones (like an
 * Android "new item" screen), a centered panel on computers. Back/Esc closes it.
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
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
      className="sheet"
      aria-label={title}
      tabIndex={-1}
      onCancel={(e) => {
        // Esc: let the parent decide (it unmounts the sheet).
        e.preventDefault()
        onClose()
      }}
    >
      <header className="sheet-bar">
        <button type="button" className="ghost icon-button" onClick={onClose} aria-label="Close">
          <Icon name="close" size={20} />
        </button>
        <h2>{title}</h2>
      </header>
      <div className="sheet-body">{children}</div>
    </dialog>
  )
}
