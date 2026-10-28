import type { ReactNode } from 'react'
import { hoursText } from '../../export/itinerary'
import { distanceKm } from '../../geo'
import { compassDirection, formatDistance, type Position } from '../../location'
import type { Place } from '../../db/model'
import { Icon } from '../Icon'
import { StopCard, type Stop } from './StopCard'
import { SwipeRow } from './SwipeRow'

/**
 * Wide screens: the day as a list on the left (time, hours that day, distance while following; a click puts a
 * place in focus) and the place in focus on the right, sticky, with ‹ › to the one before / after.
 */
export function WideDay({
  stops,
  focus,
  onFocus,
  here,
  nearest,
  onToggleVisited,
  date,
  travelers,
  position,
  error,
  radius,
  wayMap,
}: {
  /** The map of the way to the place in focus, under its card. */
  wayMap?: ReactNode
  stops: Stop[]
  focus: Stop
  onFocus: (placeId: string) => void
  here?: Stop
  /** Only while following. */
  nearest?: Stop
  /** A row swiped (dragged) to the right: visited / not visited. */
  onToggleVisited: (place: Place) => void
  date: string
  travelers: number
  position: Position | null
  error: string
  radius: number
}) {
  const index = stops.indexOf(focus)
  const visitedCount = stops.filter((s) => s.place.visited).length
  const kicker = focus === here ? undefined : focus === nearest ? 'Nearest' : `Place ${focus.number} of ${stops.length}`
  return (
    <div className="logbook-columns">
      <section className="card logbook-day">
        <p className="logbook-kicker">
          The day · {stops.length} {stops.length === 1 ? 'place' : 'places'}
          {visitedCount > 0 && ` · ${visitedCount} visited`}
        </p>
        <ol className="logbook-list logbook-rows">
          {stops.map((stop) => {
            const m = position ? distanceKm(position, stop.place) * 1000 : null
            const hours = hoursText(stop.place, date)
            return (
              <SwipeRow
                key={stop.place.id}
                visited={!!stop.place.visited}
                onToggle={() => onToggleVisited(stop.place)}
                className={[stop === here ? 'here' : stop.place.visited ? 'visited' : '', stop === focus ? 'focus' : ''].join(' ')}
              >
                <button type="button" aria-current={stop === focus} onClick={() => onFocus(stop.place.id)}>
                  <span className="logbook-number">{stop.place.visited ? <Icon name="check" size={14} /> : stop.number}</span>
                  <span className="logbook-name">
                    <span>{stop.place.name}</span>
                    {(stop.place.plannedTime || hours) && (
                      <span className="muted small">{[stop.place.plannedTime, hours].filter(Boolean).join(' · ')}</span>
                    )}
                  </span>
                  {m != null && (
                    <span className="logbook-distance">
                      {formatDistance(m)} {m >= radius && compassDirection(position!, stop.place)}
                    </span>
                  )}
                </button>
              </SwipeRow>
            )
          })}
        </ol>
        <p className="muted small logbook-swipe-hint">Drag a place to the right when you've visited it (again to untick).</p>
      </section>
      <div className="logbook-focus">
        <StopCard
          stop={focus}
          date={date}
          travelers={travelers}
          position={position}
          error={error}
          radius={radius}
          here={focus === here}
          kicker={kicker}
          onPrev={index > 0 ? () => onFocus(stops[index - 1].place.id) : undefined}
          onNext={index < stops.length - 1 ? () => onFocus(stops[index + 1].place.id) : undefined}
          withNext
        />
        {wayMap}
      </div>
    </div>
  )
}
