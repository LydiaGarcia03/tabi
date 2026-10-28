import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useCityHue } from '../cityColors'
import { dateParts, formatDay } from '../dates'
import type { Day, Stay } from '../db/model'
import { dayCity } from '../db/stays'
import { Icon } from './Icon'
import { useDismiss } from '../useDismiss'

const NO_CITY = 'No city'

/** The city's color (the first one on a travel or day-trip day, like `CityTag`). */
export function CityDot({ city }: { city: string }) {
  const hue = useCityHue(city.split(/ → | · /)[0])
  return <span className="city-dot" style={{ ['--hue' as string]: hue }} />
}

/**
 * A dropdown of the trip's days (a native <select> can only hold text): closed it reads "Day 1 · Osaka";
 * open, the days are grouped by city (`city`'s first), each with its date and how many places it has.
 * Keyboard: ↑ ↓ to move, Enter to pick, Esc to close.
 */
export function DaySelect({
  days,
  stays,
  city,
  value,
  onChange,
  detailed,
}: {
  /** The trip's days in date order. */
  days: Day[]
  stays: Stay[]
  /** The city to list first (the option's). */
  city?: string
  value: string
  onChange: (dayId: string) => void
  /** Closed, show the date as a badge and "date · title · N places" under the day (the Logbook on wide screens). */
  detailed?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)

  // One group per city (a day trip in between doesn't split it); the groups of `city` first, the rest by first day.
  const byLabel = new Map<string, { label: string; days: { day: Day; number: number }[] }>()
  days.forEach((day, i) => {
    const label = dayCity(stays, day.date) || NO_CITY
    if (!byLabel.has(label)) byLabel.set(label, { label, days: [] })
    byLabel.get(label)!.days.push({ day, number: i + 1 })
  })
  const groups = [...byLabel.values()]
  const isFirst = (label: string) => !!city && label.split(/ → | · /).some((c) => c.trim().toLowerCase() === city.trim().toLowerCase())
  const sorted = [...groups.filter((g) => isFirst(g.label)), ...groups.filter((g) => !isFirst(g.label))]
  const ordered = sorted.flatMap((g) => g.days.map((d) => d.day))
  const selectedIndex = days.findIndex((d) => d.id === value)
  const selected = days[selectedIndex]

  // A tap anywhere else closes the list.
  useDismiss(root, expanded, setExpanded)

  // Keep the highlighted row in view (also the chosen one when the list opens).
  useEffect(() => {
    if (expanded && active) list.current?.querySelector(`[data-id="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [expanded, active])

  const show = () => {
    setActive(selected?.id ?? ordered[0]?.id ?? null)
    setExpanded(true)
  }
  const pick = (id: string) => {
    onChange(id)
    setExpanded(false)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && expanded) {
      e.preventDefault()
      setExpanded(false)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!expanded) return show()
      const i = ordered.findIndex((d) => d.id === active)
      const next = ordered[Math.min(ordered.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))]
      if (next) setActive(next.id)
    } else if ((e.key === 'Enter' || e.key === ' ') && expanded) {
      e.preventDefault()
      if (active) pick(active)
    }
  }

  const selectedCity = selected ? dayCity(stays, selected.date) : ''
  return (
    <div className={`option-select day-select${detailed ? ' detailed' : ''}`} ref={root}>
      <button
        type="button"
        className="option-select-button"
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-label="Day"
        aria-activedescendant={expanded && active ? `day-select-${active}` : undefined}
        onClick={() => (expanded ? setExpanded(false) : show())}
        onKeyDown={onKeyDown}
      >
        {detailed && selected ? (
          <span className="day-select-badge" aria-hidden="true">
            <span>{dateParts(selected.date).weekday}</span>
            <strong>{dateParts(selected.date).day}</strong>
          </span>
        ) : (
          <Icon name="calendar" size={18} />
        )}
        {selected && detailed ? (
          <span className="day-select-detail">
            <span className="option-select-name">
              Day {selectedIndex + 1}
              {selectedCity && (
                <span className="day-select-city">
                  {' · '}
                  <CityDot city={selectedCity} /> {selectedCity}
                </span>
              )}
            </span>
            <span className="muted small option-select-name">
              {[formatDay(selected.date), selected.title, `${selected.placeIds.length} ${selected.placeIds.length === 1 ? 'place' : 'places'}`]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
        ) : selected ? (
          <span className="option-select-name">
            Day {selectedIndex + 1}
            {selectedCity && (
              <span className="day-select-city">
                {' · '}
                <CityDot city={selectedCity} /> {selectedCity}
              </span>
            )}
          </span>
        ) : (
          <span className="option-select-name muted">Pick a day…</span>
        )}
        <Icon name={expanded ? 'up' : 'down'} size={18} />
      </button>
      {expanded && (
        <ul className="option-select-list" role="listbox" ref={list}>
          {sorted.map((group) => (
            <li key={group.label} role="presentation">
              <span className="option-select-city">
                {group.label !== NO_CITY && <CityDot city={group.label} />} {group.label}
              </span>
              <ul role="group" aria-label={group.label}>
                {group.days.map(({ day, number }) => {
                  const { weekday, day: dayOfMonth } = dateParts(day.date)
                  const places = day.placeIds.length
                  return (
                    <li
                      key={day.id}
                      id={`day-select-${day.id}`}
                      data-id={day.id}
                      role="option"
                      aria-selected={day.id === value}
                      className={`option-select-item${day.id === active ? ' active' : ''}`}
                      onPointerEnter={() => setActive(day.id)}
                      onClick={() => pick(day.id)}
                    >
                      <span className="day-select-badge" aria-hidden="true">
                        <span>{weekday}</span>
                        <strong>{dayOfMonth}</strong>
                      </span>
                      <span className="option-select-text">
                        <span className="option-select-name">Day {number}</span>
                        {day.title && <span className="muted small option-select-name">{day.title}</span>}
                      </span>
                      <span className="muted small day-select-count">
                        {places === 0 ? 'empty' : places === 1 ? '1 place' : `${places} places`}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
