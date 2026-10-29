import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { travelersOf } from '../budget'
import { TripLayout } from '../components/TripLayout'
import { today } from '../dates'
import { dayRoute, type RouteStop } from '../db/baseStops'
import { db } from '../db/db'
import { legKey } from '../db/legs'
import type { Day, Place } from '../db/model'
import { staysOn } from '../db/stays'
import { updatePlace } from '../db/trips'
import { DaySelect } from '../components/DaySelect'
import { Icon } from '../components/Icon'
import { InfoTip } from '../components/InfoTip'
import { Sheet } from '../components/Sheet'
import { useMediaQuery } from '../useMediaQuery'
import { WIDE } from '../breakpoints'
import { distanceKm } from '../geo'
import { compassDirection, formatDistance, useWakeLock, useWatchPosition } from '../location'
import { href } from '../router'
import { loadJson, saveJson } from '../settings'
import { DayPicker } from '../components/logbook/DayPicker'
import { GpsStatus, StopCard, StopDetails, type Stop } from '../components/logbook/StopCard'
import { OfflineMapWarning } from '../components/logbook/OfflineMapWarning'
import { PlaceThumb } from '../components/logbook/PlaceDetails'
import { SwipeRow } from '../components/logbook/SwipeRow'
import { WayMap, type Way } from '../components/logbook/WayMap'
import { WideDay } from '../components/logbook/WideDay'
import { NotFound } from './TripPage'

const SETTINGS_KEY = 'tabi.logbook'
const SWIPE_LEARNED_KEY = 'tabi.logbookSwiped'
const RADII = [50, 100, 150, 300, 500]

interface LogbookSettings {
  /** "Arrived" when this close to a place, in metres. */
  radius: number
  keepScreenOn: boolean
}

const DEFAULTS: LogbookSettings = { radius: 150, keepScreenOn: true }


/**
 * During the trip: follows the phone's position (works offline: GPS needs no
 * internet) and, near a place of the day, shows its notes and how to get to
 * the next one. Only while the app is open.
 */
export function LogbookPage({ tripId, hasGoogleKey }: { tripId: string; hasGoogleKey: boolean }) {
  const trip = useLiveQuery(async () => (await db.trips.get(tripId)) ?? null, [tripId])
  const days = useLiveQuery(() => db.days.where('tripId').equals(tripId).sortBy('date'), [tripId])
  const stays = useLiveQuery(() => db.stays.where('tripId').equals(tripId).toArray(), [tripId])
  const places = useLiveQuery(() => db.places.where('tripId').equals(tripId).toArray(), [tripId])
  const legs = useLiveQuery(() => db.legs.where('tripId').equals(tripId).toArray(), [tripId])

  const [chosenDayId, setChosenDayId] = useState<string | null>(null)
  const [tracking, setTracking] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showWay, setShowWay] = useState(false)
  // The swipe hint shows until the first swipe.
  const [swipeLearned, setSwipeLearned] = useState(() => !!loadJson<boolean>(SWIPE_LEARNED_KEY))
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

  const { stops, ordered, route, legByKey } = useMemo(() => {
    const legByKey = new Map((legs ?? []).map((l) => [legKey(l.fromPlaceId, l.toPlaceId), l]))
    if (!day || !places) return { stops: [] as Stop[], ordered: [] as Place[], route: [] as RouteStop[], legByKey }
    const byId = new Map(places.map((p) => [p.id, p]))
    const ordered = day.placeIds.map((id) => byId.get(id)).filter((p): p is Place => !!p)
    // "Next" can be going back to the hotel (a base stop of the day).
    const route = dayRoute(day, ordered)
    const stops: Stop[] = ordered.map((place, i) => {
      const next = route[route.indexOf(place) + 1]
      return { place, number: i + 1, next, leg: next && legByKey.get(legKey(place.id, next.id)) }
    })
    return { stops, ordered, route, legByKey }
  }, [day, places, legs])

  const metres = (place: Place) => (position ? distanceKm(position, place) * 1000 : null)
  // Places ticked as visited are skipped: two places close together no longer fight over "You're at".
  const sorted = position ? stops.filter((s) => !s.place.visited).sort((a, b) => metres(a.place)! - metres(b.place)!) : []
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
  const visitedCount = stops.filter((s) => s.place.visited).length
  const toggleVisited = (place: Place) => {
    void updatePlace(place.id, { visited: place.visited ? undefined : true })
    if (!swipeLearned) {
      setSwipeLearned(true)
      saveJson(SWIPE_LEARNED_KEY, true)
    }
  }

  // The way on the map: to the next stop once you're at a place, else from the stop before it to this place.
  const wayOf = (stop: Stop, isHere: boolean): Way | undefined => {
    if (isHere) return stop.next && { from: stop.place, to: stop.next }
    const i = route.findIndex((p) => p.id === stop.place.id)
    return { from: i > 0 ? route[i - 1] : undefined, to: stop.place }
  }
  const bases = staysOn(stays, day?.date ?? '').flatMap((s) => (s.base ? [{ ...s.base, city: s.city }] : []))
  const wayMap = (way: Way, withSteps?: boolean) => (
    <WayMap
      tripId={tripId}
      hasGoogleKey={hasGoogleKey}
      way={way}
      places={ordered}
      route={route}
      legs={legByKey}
      bases={bases}
      position={position}
      withSteps={withSteps}
    />
  )
  const card = here ?? nearest
  const cardWay = card && wayOf(card, card === here)
  const wideFocus = stops.find((s) => s.place.id === focusId) ?? here ?? nearest ?? stops[0]
  const wideWay = wideFocus && wayOf(wideFocus, wideFocus === here)

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

      {!wide && <OfflineMapWarning tripId={tripId} />}

      {stops.length === 0 ? (
        <section className="empty-state">
          <p>No places on this day.</p>
          <p className="muted small">Add them on the day's page, then come back here during the trip.</p>
        </section>
      ) : wide ? (
        <WideDay
          stops={stops}
          focus={wideFocus}
          wayMap={wideWay && wayMap(wideWay)}
          onFocus={setFocusId}
          here={here}
          nearest={tracking ? nearest : undefined}
          onToggleVisited={toggleVisited}
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
                <p className="logbook-kicker">{position && !error ? 'All visited' : 'Finding you'}</p>
                <GpsStatus position={position} error={error} radius={settings.radius} />
              </div>
              {position && !error && <p className="small muted">Every place of this day is ticked as visited. Swipe one again to untick it.</p>}
            </section>
          )}
          {card && (
            <StopCard
              stop={card}
              date={day!.date}
              travelers={travelers}
              position={position}
              error={error}
              radius={settings.radius}
              here={card === here}
              onShowWay={cardWay ? () => setShowWay(true) : undefined}
            />
          )}
          {!tracking && <p className="muted small logbook-hint">Tap Follow: the place you're at opens with its notes and the way to the next one.</p>}

          <section className="card logbook-day">
            <p className="logbook-kicker">
              The day{visitedCount > 0 && ` · ${visitedCount} of ${stops.length} visited`}
            </p>
            <ol className="logbook-list">
              {stops.map((stop) => {
                const m = metres(stop.place)
                return (
                  <SwipeRow
                    key={stop.place.id}
                    visited={!!stop.place.visited}
                    onToggle={() => toggleVisited(stop.place)}
                    className={stop === here ? 'here' : stop.place.visited ? 'visited' : ''}
                  >
                    <details>
                      <summary>
                        <span className="logbook-number">{stop.place.visited ? <Icon name="check" size={14} /> : stop.number}</span>
                        <PlaceThumb place={stop.place} />
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
                  </SwipeRow>
                )
              })}
            </ol>
            {!swipeLearned && <p className="muted small logbook-swipe-hint">Swipe a place to the right when you've visited it (again to untick).</p>}
          </section>
        </>
      )}

      {showWay && cardWay && (
        <Sheet title="The way there" onClose={() => setShowWay(false)}>
          {wayMap(cardWay, true)}
        </Sheet>
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

/** A short vibration when arriving at a place (once per arrival). */
function useArrivalBuzz(placeId: string | undefined) {
  const last = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (placeId && placeId !== last.current) navigator.vibrate?.([200, 100, 200])
    last.current = placeId
  }, [placeId])
}
