import { hoursText } from '../../export/itinerary'
import { distanceKm } from '../../geo'
import { compassDirection, formatDistance, type Position } from '../../location'
import { StopCard, type Stop } from './StopCard'

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
  hereIndex,
  date,
  travelers,
  position,
  error,
  radius,
}: {
  stops: Stop[]
  focus: Stop
  onFocus: (placeId: string) => void
  here?: Stop
  /** Only while following. */
  nearest?: Stop
  hereIndex: number
  date: string
  travelers: number
  position: Position | null
  error: string
  radius: number
}) {
  const index = stops.indexOf(focus)
  const kicker = focus === here ? undefined : focus === nearest ? 'Nearest' : `Place ${focus.number} of ${stops.length}`
  return (
    <div className="logbook-columns">
      <section className="card logbook-day">
        <p className="logbook-kicker">
          The day · {stops.length} {stops.length === 1 ? 'place' : 'places'}
        </p>
        <ol className="logbook-list logbook-rows">
          {stops.map((stop, i) => {
            const m = position ? distanceKm(position, stop.place) * 1000 : null
            const hours = hoursText(stop.place, date)
            return (
              <li key={stop.place.id} className={[stop === here ? 'here' : i < hereIndex ? 'visited' : '', stop === focus ? 'focus' : ''].join(' ')}>
                <button type="button" aria-current={stop === focus} onClick={() => onFocus(stop.place.id)}>
                  <span className="logbook-number">{stop.number}</span>
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
              </li>
            )
          })}
        </ol>
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
      </div>
    </div>
  )
}
