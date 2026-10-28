import { useEffect, useState } from 'react'
import { describePlaceCost } from '../../budget'
import type { RouteStop } from '../../db/baseStops'
import type { Leg, Place } from '../../db/model'
import { baseIcon } from '../../db/stays'
import { Icon } from '../Icon'
import { hoursText, segmentText } from '../../export/itinerary'
import { distanceKm } from '../../geo'
import { bearing, compassDirection, formatDistance, type Position } from '../../location'

/** A place of the chosen day, with what comes next. */
export interface Stop {
  place: Place
  number: number
  next?: RouteStop
  leg?: Leg
}

/** A green dot with the GPS accuracy ("±8 m"), or what is wrong. */
export function GpsStatus({ position, error, radius }: { position: Position | null; error: string; radius: number }) {
  // Re-render every few seconds so a stale position shows.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(id)
  }, [])
  if (error) return <span className="warning small">{error}</span>
  if (!position) return <span className="muted small">Looking for your position…</span>
  const age = Math.max(0, Math.round((now - position.time) / 1000))
  const rough = position.accuracy > radius
  return (
    <span
      className={`logbook-gps small${rough || age > 30 ? ' rough' : ''}`}
      title={`GPS ±${Math.round(position.accuracy)} m · updated ${age < 10 ? 'just now' : `${age} s ago`}${rough ? ' · less precise than the arrival distance' : ''}`}
    >
      <span className="logbook-gps-dot" aria-hidden="true" />±{Math.round(position.accuracy)} m
    </span>
  )
}

/** The place you're at (its notes and the way to the next one), or the nearest one with a compass arrow. */
export function StopCard({
  stop,
  date,
  travelers,
  position,
  error,
  radius,
  here,
  kicker,
  onPrev,
  onNext,
  withNext = here,
}: {
  stop: Stop
  date: string
  travelers: number
  position: Position | null
  error: string
  radius: number
  here?: boolean
  /** Replaces "Nearest" (wide screens: "Place 2 of 10"). */
  kicker?: string
  /** Wide screens: ‹ › to the place before / after. */
  onPrev?: () => void
  onNext?: () => void
  /** Show the way to the next place (default: only where you are). */
  withNext?: boolean
}) {
  const m = position ? distanceKm(position, stop.place) * 1000 : null
  return (
    <section className={`card logbook-stop${here ? ' here' : ''}`}>
      <div className="logbook-stop-head">
        <p className="logbook-kicker">
          {here && <Icon name="pin" size={13} />} {here ? "You're at" : (kicker ?? 'Nearest')}
        </p>
        <span className="logbook-stop-tools">
          {position || error ? <GpsStatus position={position} error={error} radius={radius} /> : null}
          {(onPrev || onNext) && (
            <>
              <button type="button" className="icon-button logbook-step" aria-label="Previous place" disabled={!onPrev} onClick={onPrev}>
                <Icon name="back" size={16} />
              </button>
              <button type="button" className="icon-button logbook-step" aria-label="Next place" disabled={!onNext} onClick={onNext}>
                <Icon name="forward" size={16} />
              </button>
            </>
          )}
        </span>
      </div>
      {here || m == null ? (
        <h2 className="logbook-stop-title">
          <span className="logbook-number">{stop.number}</span> {stop.place.name}
        </h2>
      ) : (
        <div className="logbook-nearest">
          <span className="logbook-compass" aria-hidden="true">
            <small>N</small>
            <span style={{ transform: `rotate(${bearing(position!, stop.place) - 90}deg)` }}>
              <Icon name="arrow" size={24} />
            </span>
          </span>
          <span>
            <h2 className="logbook-stop-title">
              <span className="logbook-number">{stop.number}</span> {stop.place.name}
            </h2>
            <span className="small muted">
              {formatDistance(m)} {compassDirection(position!, stop.place)} · about {Math.max(1, Math.round((m / 1000 / 4.5) * 60))} min on foot
            </span>
          </span>
        </div>
      )}
      <StopDetails stop={stop} date={date} travelers={travelers} withNext={withNext} />
    </section>
  )
}
/** Everything useful on the spot: time, hours, cost, notes, and (unless withNext is false) the way to the next place. */
export function StopDetails({ stop, date, travelers, withNext = true }: { stop: Stop; date: string; travelers: number; withNext?: boolean }) {
  const { place, next, leg } = stop
  const facts = [
    place.plannedTime && `Arrive at ${place.plannedTime}`,
    hoursText(place, date),
    describePlaceCost(place, travelers),
  ].filter(Boolean)
  return (
    <div className="logbook-details">
      {facts.length > 0 && <p className="small">{facts.join(' · ')}</p>}
      {place.address && <p className="muted small">{place.address}</p>}
      {place.notes.trim() ? <p className="logbook-notes">{place.notes.trim()}</p> : <p className="muted small">No notes.</p>}
      {withNext && next && (
        <div className="logbook-next small">
          <p className="logbook-kicker">
            Next ·{' '}
            {next.baseStop ? (
              <>
                <Icon name={baseIcon(next.baseStop.base)} size={13} /> back to base ({next.name})
              </>
            ) : (
              <>
                {stop.number + 1} {next.name}
                {next.plannedTime && ` · ${next.plannedTime}`}
              </>
            )}
          </p>
          {leg?.segments.length ? (
            <ul>
              {leg.segments.map((s) => (
                <li key={s.id}>{segmentText(s)}</li>
              ))}
            </ul>
          ) : (
            <span className="muted"> — how to get there isn't planned yet</span>
          )}
        </div>
      )}
    </div>
  )
}
