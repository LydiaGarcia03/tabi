import { useId, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { useDismiss } from '../useDismiss'

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

  useDismiss(ref, open, setOpen)

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
