import { useEffect, useRef, useState } from 'react'
import { CATEGORIES, CATEGORY_ICON, CATEGORY_LABEL } from '../budget'
import type { ExpenseCategory } from '../db/model'
import { Icon } from './Icon'

/**
 * A budget category dropdown with each category's icon in its color (a native <select> can only hold text).
 * Keyboard: ↑ ↓ to move, Enter to pick, Esc to close; a click elsewhere closes it.
 */
export function CategorySelect({ value, onChange, id }: { value: ExpenseCategory; onChange: (category: ExpenseCategory) => void; id?: string }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(value)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const pick = (category: ExpenseCategory) => {
    onChange(category)
    setOpen(false)
  }

  return (
    <div
      className="category-select"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.preventDefault()
          setOpen(false)
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          if (!open) {
            setActive(value)
            setOpen(true)
            return
          }
          const i = CATEGORIES.indexOf(active) + (e.key === 'ArrowDown' ? 1 : -1)
          setActive(CATEGORIES[Math.min(CATEGORIES.length - 1, Math.max(0, i))])
        } else if (e.key === 'Enter' && open) {
          e.preventDefault()
          pick(active)
        }
      }}
    >
      <button
        type="button"
        id={id}
        className="category-select-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setActive(value)
          setOpen(!open)
        }}
      >
        <span className="category-select-icon" style={{ ['--cat' as string]: `var(--cat-${value})` }}>
          <Icon name={CATEGORY_ICON[value]} size={18} />
        </span>
        <span className="category-select-label">{CATEGORY_LABEL[value]}</span>
        <Icon name={open ? 'up' : 'down'} size={16} />
      </button>
      {open && (
        <ul className="category-select-list" role="listbox">
          {CATEGORIES.map((c) => (
            <li
              key={c}
              role="option"
              aria-selected={c === value}
              className={c === active ? 'active' : undefined}
              onPointerEnter={() => setActive(c)}
              onClick={() => pick(c)}
            >
              <span className="category-select-icon" style={{ ['--cat' as string]: `var(--cat-${c})` }}>
                <Icon name={CATEGORY_ICON[c]} size={18} />
              </span>
              {CATEGORY_LABEL[c]}
              {c === value && <Icon name="check" size={16} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
