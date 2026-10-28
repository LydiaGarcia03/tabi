import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

/**
 * An "i" that explains something without taking room: with a mouse the text
 * shows on hover only (a click does nothing). On a phone (no hover) a tap on
 * the "i" shows the text as a line under the row it sits in (a floating bubble
 * would run off a narrow screen) and another tap, or one elsewhere, hides it.
 * lign="end": the bubble opens leftwards, for an "i" at the end of a line (it ran past the screen's edge).
 */
export function InfoTip({ label, align = 'start', children }: { label: string; align?: 'start' | 'end'; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  return (
    <span ref={ref} className={`info-tip${align === 'end' ? ' end' : ''}${open ? ' open' : ''}`}>
      <button
        type="button"
        className="info-tip-button"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => {
          if (matchMedia('(hover: none)').matches) setOpen(!open)
        }}
      >
        <Icon name="info" size={16} />
      </button>
      <span id={id} role="tooltip" className="info-tip-text small">
        {children}
      </span>
    </span>
  )
}
