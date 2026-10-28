import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { describePlaceCost, travelersOf } from '../budget'
import { TripLayout } from '../components/TripLayout'
import { formatDay, today } from '../dates'
import { dayRoute, type RouteStop } from '../db/baseStops'
import { db } from '../db/db'
import { legKey } from '../db/legs'
import type { Day, Leg, Place, Stay } from '../db/model'
import { baseIcon, cityLabel } from '../db/stays'
import { DaySelect } from '../components/DaySelect'
import { Icon } from '../components/Icon'
import { InfoTip } from '../components/InfoTip'
import { Sheet } from '../components/Sheet'
import { useMediaQuery } from '../useMediaQuery'
import { WIDE } from '../breakpoints'
import { hoursText, segmentText } from '../export/itinerary'
import { distanceKm } from '../geo'
import { bearing, compassDirection, formatDistance, useWakeLock, useWatchPosition, type Position } from '../location'
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
  next?: RouteStop
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
  const [showSettings, setShowSettings] = useState(false)
  // Wide screens (User's choice A from a mock, 2026-10-27): the day on the left, one place in focus on the right.
  const wide = useMediaQuery(WIDE)
  const [chosenFocus, setChosenFocus] = useState<{ placeId: string; key: string } | null>(null)
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
    // "Next" can be going back to the hotel (a base stop of the day).
    const route = dayRoute(day, ordered)
    return ordered.map((place, i) => {
      const next = route[route.indexOf(place) + 1]
      return { place, number: i + 1, next, leg: next && legByKey.get(legKey(place.id, next.id)) }
    })
  }, [day, places, legs])

  const metres = (place: Place) => (position ? distanceKm(position, place) * 1000 : null)
  const sorted = position ? [...stops].sort((a, b) => metres(a.place)! - metres(b.place)!) : []
  const nearest = sorted[0]
  const here = nearest && metres(nearest.place)! <= settings.radius ? nearest : undefined

  useArrivalBuzz(here?.place.id)
  // A place clicked stays in focus until you arrive somewhere else or change day (then that place is in focus).
  const focusKey = `${day?.id}|${here?.place.id ?? ''}`
  const focusId = chosenFocus?.key === focusKey ? chosenFocus.placeId : null
  const setFocusId = (placeId: string) => setChosenFocus({ placeId, key: focusKey })

  if (trip === undefined || !days || !stays || !places || !legs) return null
  if (!trip) return <NotFound />

  const travelers = travelersOf(trip)
  // Places before the one you're at count as visited (shown muted).
  const hereIndex = here ? stops.indexOf(here) : -1

  return (
    <TripLayout trip={trip} active="logbook">
      {/* Phones: no title (the bottom bar says where you are), like Options and Budget. */}
      <header className="hero logbook-hero">
        <p className="hero-kicker trip-kicker">{trip.name}</p>
        <h1>Logbook</h1>
      </header>

      {/* One line (User's choice A from a mock, 2026-10-27): the day, Follow, and the settings — in a sheet on
          phones, on the line itself on wide screens, where the day gets the richer dropdown. */}
      <div className="logbook-bar">
        {wide ? (
          <DaySelect days={days} stays={stays} value={day?.id ?? ''} onChange={setChosenDayId} detailed />
        ) : (
          <DayPicker days={days} stays={stays} value={day?.id ?? ''} onChange={setChosenDayId} />
        )}
        <button
          type="button"
          className={tracking ? 'logbook-follow on' : 'primary logbook-follow'}
          aria-pressed={tracking}
          title={tracking ? 'Stop following me' : 'Follow my location'}
          onClick={() => setTracking(!tracking)}
        >
          <Icon name="locate" size={16} /> {tracking ? (wide ? 'Following' : 'On') : 'Follow'}
        </button>
        {wide ? (
          <span className="logbook-inline-settings">
            <span className="small muted">Arrived within</span>
            <span className="segmented logbook-radius" role="radiogroup" aria-label="Arrival distance">
              {RADII.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={settings.radius === r}
                  className={settings.radius === r ? 'active' : ''}
                  onClick={() => setSettings({ radius: r })}
                >
                  {r} m
                </button>
              ))}
            </span>
            <label className="check small">
              <input
                type="checkbox"
                role="switch"
                className="toggle"
                checked={settings.keepScreenOn}
                onChange={(e) => setSettings({ keepScreenOn: e.target.checked })}
              />
              Screen on
            </label>
            <InfoTip label="About the logbook" align="end">
              GPS works without internet; keep the app open: it can't follow you in the background. For a map without internet,
              download the offline map on a day's page.
            </InfoTip>
          </span>
        ) : (
          <button type="button" className="icon-button" aria-label="Logbook settings" title="Logbook settings" onClick={() => setShowSettings(true)}>
            <Icon name="settings" size={18} />
          </button>
        )}
      </div>

      {stops.length === 0 ? (
        <section className="empty-state">
          <p>No places on this day.</p>
          <p className="muted small">Add them on the day's page, then come back here during the trip.</p>
        </section>
      ) : wide ? (
        <WideDay
          stops={stops}
          focus={stops.find((s) => s.place.id === focusId) ?? here ?? nearest ?? stops[0]}
          onFocus={setFocusId}
          here={here}
          nearest={tracking ? nearest : undefined}
          hereIndex={hereIndex}
          date={day!.date}
          travelers={travelers}
          position={position}
          error={error}
          radius={settings.radius}
        />
      ) : (
        <>
          {tracking && !nearest && (
            <section className="card logbook-stop">
              <div className="logbook-stop-head">
                <p className="logbook-kicker">Finding you</p>
                <GpsStatus position={position} error={error} radius={settings.radius} />
              </div>
            </section>
          )}
          {here ? (
            <StopCard stop={here} date={day!.date} travelers={travelers} position={position} error={error} radius={settings.radius} here />
          ) : (
            nearest && <StopCard stop={nearest} date={day!.date} travelers={travelers} position={position} error={error} radius={settings.radius} />
          )}
          {!tracking && <p className="muted small logbook-hint">Tap Follow: the place you're at opens with its notes and the way to the next one.</p>}

          <section className="card logbook-day">
            <p className="logbook-kicker">The day</p>
            <ol className="logbook-list">
              {stops.map((stop, i) => {
                const m = metres(stop.place)
                return (
                  <li key={stop.place.id} className={stop === here ? 'here' : i < hereIndex ? 'visited' : ''}>
                    <details>
                      <summary>
                        <span className="logbook-number">{stop.number}</span>
                        <span className="logbook-name">
                          <span>{stop.place.name}</span>
                          {stop.place.plannedTime && <span className="muted small">{stop.place.plannedTime}</span>}
                        </span>
                        {m != null && (
                          <span className="logbook-distance">
                            {formatDistance(m)} {m >= settings.radius && compassDirection(position!, stop.place)}
                          </span>
                        )}
                      </summary>
                      <StopDetails stop={stop} date={day!.date} travelers={travelers} />
                    </details>
                  </li>
                )
              })}
            </ol>
          </section>
        </>
      )}

      {showSettings && (
        <Sheet title="Logbook settings" bottom onClose={() => setShowSettings(false)}>
          <div className="logbook-settings">
            <div>
              <p className="field-label">Arrived when closer than</p>
              <div className="segmented logbook-radius" role="radiogroup" aria-label="Arrival distance">
                {RADII.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={settings.radius === r}
                    className={settings.radius === r ? 'active' : ''}
                    onClick={() => setSettings({ radius: r })}
                  >
                    {r} m
                  </button>
                ))}
              </div>
            </div>
            <label className="check">
              <input type="checkbox" checked={settings.keepScreenOn} onChange={(e) => setSettings({ keepScreenOn: e.target.checked })} />
              Keep the screen on while following
            </label>
            <a className="logbook-offline" href={href({ page: 'trip', tripId })}>
              <Icon name="map" size={18} />
              <span>
                <strong>Offline map</strong>
                <span className="muted small">On a day's page, switch to Offline map and download it (with internet, before you go).</span>
              </span>
              <Icon name="forward" size={16} />
            </a>
            <p className="muted small logbook-about">
              <Icon name="info" size={14} /> GPS works without internet. Keep the app open: it can't follow you in the background.
            </p>
          </div>
        </Sheet>
      )}
    </TripLayout>
  )
}

/**
 * The day, as a short dropdown (User's choice B from a mock, 2026-10-27; the line has little room): closed
 * "Day 3 · ● Kyoto"; open, one line per day (day, date, city, "today") as wide as the whole line. Esc or a tap
 * elsewhere closes it.
 */
function DayPicker({ days, stays, value, onChange }: { days: Day[]; stays: Stay[]; value: string; onChange: (dayId: string) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const index = days.findIndex((d) => d.id === value)
  const city = (date: string) => cityLabel(stays, date).replace(' · day trip', '')
  const now = today()

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
    return () => document.removeEventListener('pointerdown', onDown)
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

/**
 * Wide screens: the day as a list on the left (time, hours that day, distance while following; a click puts a
 * place in focus) and the place in focus on the right, sticky, with ‹ › to the one before / after.
 */
function WideDay({
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

/** A green dot with the GPS accuracy ("±8 m"), or what is wrong. */
function GpsStatus({ position, error, radius }: { position: Position | null; error: string; radius: number }) {
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
function StopCard({
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
function StopDetails({ stop, date, travelers, withNext = true }: { stop: Stop; date: string; travelers: number; withNext?: boolean }) {
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

/** A short vibration when arriving at a place (once per arrival). */
function useArrivalBuzz(placeId: string | undefined) {
  const last = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (placeId && placeId !== last.current) navigator.vibrate?.([200, 100, 200])
    last.current = placeId
  }, [placeId])
}
