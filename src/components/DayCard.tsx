import type { Budget } from '../budget'
import { dateParts } from '../dates'
import type { Day, Journey, Place, Trip } from '../db/model'
import { journeyTitle } from '../planning/journeys'
import { formatDuration } from '../format'
import { href } from '../router'
import { MoneyTotals } from './BudgetView'
import { CityTag } from './TripLayout'

interface Props {
  trip: Trip
  day: Day
  number: number
  /** "Osaka", "Osaka → Okinawa" or "". */
  city: string
  /** Booked journeys leaving that day (flight, shinkansen…). */
  journeys: Journey[]
  /** The day's places in visiting order. */
  places: Place[]
  /** Minutes of travel between the places (from the legs' segments). */
  travelMinutes: number
  budget: Budget | undefined
}

/** One day in the trip overview: calendar badge, title, route at a glance, totals. */
export function DayCard({ trip, day, number, city, journeys, places, travelMinutes, budget }: Props) {
  const { weekday, day: dayOfMonth, month } = dateParts(day.date)
  const outside = day.date < trip.startDate || day.date > trip.endDate
  const shown = places.slice(0, 4)
  const hasCosts = budget && Object.keys(budget.total).length > 0

  return (
    <a className={`day-card${places.length === 0 ? ' empty' : ''}`} href={href({ page: 'day', tripId: trip.id, dayId: day.id })}>
      <span className="date-badge" aria-hidden="true">
        <span className="date-badge-weekday">{weekday}</span>
        <span className="date-badge-day">{dayOfMonth}</span>
        <span className="date-badge-month">{month}</span>
      </span>
      <span className="day-card-body">
        <span className="day-card-kicker">
          Day {number}
          {city && <CityTag city={city} />}
          {outside && <span className="tag">outside trip dates</span>}
        </span>
        {journeys.map((j, i) => (
          <span key={i} className="day-card-journey small">
            {journeyTitle(j)}
            {j.time && <span className="muted"> · {j.time}</span>}
          </span>
        ))}
        {/* Without a title, the route itself is the title. */}
        {day.title ? (
          <span className="day-card-title">{day.title}</span>
        ) : (
          places.length === 0 && <span className="day-card-title">Free day</span>
        )}
        {places.length > 0 ? (
          <span className={day.title ? 'day-card-route' : 'day-card-route day-card-title'}>
            {shown.map((p) => p.name).join(' → ')}
            {places.length > shown.length && ` +${places.length - shown.length}`}
          </span>
        ) : (
          <span className="day-card-route muted">Nothing planned yet</span>
        )}
        {(places.length > 0 || hasCosts) && (
          <span className="day-card-stats">
            {places.length > 0 && (
              <span>
                {places.length} {places.length === 1 ? 'place' : 'places'}
              </span>
            )}
            {travelMinutes > 0 && <span>{formatDuration(travelMinutes)} travel</span>}
            {hasCosts && <MoneyTotals totals={budget.total} trip={trip} />}
          </span>
        )}
      </span>
    </a>
  )
}
