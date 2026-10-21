import { useEffect, useRef } from 'react'
import { dateParts } from '../dates'
import type { Day } from '../db/model'
import { href } from '../router'

/** Sticky row of all the trip's days, to jump between them without going back. */
export function DayStrip({ tripId, days, currentId }: { tripId: string; days: Day[]; currentId: string }) {
  const current = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    // Center the current day horizontally (scrollIntoView could also scroll the page).
    const chip = current.current
    const strip = chip?.parentElement
    if (chip && strip) strip.scrollLeft = chip.offsetLeft - strip.clientWidth / 2 + chip.clientWidth / 2
  }, [currentId])

  return (
    <nav className="day-strip" aria-label="Days">
      {days.map((day, i) => {
        const { weekday, day: dayOfMonth } = dateParts(day.date)
        const active = day.id === currentId
        return (
          <a
            key={day.id}
            ref={active ? current : undefined}
            className={`day-chip${active ? ' active' : ''}${day.placeIds.length ? '' : ' empty'}`}
            href={href({ page: 'day', tripId, dayId: day.id })}
            aria-current={active ? 'page' : undefined}
            title={day.title || undefined}
          >
            <span className="day-chip-number">D{i + 1}</span>
            <span className="day-chip-date">
              {weekday} {dayOfMonth}
            </span>
          </a>
        )
      })}
    </nav>
  )
}
