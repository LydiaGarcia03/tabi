import { useRef, useState, type KeyboardEvent } from 'react'
import { Icon } from '../Icon'
import { useDismiss } from '../../useDismiss'

/**
 * The option form's City field: typed freely (a city not in the trip yet is fine), with our own list of the
 * trip's cities under it and a chevron saying it's a dropdown (Chrome's datalist looked like the browser's autofill).
 * Keyboard: ↑ ↓ to move, Enter to pick, Esc to close.
 */
export function CityInput({ value, cities, onChange }: { value: string; cities: string[]; onChange: (city: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  // Typing filters the list; opening it shows every city.
  const [filter, setFilter] = useState('')
  const [active, setActive] = useState(-1)
  const root = useRef<HTMLSpanElement>(null)

  useDismiss(root, expanded, setExpanded)

  const query = filter.trim().toLowerCase()
  const shown = query ? cities.filter((c) => c.toLowerCase().includes(query)) : cities

  const open = () => {
    setFilter('')
    setActive(cities.findIndex((c) => c.toLowerCase() === value.trim().toLowerCase()))
    setExpanded(true)
  }
  const pick = (city: string) => {
    onChange(city)
    setExpanded(false)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && expanded) {
      // Only the list closes, not the sheet around it.
      e.preventDefault()
      e.stopPropagation()
      setExpanded(false)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!expanded) return open()
      setActive((i) => Math.min(shown.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1))))
    } else if (e.key === 'Enter' && expanded && shown[active]) {
      e.preventDefault()
      pick(shown[active])
    }
  }

  return (
    <span ref={root} className="city-input">
      <input
        value={value}
        autoComplete="off"
        placeholder="Osaka"
        role="combobox"
        aria-expanded={expanded && shown.length > 0}
        aria-autocomplete="list"
        onFocus={open}
        onClick={() => !expanded && open()}
        onChange={(e) => {
          onChange(e.target.value)
          setFilter(e.target.value)
          setActive(-1)
          setExpanded(true)
        }}
        onKeyDown={onKeyDown}
      />
      {/* The chevron says it's a dropdown; a tap on it opens or closes the list. */}
      <button
        type="button"
        className="city-input-toggle"
        tabIndex={-1}
        aria-label={expanded ? 'Close the list' : 'Show the cities'}
        onPointerDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.preventDefault()
          if (expanded) setExpanded(false)
          else open()
        }}
      >
        <Icon name={expanded ? 'up' : 'down'} size={18} />
      </button>
      {expanded && shown.length > 0 && (
        <ul className="option-select-list city-filter-list" role="listbox" aria-label="City">
          {shown.map((city, i) => (
            <li
              key={city}
              role="option"
              aria-selected={city.toLowerCase() === value.trim().toLowerCase()}
              className={`option-select-item${i === active ? ' active' : ''}`}
              onPointerEnter={() => setActive(i)}
              // Keeps the focus in the field, so the list doesn't reopen.
              onPointerDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault()
                pick(city)
              }}
            >
              <span className="option-select-name">{city}</span>
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}
