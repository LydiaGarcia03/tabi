import { useId, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { useDismiss } from '../useDismiss'

/**
 * An "i" that explains something without taking room: with a mouse the text
 * shows on hover only (a click does nothing). On a phone (no hover) a tap on
 * the "i" shows the text as a line under the row it sits in (a floating bubble
 * would run off a narrow screen) and another tap, or one elsewhere, hides it.
 * align="end": the bubble opens leftwards, for an "i" at the end of a line (it ran past the screen's edge).
 * The bubble opens upwards when there's no room for it below (User, 2026-11-02: near the bottom of the
 * window it was cut), the room counted inside any box around it that scrolls (a sheet's body).
 */
export function InfoTip({ label, align = 'start', children }: { label: string; align?: 'start' | 'end'; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [up, setUp] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const text = useRef<HTMLSpanElement>(null)
  const id = useId()

  useDismiss(ref, open, setOpen)

  /** Up when the bubble doesn't fit below the "i" and there's more room above. */
  const place = () => {
    const button = ref.current?.getBoundingClientRect()
    const height = text.current?.offsetHeight ?? 0
    if (!button || !height) return
    // The room is the window's, or less inside a box that scrolls or clips (a sheet's body cut the bubble; User,
    // 2026-11-03).
    let top = 0
    let bottom = window.innerHeight
    for (let el = ref.current?.parentElement; el; el = el.parentElement) {
      if (getComputedStyle(el).overflowY === 'visible') continue
      const box = el.getBoundingClientRect()
      top = Math.max(top, box.top)
      bottom = Math.min(bottom, box.bottom)
    }
    const below = bottom - button.bottom
    setUp(height + 12 > below && button.top - top > below)
  }

  return (
    <span
      ref={ref}
      className={`info-tip${align === 'end' ? ' end' : ''}${up ? ' up' : ''}${open ? ' open' : ''}`}
      onMouseEnter={place}
      onFocus={place}
    >
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
      <span ref={text} id={id} role="tooltip" className="info-tip-text small">
        {children}
      </span>
    </span>
  )
}
