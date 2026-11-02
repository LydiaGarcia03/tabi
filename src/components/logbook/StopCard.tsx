import { useContext, useEffect, useState } from 'react'
import { DriverCardContext } from '../../places/localNames'
import { floorJapanese, floorLabel, floorWay } from '../../places/floors'
import { placeCost } from '../../budget'
import { formatMoney } from '../../format'
import { DEFAULT_VISIT_MINUTES, formatMinutes, toMinutes } from '../../planning/hours'
import type { RouteStop } from '../../db/baseStops'
import type { Leg, Place } from '../../db/model'
import { baseIcon } from '../../db/stays'
import { Icon } from '../Icon'
import { Sheet } from '../Sheet'
import { useFromOption } from '../../places/useFromOption'
import { DriverCardButton } from '../DriverCard'
import { PlaceDetailsSheet } from './PlaceDetails'
import { hoursText, segmentText } from '../../export/itinerary'
import { distanceKm } from '../../geo'
import { bearing, compassDirection, formatDistance, useHeading, type Position } from '../../location'

/** A place of the chosen day, with what comes next. */
export interface Stop {
  place: Place
  number: number
  next?: RouteStop
  leg?: Leg
}

/** The GPS precision ("GPS ±8 m", crosshair green / amber), or what is wrong; a tap explains it. */
export function GpsStatus({ position, error, radius }: { position: Position | null; error: string; radius: number }) {
  // Re-render every few seconds so a stale position shows.
  const [now, setNow] = useState(() => Date.now())
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(id)
  }, [])
  if (error) return <span className="warning small">{error}</span>
  if (!position) return <span className="muted small">Looking for your position…</span>
  const age = Math.max(0, Math.round((now - position.time) / 1000))
  const metres = Math.round(position.accuracy)
  const tooRough = position.accuracy > radius
  const stale = age > 30
  return (
    <>
      <button
        type="button"
        // Red when rougher than the arrival distance (arrivals may be missed: User, 2026-11-01); amber when only stale.
        className={`logbook-gps small${tooRough ? ' bad' : stale ? ' rough' : ''}${stale ? ' stale' : ''}`}
        aria-label={`GPS precision ±${metres} m: what is this?`}
        onClick={() => setOpen(true)}
      >
        <span className="logbook-gps-dot" aria-hidden="true" />
        <span className="logbook-gps-label">GPS</span> ±{metres} m
      </button>
      {open && (
        <Sheet title="GPS precision" bottom onClose={() => setOpen(false)}>
          <div className="gps-help">
            <p>
              Your position is somewhere within <strong>{metres} m</strong> of where the phone puts you. GPS works without
              internet.
            </p>
            <p className={tooRough ? 'bad' : stale ? 'rough' : 'good'}>
              {stale
                ? `Not updated for ${age} s.`
                : tooRough
                  ? `Rougher than your arrival distance (${radius} m): arrivals may be missed.`
                  : 'Precise enough.'}
            </p>
            <p className="field-label">If it's rough</p>
            <ul>
              <li>Go outdoors, away from tall buildings; indoors and underground GPS barely works.</li>
              <li>Wait a minute: in airplane mode the phone takes longer to find the satellites.</li>
              <li>Check that Chrome has precise location: Android Settings → Apps → Chrome → Permissions → Location → Use precise location.</li>
            </ul>
            <p className="field-label">If the compass arrow points the wrong way</p>
            <p>Move the phone in a figure 8 a few times, away from magnets (magnetic cases, car mounts, laptops).</p>
          </div>
        </Sheet>
      )}
    </>
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
  onShowWay,
  passing,
}: {
  /** Guiding in order: you're at a later place of the day (one line says so, with a tap to open it). */
  passing?: { stop: Stop; onOpen: () => void }
  stop: Stop
  date: string
  travelers: number
  position: Position | null
  error: string
  radius: number
  here?: boolean
  /** Replaces "Nearest" ("Next · 2 of 10"; wide screens: "Place 2 of 10"). */
  kicker?: string
  /** Wide screens: ‹ › to the place before / after. */
  onPrev?: () => void
  onNext?: () => void
  /** Show the way to the next place (default: only where you are). */
  withNext?: boolean
  /** Phones: "Show the way on the map" (to this place, or to the next one once you're here). */
  onShowWay?: () => void
}) {
  const m = position ? distanceKm(position, stop.place) * 1000 : null
  // With the phone's compass the dial turns so N is real north and the arrow points at the place in front of you;
  // without one (PCs) it stays a map-like dial, north up.
  // Always, also where you are (User, 2026-10-28): inside a 150 m arrival distance the entrance can still be anywhere.
  const heading = useHeading(m != null) ?? 0
  return (
    // "here": a green border that pulses like the GPS dot while you're at the place (User's choice A, 2026-11-01).
    <section className={`card logbook-stop${here ? ' here' : ''}`}>
      <div className="logbook-stop-head">
        <p className="logbook-kicker">
          {here && <Icon name="pin" size={13} />} {here ? "You're at" : (kicker ?? 'Nearest')}
        </p>
        <span className="logbook-stop-tools">
          {position || error ? <GpsStatus position={position} error={error} radius={radius} /> : null}
          <DriverCardButton place={stop.place} />
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
      {m == null ? (
        <StopTitle stop={stop} />
      ) : (
        <div className="logbook-nearest">
          <span className="logbook-compass" aria-hidden="true">
            <span className="logbook-compass-dial" style={{ transform: `rotate(${-heading}deg)` }}>
              <small>N</small>
            </span>
            <span style={{ transform: `rotate(${bearing(position!, stop.place) - heading - 90}deg)` }}>
              <Icon name="arrow" size={24} />
            </span>
          </span>
          <span className="logbook-nearest-text">
            <StopTitle stop={stop} />
            <span className="small muted">
              {formatDistance(m)} {compassDirection(position!, stop.place)}
              {here ? ' · within your arrival distance' : ` · about ${Math.max(1, Math.round((m / 1000 / 4.5) * 60))} min on foot`}
            </span>
          </span>
        </div>
      )}
      {stop.place.inside && <InsideLine place={stop.place} />}
      {passing && (
        <p className="logbook-passing small">
          <Icon name="pin" size={14} />
          <span>
            You're at{' '}
            <strong>
              {passing.stop.number} {passing.stop.place.name}
            </strong>{' '}
            (later in the day) ·{' '}
            <button type="button" className="link" onClick={passing.onOpen}>
              Open it
            </button>
          </span>
        </p>
      )}
      {onShowWay && (
        <button type="button" className="link logbook-show-way" onClick={onShowWay}>
          <Icon name="map" size={16} /> Show map
        </button>
      )}
      <StopDetails stop={stop} date={date} travelers={travelers} withNext={withNext} />
    </section>
  )
}
/**
 * Where it is inside its building (User's choice 2B, made smaller, 2026-11-01): "Go up to 9F 9階 · Daimaru, North
 * wing", the way under it. Japanese floor names only on Japan trips. Arriving under it changes nothing else: this
 * line under the name is the reminder (User, 2026-11-01; an "In the building · not there yet" state was dropped).
 */
function InsideLine({ place }: { place: Place }) {
  const { countries } = useContext(DriverCardContext)
  const inside = place.inside!
  const label = floorLabel(inside.floor)
  const ja = countries.includes('JP') ? floorJapanese(inside.floor) : undefined
  const way = floorWay(inside.floor)
  return (
    <div className="logbook-inside small">
      <Icon name="layers" size={16} />
      <span>
        {way === 'up' ? 'Go up to ' : way === 'down' ? 'Go down to ' : 'Floor '}
        <strong>{label}</strong>
        {ja && <span className="muted"> {ja}</span>}
        {inside.building && ` · ${inside.building}`}
        {inside.way && <span className="logbook-inside-way muted">{inside.way}</span>}
      </span>
    </div>
  )
}

/**
 * The place's number and name; for a place added from an option the whole line opens its details and photos,
 * with a › at the end (User's choice 1A from a mock, 2026-10-28).
 */
function StopTitle({ stop }: { stop: Stop }) {
  const found = useFromOption(stop.place)
  const [open, setOpen] = useState(false)
  const name = (
    <>
      <span className="logbook-number">
        <span>{stop.number}</span>
      </span> {stop.place.name}
    </>
  )
  if (!found) return <h2 className="logbook-stop-title">{name}</h2>
  return (
    <>
      <h2 className="logbook-stop-title">
        <button type="button" className="logbook-title-button" onClick={() => setOpen(true)} aria-label={`Details and photos of ${stop.place.name}`}>
          {name}
          <Icon name="forward" size={18} />
        </button>
      </h2>
      {open && <PlaceDetailsSheet place={stop.place} found={found} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Everything useful on the spot: time, hours, cost, notes, and (unless withNext is false) the way to the next place. */
export function StopDetails({ stop, date, travelers, withNext = true }: { stop: Stop; date: string; travelers: number; withNext?: boolean }) {
  const { place, next, leg } = stop
  // "Arrive at 09:00 until 09:45 · Open 09:00–17:00 · ¥1,000" (User, 2026-11-01): the cost as the total only.
  const until = place.plannedTime && formatMinutes(toMinutes(place.plannedTime) + (place.visitMinutes ?? DEFAULT_VISIT_MINUTES))
  const cost = placeCost(place, travelers)
  const facts = [
    place.plannedTime && `Arrive at ${place.plannedTime} until ${until}`,
    hoursText(place, date),
    cost && formatMoney(cost),
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
