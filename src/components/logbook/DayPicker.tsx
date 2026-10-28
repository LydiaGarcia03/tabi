import { useEffect, useRef, useState } from 'react'
import { formatDay, today } from '../../dates'
import type { Day, Stay } from '../../db/model'
import { dayCity } from '../../db/stays'
import { Icon } from '../Icon'
import { useDismiss } from '../../useDismiss'

/**
 * The day, as a short dropdown (User's choice B from a mock, 2026-10-27; the line has little room): closed
 * "Day 3 · ● Kyoto"; open, one line per day (day, date, city, "today") as wide as the whole line. Esc or a tap
 * elsewhere closes it.
 */
export function DayPicker({ days, stays, value, onChange }: { days: Day[]; stays: Stay[]; value: string; onChange: (dayId: string) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const index = days.findIndex((d) => d.id === value)
  const city = (date: string) => dayCity(stays, date)
  const now = today()

  useDismiss(root, open, setOpen)
  // The chosen day in view when the list opens.
  useEffect(() => {
    if (open) list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open])

  const selected = days[index]
  return (
    <div className="logbook-day-picker" ref={root} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <button type="button" className="logbook-day-button" aria-haspopup="listbox" aria-expanded={open} aria-label="Day" onClick={() => setOpen(!open)}>
        <span className="logbook-day-name">
          {selected ? `Day ${index + 1}` : 'Pick a day'}
          {selected && city(selected.date) && (
            <>
              {' · '}
              {city(selected.date)}
            </>
          )}
        </span>
        <Icon name={open ? 'up' : 'down'} size={16} />
      </button>
      {open && (
        <ul className="logbook-day-list" role="listbox" ref={list}>
          {days.map((d, i) => (
            <li
              key={d.id}
              role="option"
              aria-selected={d.id === value}
              tabIndex={0}
              onClick={() => {
                onChange(d.id)
                setOpen(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onChange(d.id)
                  setOpen(false)
                }
              }}
            >
              <strong>Day {i + 1}</strong>
              <span className="muted small logbook-day-where">
                {formatDay(d.date)}
                {city(d.date) && (
                  <>
                    {' · '}
                    {city(d.date)}
                  </>
                )}
              </span>
              {d.date === now ? <span className="logbook-today">today</span> : <span />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
