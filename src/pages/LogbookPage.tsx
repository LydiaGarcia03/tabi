import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { describePlaceCost, travelersOf } from '../budget'
import { CityTag, TripLayout } from '../components/TripLayout'
import { formatDay, today } from '../dates'
import { db } from '../db/db'
import { legKey } from '../db/legs'
import type { Day, Leg, Place } from '../db/model'
import { cityLabel } from '../db/stays'
import { hoursText, segmentText } from '../export/itinerary'
import { distanceKm } from '../geo'
import { compassDirection, formatDistance, useWakeLock, useWatchPosition, type Position } from '../location'
import { href } from '../router'
import { loadJson, saveJson } from '../settings'
import { NotFound } from './TripPage'

const SETTINGS_KEY = 'tabi.logbook'
const RADII = [50, 100, 150, 300, 500]

interface LogbookSettings {
  /** "Arrived" when this close to a place, in metres. */
  radius: number
  keepScreenOn: boolean
}

const DEFAULTS: LogbookSettings = { radius: 150, keepScreenOn: true }

/** A place of the chosen day, with what comes next. */
interface Stop {
  place: Place
  number: number
  next?: Place
  leg?: Leg
}

/**
 * During the trip: follows the phone's position (works offline: GPS needs no
 * internet) and, near a place of the day, shows its notes and how to get to
 * the next one. Only while the app is open.
 */
export function LogbookPage({ tripId }: { tripId: string }) {
  const trip = useLiveQuery(async () => (await db.trips.get(tripId)) ?? null, [tripId])
  const days = useLiveQuery(() => db.days.where('tripId').equals(tripId).sortBy('date'), [tripId])
  const stays = useLiveQuery(() => db.stays.where('tripId').equals(tripId).toArray(), [tripId])
  const places = useLiveQuery(() => db.places.where('tripId').equals(tripId).toArray(), [tripId])
  const legs = useLiveQuery(() => db.legs.where('tripId').equals(tripId).toArray(), [tripId])

  const [chosenDayId, setChosenDayId] = useState<string | null>(null)
  const [tracking, setTracking] = useState(false)
  const [settings, setSettingsState] = useState<LogbookSettings>(() => ({ ...DEFAULTS, ...loadJson<LogbookSettings>(SETTINGS_KEY) }))
  const setSettings = (changes: Partial<LogbookSettings>) => {
    const next = { ...settings, ...changes }
    setSettingsState(next)
    saveJson(SETTINGS_KEY, next)
  }

  const { position, error } = useWatchPosition(tracking)
  useWakeLock(tracking && settings.keepScreenOn)

  // Today when the trip is on, otherwise the first day with places.
  const day: Day | undefined =
    days?.find((d) => d.id === chosenDayId) ??
    days?.find((d) => d.date === today()) ??
    days?.find((d) => d.placeIds.length > 0) ??
    days?.[0]

  const stops = useMemo<Stop[]>(() => {
    if (!day || !places || !legs) return []
    const byId = new Map(places.map((p) => [p.id, p]))
    const legByKey = new Map(legs.map((l) => [legKey(l.fromPlaceId, l.toPlaceId), l]))
    const ordered = day.placeIds.map((id) => byId.get(id)).filter((p): p is Place => !!p)
    return ordered.map((place, i) => {
      const next = ordered[i + 1]
      return { place, number: i + 1, next, leg: next && legByKey.get(legKey(place.id, next.id)) }
    })
  }, [day, places, legs])

  const metres = (place: Place) => (position ? distanceKm(position, place) * 1000 : null)
  const sorted = position ? [...stops].sort((a, b) => metres(a.place)! - metres(b.place)!) : []
  const nearest = sorted[0]
  const here = nearest && metres(nearest.place)! <= settings.radius ? nearest : undefined

  useArrivalBuzz(here?.place.id)

  if (trip === undefined || !days || !stays || !places || !legs) return null
  if (!trip) return <NotFound />

  return (
    <TripLayout trip={trip} active="logbook">
      <header className="hero">
        <p className="hero-kicker trip-kicker">{trip.name}</p>
        <h1>Logbook</h1>
      </header>
      <p className="muted small logbook-intro">
        Follows where you are (GPS works without internet) and opens the notes of the place you're arriving at. Keep the
        app open: it can't follow you in the background.
      </p>

      <section className="card logbook-controls">
        <label>
          Day
          <select value={day?.id ?? ''} onChange={(e) => setChosenDayId(e.target.value)}>
            {days.map((d, i) => (
              <option key={d.id} value={d.id}>
                Day {i + 1} · {formatDay(d.date)}
                {cityLabel(stays, d.date) ? ` · ${cityLabel(stays, d.date)}` : ''}
                {d.date === today() ? ' (today)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="row wrap">
          <button type="button" className={tracking ? '' : 'primary'} onClick={() => setTracking(!tracking)}>
            {tracking ? '⏹ Stop following me' : '📍 Follow my location'}
          </button>
          <label>
            Arrived within
            <select value={settings.radius} onChange={(e) => setSettings({ radius: Number(e.target.value) })}>
              {RADII.map((r) => (
                <option key={r} value={r}>
                  {r} m
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.keepScreenOn} onChange={(e) => setSettings({ keepScreenOn: e.target.checked })} />
            Keep the screen on
          </label>
        </div>
        {tracking && <GpsStatus position={position} error={error} radius={settings.radius} />}
      </section>

      {stops.length === 0 ? (
        <section className="empty-state">
          <p>No places on this day.</p>
          <p className="muted small">Add them on the day's page, then come back here during the trip.</p>
        </section>
      ) : (
        <>
          {here ? (
            <StopCard stop={here} date={day!.date} travelers={travelersOf(trip)} position={position} title="📍 You're at" highlight />
          ) : (
            nearest && (
              <StopCard stop={nearest} date={day!.date} travelers={travelersOf(trip)} position={position} title="Nearest place" />
            )
          )}

          <section className="card">
            <h2>
              {day && stays && cityLabel(stays, day.date) && <CityTag city={cityLabel(stays, day.date)} />} The day's places
            </h2>
            <ol className="logbook-list">
              {stops.map((stop) => {
                const m = metres(stop.place)
                return (
                  <li key={stop.place.id} className={stop === here ? 'here' : ''}>
                    <details open={stop === here}>
                      <summary>
                        <span className="logbook-number">{stop.number}</span>
                        <span className="logbook-name">{stop.place.name}</span>
                        <span className="muted small">
                          {[stop.place.plannedTime, m != null && `${formatDistance(m)} ${compassDirection(position!, stop.place)}`]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </summary>
                      <StopDetails stop={stop} date={day!.date} travelers={travelersOf(trip)} />
                    </details>
                  </li>
                )
              })}
            </ol>
          </section>
        </>
      )}
      <p className="muted small">
        Want a map without internet too? On a day's page, switch to <strong>Offline map</strong> and download it for the
        trip (with internet, before you go).{' '}
        <a href={href({ page: 'trip', tripId })}>Go to the itinerary</a>
      </p>
    </TripLayout>
  )
}

function GpsStatus({ position, error, radius }: { position: Position | null; error: string; radius: number }) {
  // Re-render every few seconds so "updated … ago" stays true.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(id)
  }, [])
  if (error) return <p className="warning small">{error}</p>
  if (!position) return <p className="muted small">Looking for your position…</p>
  const age = Math.max(0, Math.round((now - position.time) / 1000))
  return (
    <p className="muted small">
      GPS ±{Math.round(position.accuracy)} m · updated {age < 10 ? 'just now' : `${age} s ago`}
      {position.accuracy > radius && <span className="warning"> · less precise than the arrival distance: arrivals may be late or early</span>}
    </p>
  )
}

function StopCard({
  stop,
  date,
  travelers,
  position,
  title,
  highlight,
}: {
  stop: Stop
  date: string
  travelers: number
  position: Position | null
  title: string
  highlight?: boolean
}) {
  const m = position ? distanceKm(position, stop.place) * 1000 : null
  return (
    <section className={`card logbook-stop${highlight ? ' here' : ''}`}>
      <p className="hero-kicker">{title}</p>
      <h2>
        <span className="logbook-number">{stop.number}</span> {stop.place.name}
      </h2>
      {m != null && !highlight && (
        <p className="small">
          {formatDistance(m)} {compassDirection(position!, stop.place)} · about {Math.max(1, Math.round((m / 1000 / 4.5) * 60))} min on foot
        </p>
      )}
      <StopDetails stop={stop} date={date} travelers={travelers} />
    </section>
  )
}

/** Everything useful on the spot: time, hours, cost, notes, and the way to the next place. */
function StopDetails({ stop, date, travelers }: { stop: Stop; date: string; travelers: number }) {
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
      {next && (
        <div className="logbook-next small">
          <strong>Next: {next.name}</strong>
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

/** A short vibration when arriving at a place (once per arrival). */
function useArrivalBuzz(placeId: string | undefined) {
  const last = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (placeId && placeId !== last.current) navigator.vibrate?.([200, 100, 200])
    last.current = placeId
  }, [placeId])
}
