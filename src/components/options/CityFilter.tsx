import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Icon } from '../Icon'
import { CityDot } from '../DaySelect'
import { useCityHue } from '../../cityColors'

/**
 * The city filter, styled like the kinds bar next to it; in the city's color once one is chosen.
 * Keyboard: ↑ ↓ to move, Enter to pick, Esc to close.
 */
export function CityFilter({ city, cities, onChange }: { city: string; cities: string[]; onChange: (city: string) => void }) {
  // Inside TripLayout, so the hue is the city's tag color.
  const hue = useCityHue(city)
  const [expanded, setExpanded] = useState(false)
  const [active, setActive] = useState(city)
  const root = useRef<HTMLSpanElement>(null)
  const values = ['', ...cities]

  // A tap anywhere else closes the list.
  useEffect(() => {
    if (!expanded) return
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setExpanded(false)
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [expanded])

  const show = () => {
    setActive(city)
    setExpanded(true)
  }
  const pick = (value: string) => {
    onChange(value)
    setExpanded(false)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && expanded) {
      e.preventDefault()
      setExpanded(false)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!expanded) return show()
      const i = values.indexOf(active)
      setActive(values[Math.min(values.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))])
    } else if ((e.key === 'Enter' || e.key === ' ') && expanded) {
      e.preventDefault()
      pick(active)
    }
  }

  // Our own list (Chrome's native one can't be styled): "All cities", then each city with its color.
  return (
    <span ref={root} className={`city-filter${city ? ' chosen' : ''}`} style={city ? { ['--hue' as string]: hue } : undefined}>
      <button
        type="button"
        className="city-filter-button"
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-label="City"
        onClick={() => (expanded ? setExpanded(false) : show())}
        onKeyDown={onKeyDown}
      >
        <Icon name="pin" size={16} />
        <span className="city-filter-name">{city || 'All cities'}</span>
        <Icon name={expanded ? 'up' : 'down'} size={18} />
      </button>
      {expanded && (
        <ul className="option-select-list city-filter-list" role="listbox" aria-label="City">
          {values.map((value) => (
            <li
              key={value || 'all'}
              role="option"
              aria-selected={value === city}
              className={`option-select-item${value === active ? ' active' : ''}`}
              onPointerEnter={() => setActive(value)}
              onClick={() => pick(value)}
            >
              {value ? <CityDot city={value} /> : <Icon name="pin" size={16} />}
              <span className="option-select-name">{value || 'All cities'}</span>
              {value === city && <Icon name="check" size={16} />}
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}
