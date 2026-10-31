import type { TripHolidays } from '../holidays/holidays'
import { Icon } from './Icon'

/**
 * The days list's title ("Itinerary") with how many holidays the trip has on the same line, as plain information
 * (User, 2026-10-31: each holiday's name is on its day's page; no list to open).
 */
export function DaysTitle({ holidays }: { holidays: TripHolidays | undefined }) {
  const count = holidays ? [...holidays.byDay.values()].flat().length : 0
  return (
    <div className="days-title">
      <h2 className="section-title">Itinerary</h2>
      {count > 0 && (
        <span className="days-title-holidays small">
          <Icon name="flag" size={14} /> {count} {count === 1 ? 'holiday' : 'holidays'} on this trip
        </span>
      )}
    </div>
  )
}
