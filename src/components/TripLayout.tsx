import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, type ReactNode } from 'react'
import { CityColorsContext, cityHueMap, useCityHue } from '../cityColors'
import { dateParts } from '../dates'
import { db } from '../db/db'
import type { Trip } from '../db/model'
import { cityLabel, staysOn } from '../db/stays'
import { useTripHolidays } from '../holidays/holidays'
import { useFillLocalNames } from '../places/fillLocalNames'
import { href } from '../router'
import { useOnline } from '../useOnline'
import { Icon, type IconName } from './Icon'

export type TripSection = 'itinerary' | 'logbook' | 'options' | 'budget'

interface Props {
  trip: Trip
  /** Highlighted section, or the open day. */
  active: TripSection | { dayId: string }
  children: ReactNode
}

const SECTIONS: { id: TripSection; label: string; icon: IconName }[] = [
  { id: 'itinerary', label: 'Itinerary', icon: 'calendar' },
  { id: 'logbook', label: 'Logbook', icon: 'book' },
  { id: 'options', label: 'Options', icon: 'sparkle' },
  { id: 'budget', label: 'Budget', icon: 'wallet' },
]

/**
 * Frame of every trip page: on wide screens a sidebar with the sections and
 * all the days; on phones, a navigation bar at the bottom.
 */
export function TripLayout({ trip, active, children }: Props) {
  const days = useLiveQuery(() => db.days.where('tripId').equals(trip.id).sortBy('date'), [trip.id])
  const stays = useLiveQuery(() => db.stays.where('tripId').equals(trip.id).toArray(), [trip.id])
  const places = useLiveQuery(() => db.places.where('tripId').equals(trip.id).toArray(), [trip.id])
  const online = useOnline()
  const holidays = useTripHolidays(trip, days, places, stays, online)
  // The driver card's local address and name, got ahead for every place (no wait when the card opens).
  useFillLocalNames(trip, places, stays, online)
  // The trip's cities get distinct colors in visiting order.
  const hues = useMemo(() => cityHueMap(stays ?? []), [stays])
  const section = typeof active === 'string' ? active : 'itinerary'
  const dayId = typeof active === 'string' ? null : active.dayId

  const sectionHref = (id: TripSection) =>
    id === 'itinerary' ? href({ page: 'trip', tripId: trip.id }) : href({ page: id, tripId: trip.id })

  return (
    <CityColorsContext.Provider value={hues}>
      <div className="trip-layout">
        <aside className="trip-sidebar">
          <a className="sidebar-back" href={href({ page: 'trips' })}>
            <Icon name="back" size={16} /> All trips
          </a>
          <a className="sidebar-trip" href={href({ page: 'trip', tripId: trip.id })}>
            {trip.name}
          </a>
          <nav className="sidebar-nav" aria-label="Trip sections">
            {SECTIONS.map((s) => (
              <a key={s.id} href={sectionHref(s.id)} className={section === s.id && !dayId ? 'active' : ''}>
                <Icon name={s.icon} /> {s.label}
              </a>
            ))}
          </nav>
          <p className="sidebar-heading">Days</p>
          <ol className="sidebar-days">
            {days?.map((day, i) => {
              const { weekday, day: dom, month } = dateParts(day.date)
              const city = stays ? cityLabel(stays, day.date) : ''
              const firstCity = stays ? staysOn(stays, day.date)[0]?.city : undefined
              return (
                <li key={day.id}>
                  <a
                    href={href({ page: 'day', tripId: trip.id, dayId: day.id })}
                    className={day.id === dayId ? 'active' : ''}
                    title={day.title || undefined}
                  >
                    <span className="sidebar-day-number">D{i + 1}</span>
                    <span className="sidebar-day-text">
                      <span>
                        {weekday} {dom} {month}
                      </span>
                      {city && firstCity && <SidebarCity label={city} city={firstCity} />}
                    </span>
                    {holidays?.byDay.has(day.id) && (
                      <span className="sidebar-day-holiday" title={holidays.byDay.get(day.id)!.map((h) => h.name).join(', ')}>
                        <Icon name="flag" size={12} />
                      </span>
                    )}
                    {day.placeIds.length > 0 && <span className="sidebar-day-count">{day.placeIds.length}</span>}
                  </a>
                </li>
              )
            })}
          </ol>
        </aside>

        <div className="trip-content">{children}</div>

        {/* Phones and tablets: Android-style navigation bar, within thumb reach. */}
        <nav className="bottom-nav" aria-label="Trip sections">
          {SECTIONS.map((s) => (
            <a key={s.id} href={sectionHref(s.id)} className={section === s.id ? 'active' : ''} aria-current={section === s.id ? 'page' : undefined}>
              <span className="bottom-nav-icon">
                <Icon name={s.icon} size={22} />
              </span>
              {s.label}
            </a>
          ))}
        </nav>
      </div>
    </CityColorsContext.Provider>
  )
}

function SidebarCity({ label, city }: { label: string; city: string }) {
  const hue = useCityHue(city)
  return (
    <span className="sidebar-day-city" style={{ ['--hue' as string]: hue }}>
      {label}
    </span>
  )
}

/** Small colored city tag. */
export function CityTag({ city }: { city: string }) {
  // "Osaka → Okinawa" and "Kyoto · day trip" take the first city's color.
  const hue = useCityHue(city.split(/ → | · /)[0])
  return (
    <span className="city-tag" style={{ ['--hue' as string]: hue }}>
      {city}
    </span>
  )
}
