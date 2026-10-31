import { APILoadingStatus, useApiLoadingStatus, type MapMouseEvent } from '@vis.gl/react-google-maps'
import { useLiveQuery } from 'dexie-react-hooks'
import { Fragment, lazy, Suspense, useMemo, useState } from 'react'
import { dayMoney, itemsBudget, travelersOf, tripStarted } from '../budget'
import { DayMap } from '../components/DayMap'
import { DayMoney } from '../components/DayMoney'
import { ExportCard } from '../components/ExportCard'
import { DrawToolbar } from '../components/DrawToolbar'
import { DayStrip } from '../components/DayStrip'
import { CityTag, TripLayout } from '../components/TripLayout'
import { addBaseStop, baseStopLabel, dayBases, dayRoute, removeBaseStop, setBaseStopStay } from '../db/baseStops'
import { baseIcon, cityLabel, isHotelChange, staysOn } from '../db/stays'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Icon } from '../components/Icon'
import { LegItem } from '../components/LegItem'
import { OptimizePanel } from '../components/OptimizePanel'
import { OptionPicker } from '../components/OptionPicker'
import { PlaceItem } from '../components/PlaceItem'
import { PlaceSearch } from '../components/PlaceSearch'
import { formatDay } from '../dates'
import { db } from '../db/db'
import { dayWalking, legKey, legTimes } from '../db/legs'
import { formatDistance, formatTime } from '../format'
import type { BaseStop, Day, Leg, Place, Stay, Trip } from '../db/model'
import { addPlace, applyDayOrder, orderPlaces, updateDay } from '../db/trips'
import type { Drawing, LegFocus } from '../drawing'
import { dayText, shareText } from '../export/shareText'
import { fetchPlace, type PlaceResult } from '../places/googlePlaces'
import { useRefreshStalePlaces } from '../places/refresh'
import { flightSources } from '../planning/flightSteps'
import { timeConflict } from '../planning/hours'
import { clockTime, sunSlots, sunTimes } from '../planning/sun'
import { utcOffsetAt } from '../data/countries'
import { useClimate } from '../weather/climate'
import { lateRide, type LateRide } from '../planning/lateRide'
import { drawnPath } from '../mapLines'
import { holidayKind, useTripHolidays, type DayHoliday } from '../holidays/holidays'
import { InfoTip } from '../components/InfoTip'
import { dayRides, passCoverage, PassCoverageContext } from '../planning/railPasses'
import { href } from '../router'
import { loadJson, saveJson } from '../settings'
import { useDraft } from '../useDraft'
import { useOnline } from '../useOnline'
import { currencyChoices } from '../money/currencies'
import { useReorder } from '../useReorder'
import { NotFound } from './TripPage'

// MapLibre is big: loaded only when the offline map is used (and precached for offline).
const OfflineMapPanel = lazy(() => import('../components/OfflineMap').then((m) => ({ default: m.OfflineMapPanel })))

type MapProvider = 'google' | 'offline'
const MAP_PROVIDER_KEY = 'tabi.mapProvider'

type PendingAdd =
  | { kind: 'google'; googlePlaceId: string }
  | { kind: 'custom'; lat: number; lng: number; name?: string }

export function DayPage({ tripId, dayId, hasGoogleKey }: { tripId: string; dayId: string; hasGoogleKey: boolean }) {
  // `null` = not found; `undefined` = still loading.
  const day = useLiveQuery(async () => (await db.days.get(dayId)) ?? null, [dayId])
  const days = useLiveQuery(() => db.days.where('tripId').equals(tripId).sortBy('date'), [tripId])
  const dayPlaces = useLiveQuery(() => db.places.where('dayId').equals(dayId).toArray(), [dayId])
  const anyTripPlace = useLiveQuery(() => db.places.where('tripId').equals(tripId).first(), [tripId])
  const tripLegs = useLiveQuery(() => db.legs.where('tripId').equals(tripId).toArray(), [tripId])
  const legs = useMemo(() => new Map((tripLegs ?? []).map((l) => [legKey(l.fromPlaceId, l.toPlaceId), l])), [tripLegs])
  const trip = useLiveQuery(async () => (await db.trips.get(tripId)) ?? null, [tripId])
  const stays = useLiveQuery(() => db.stays.where('tripId').equals(tripId).toArray(), [tripId])
  const dayExpenses = useLiveQuery(() => db.expenses.where('dayId').equals(dayId).toArray(), [dayId])
  // Flights in the itinerary (booked or not): "Use my flight" in the day's legs.
  const tripExpenses = useLiveQuery(() => db.expenses.where('tripId').equals(tripId).toArray(), [tripId])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openLeg, setOpenLeg] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingAdd | null>(null)
  const [drawing, setDrawing] = useState<Drawing | null>(null)
  const [mapOpen, setMapOpen] = useState(true)
  const [optimizing, setOptimizing] = useState(false)
  const [mapProvider, setMapProviderState] = useState<MapProvider>(() => loadJson<MapProvider>(MAP_PROVIDER_KEY) ?? 'google')
  const setMapProvider = (provider: MapProvider) => {
    setMapProviderState(provider)
    saveJson(MAP_PROVIDER_KEY, provider)
  }
  const mapStatus = useApiLoadingStatus()
  const online = useOnline()
  // The day's holidays (regional ones are matched by the addresses of all the trip's places).
  const tripPlaces = useLiveQuery(() => db.places.where('tripId').equals(tripId).toArray(), [tripId])
  const holidays = useTripHolidays(trip, days, tripPlaces, stays, online)
  useRefreshStalePlaces(dayPlaces)
  const { listRef, draggingId, order, handleProps } = useReorder(
    day && dayPlaces ? orderPlaces(day, dayPlaces).map((p) => p.id) : [],
    (ids) => applyDayOrder(dayId, ids),
  )

  if (day === undefined || days === undefined || dayPlaces === undefined || trip === undefined || !dayExpenses) return null
  if (!day || !trip) return <NotFound />

  const places = orderPlaces(day, dayPlaces)
  const travelers = travelersOf(trip)
  // The list follows the drag; the map and everything else keep the saved order until it is dropped.
  const byId = new Map(places.map((p) => [p.id, p]))
  const listed = order.flatMap((id) => byId.get(id) ?? [])
  const conflicts = places.filter((p) => timeConflict(p, day.date)).length
  const index = days.findIndex((d) => d.id === day.id)
  const prev = days[index - 1]
  const next = days[index + 1]

  async function add(place: PlaceResult | { name: string; lat: number; lng: number }) {
    const id = await addPlace(dayId, {
      ...place,
      googleFetchedAt: 'googlePlaceId' in place ? new Date().toISOString() : undefined,
    })
    setSelectedId(id)
  }

  function onMapClick(event: MapMouseEvent) {
    const { placeId, latLng } = event.detail
    if (drawing) {
      // While drawing, every tap (even on a Google place) is a point of the segment.
      if (placeId) event.stop()
      if (latLng) setDrawing({ ...drawing, taps: [...drawing.taps, latLng], snapped: undefined })
      return
    }
    if (placeId) {
      event.stop() // Don't open Google's info window; offer to add it instead.
      setPending({ kind: 'google', googlePlaceId: placeId })
    } else if (latLng) {
      setPending({ kind: 'custom', ...latLng })
    }
  }

  /** A tap on the offline map: a drawing point, or a pin (named after the place tapped, if any). */
  function onOfflineTap(tap: { lat: number; lng: number; name?: string }) {
    if (drawing) setDrawing({ ...drawing, taps: [...drawing.taps, { lat: tap.lat, lng: tap.lng }], snapped: undefined })
    else setPending({ kind: 'custom', ...tap })
  }

  const bases = (stays ? staysOn(stays, day.date) : []).flatMap((s) => (s.base ? [{ ...s.base, city: s.city }] : []))
  // Where the day can leave from (the morning's hotel) and go back to (tonight's), the same but on a travel day.
  const dayBaseStays = stays ? dayBases(stays, day.date) : []
  const morningBase = dayBaseStays[0]
  const nightBase = dayBaseStays.at(-1)
  const route = dayRoute(day, places)
  const listedRoute = dayRoute(day, listed)
  const walking = dayWalking(route, legs)
  // Rides paid by a rail pass in use: struck through in the legs, left out of the day's money.
  const passCovered = tripPlaces ? passCoverage(trip.railPasses, dayRides(days, tripPlaces, legs)).covered : new Map<string, string>()
  // Sun and usual weather where the day is spent: its first place, else its city's base.
  const dayPoint: { lat: number; lng: number } | undefined = places[0] ?? bases[0]
  const sun = dayPoint && sunTimes(dayPoint, day.date, utcOffsetAt(dayPoint, day.date, trip.countries))
  const sunAt = sun && !draggingId && listed.length > 0 ? sunSlots(listedRoute.map((s) => s.plannedTime), sun) : undefined
  /** The sunrise / sunset rows that go before the stop at `index` (the stops' count = after the last one). */
  const sunRows = (index: number) =>
    sun &&
    sunAt && (
      <>
        {sunAt.rise === index && <SunRow kind="rise" minutes={sun.rise} between={index > 0 && index < listedRoute.length} />}
        {sunAt.set === index && <SunRow kind="set" minutes={sun.set} between={index > 0 && index < listedRoute.length} />}
      </>
    )
  const dayFlights = flightSources(tripExpenses ?? [], day.date)
  const usedFlights = new Set(
    route.slice(1).flatMap((p, i) => legs.get(legKey(route[i].id, p.id))?.segments.flatMap((s) => (s.booking ? [s.booking.id] : [])) ?? []),
  )
  const unusedFlights = dayFlights.filter((f) => !usedFlights.has(f.id))
  // The open leg (or the one being drawn): the maps show only its line and zoom to it.
  const focusKey = drawing ? legKey(drawing.fromPlaceId, drawing.toPlaceId) : openLeg
  const focusFrom = focusKey && route.find((p) => focusKey.startsWith(`${p.id}>`))
  const focusTo = focusKey && route.find((p) => focusKey.endsWith(`>${p.id}`))
  const focus: LegFocus | undefined =
    focusKey && focusFrom && focusTo
      ? {
          fromId: focusFrom.id,
          toId: focusTo.id,
          points: [focusFrom, focusTo, ...(legs.get(focusKey)?.segments.flatMap(drawnPath) ?? [])],
        }
      : undefined

  return (
    <TripLayout trip={trip} active={{ dayId: day.id }}>
      <DayStrip tripId={tripId} days={days} currentId={day.id} />

      <PassCoverageContext.Provider value={passCovered}>
      <div className="day-layout">
        <div className={`day-map-column${mapOpen ? '' : ' map-collapsed'}`}>
          <div className="map-bar">
            <div className="segmented map-switch" role="radiogroup" aria-label="Map">
              {(['google', 'offline'] as const).map((provider) => (
                <button
                  key={provider}
                  type="button"
                  role="radio"
                  aria-checked={mapProvider === provider}
                  className={mapProvider === provider ? 'active' : ''}
                  onClick={() => setMapProvider(provider)}
                >
                  {provider === 'google' ? 'Google map' : 'Offline map'}
                </button>
              ))}
            </div>
            <button type="button" className="ghost map-toggle" onClick={() => setMapOpen(!mapOpen)} aria-expanded={mapOpen}>
              <Icon name={mapOpen ? 'up' : 'map'} /> {mapOpen ? 'Hide' : 'Show map'}
            </button>
          </div>
          {mapProvider === 'offline' ? (
            <ErrorBoundary fallback={<p className="error">The offline map failed to load. Reload the page to try again.</p>}>
              <Suspense fallback={<p className="muted small">Loading the offline map…</p>}>
                <OfflineMapPanel
                  tripId={tripId}
                  places={places}
                  legs={legs}
                  selectedPlaceId={selectedId}
                  onSelectPlace={setSelectedId}
                  onTap={onOfflineTap}
                  drawing={drawing}
                  focus={focus}
                  bases={bases}
                  route={route}
                />
              </Suspense>
            </ErrorBoundary>
          ) : !hasGoogleKey ? (
            <p className="error">Map and place search need the Google key (VITE_GOOGLE_MAPS_API_KEY).</p>
          ) : mapStatus === APILoadingStatus.FAILED || (!online && mapStatus !== APILoadingStatus.LOADED && mapStatus !== APILoadingStatus.AUTH_FAILURE) ? (
            // Only before the map exists: a map already shown is kept (unmounting
            // it offline can make Google's code throw).
            <MapUnavailable online={online} />
          ) : (
            <ErrorBoundary fallback={<MapUnavailable online={online} />}>
              <DayMap
                places={places}
                legs={legs}
                selectedPlaceId={selectedId}
                onSelectPlace={setSelectedId}
                onMapClick={onMapClick}
                fallbackCenter={anyTripPlace ? { lat: anyTripPlace.lat, lng: anyTripPlace.lng } : undefined}
                drawing={drawing}
                focus={focus}
                bases={bases}
                route={route}
              />
            </ErrorBoundary>
          )}
          {drawing && <DrawToolbar drawing={drawing} onChange={setDrawing} />}
          {pending && !drawing && <PendingAddCard key={JSON.stringify(pending)} pending={pending} onAdd={add} onClose={() => setPending(null)} />}
        </div>

        <div className="day-list-column">
          <DayHeader
            key={day.id}
            day={day}
            number={index + 1}
            city={stays ? cityLabel(stays, day.date) : ''}
            hotelChange={!!stays && isHotelChange(stays, day.date)}
            point={dayPoint}
            online={online}
            trip={trip}
            holidays={holidays?.byDay.get(day.id) ?? []}
            places={places}
            legs={legs}
            travelers={travelers}
            prevHref={prev && href({ page: 'day', tripId, dayId: prev.id })}
            nextHref={next && href({ page: 'day', tripId, dayId: next.id })}
          />

          {places.length >= 2 &&
            (optimizing ? (
              <OptimizePanel day={day} places={places} legs={legs} onClose={() => setOptimizing(false)} />
            ) : (
              <div className="row between list-toolbar">
                <span className="muted small">
                  {places.length} places
                  {walking.meters > 0 && (
                    <span title={walking.estimated ? 'Some walks only have their minutes: estimated at 4.5 km/h' : undefined}>
                      {' '}
                      · {walking.estimated ? '≈ ' : ''}
                      {formatDistance(walking.meters)} on foot
                    </span>
                  )}
                  {conflicts > 0 && (
                    <span className="warning">
                      {' '}
                      · {conflicts} opening-hours {conflicts === 1 ? 'conflict' : 'conflicts'}
                    </span>
                  )}
                </span>
                <button type="button" className="ghost" onClick={() => setOptimizing(true)}>
                  <Icon name="sparkle" /> Optimize order
                </button>
              </div>
            ))}
          <ol className={`timeline${draggingId ? ' reordering' : ''}`} ref={listRef}>
            {places.length === 0 && (
              <li className="empty-state">
                <p>No places yet.</p>
                <p className="muted small">Search for a place below or tap the map to add one.</p>
              </li>
            )}
            {/* Base stops are added by the user only: at the start, between two places (in the leg) or at the end. */}
            {!draggingId && places.length > 0 && morningBase && !listedRoute[0].baseStop && (
              <li className="base-add">
                <button type="button" className="link small" onClick={() => addBaseStop(day.id, 0, morningBase)}>
                  <Icon name="plus" size={14} /> <Icon name={baseIcon(morningBase.base!)} size={15} /> From base
                </button>
              </li>
            )}
            {listedRoute.map((stop, i) => {
              const next = listedRoute[i + 1]
              const key = next && legKey(stop.id, next.id)
              const placeIndex = stop.baseStop ? -1 : listed.indexOf(stop)
              return (
                <Fragment key={stop.id}>
                  {i === 0 && sunRows(0)}
                  {stop.baseStop ? (
                    // While dragging, base stops (between the old neighbours) are hidden like the legs.
                    !draggingId && (
                      <BaseStopRow
                        dayId={day.id}
                        stop={stop.baseStop}
                        label={baseStopLabel(i, stop.baseStop)}
                        bases={dayBaseStays}
                        arrive={i > 0 ? legTimes(legs.get(legKey(listedRoute[i - 1].id, stop.id))?.segments).arrive : undefined}
                        leave={next ? legTimes(legs.get(key)?.segments).depart : undefined}
                        late={
                          i > 0
                            ? lateRide(legs.get(legKey(listedRoute[i - 1].id, stop.id))?.segments, day.date, utcOffsetAt(stop, day.date, trip.countries))
                            : null
                        }
                      />
                    )
                  ) : (
                    <PlaceItem
                      place={stop}
                      index={placeIndex}
                      count={places.length}
                      days={days}
                      currency={trip.baseCurrency}
                      currencies={currencyChoices(trip)}
                      travelers={travelers}
                      date={day.date}
                      selected={stop.id === selectedId}
                      onSelect={() => setSelectedId(stop.id === selectedId ? null : stop.id)}
                      handle={places.length > 1 ? handleProps(stop.id) : undefined}
                      dragging={stop.id === draggingId}
                    />
                  )}
                  {next && sunRows(i + 1)}
                  {/* While dragging, the legs (made for the old neighbours) are hidden. */}
                  {next && !draggingId && (
                    <LegItem
                      tripId={tripId}
                      leg={legs.get(key)}
                      from={stop}
                      to={next}
                      date={day.date}
                      currency={trip.baseCurrency}
                      currencies={currencyChoices(trip)}
                      countries={trip.countries}
                      hasGoogleKey={hasGoogleKey}
                      flights={unusedFlights}
                      allFlights={dayFlights}
                      open={openLeg === key}
                      onToggle={() => setOpenLeg(openLeg === key ? null : key)}
                      onDraw={(d) => {
                        setPending(null)
                        setDrawing(d)
                        setMapOpen(true)
                        // On a phone the map is above the list: bring it into view.
                        document.querySelector('.day-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }}
                      onAddBaseStop={
                        nightBase && !stop.baseStop && !next.baseStop
                          ? () => {
                              setOpenLeg(null)
                              void addBaseStop(day.id, placeIndex + 1, nightBase)
                            }
                          : undefined
                      }
                    />
                  )}
                </Fragment>
              )
            })}
            {sunRows(listedRoute.length)}
            {!draggingId && places.length > 0 && nightBase && !listedRoute.at(-1)?.baseStop && (
              <li className="base-add">
                <button type="button" className="link small" onClick={() => addBaseStop(day.id, 'end', nightBase)}>
                  <Icon name="plus" size={14} /> <Icon name={baseIcon(nightBase.base!)} size={15} /> Back to base
                </button>
              </li>
            )}
          </ol>

          {/* Like the end of a list in Wanderlog: add the next place right below the last one. */}
          <section className="add-place" aria-labelledby="add-place-title">
            <h2 id="add-place-title" className="section-title">
              Add to this day
            </h2>
            {online && hasGoogleKey && <PlaceSearch onAdd={add} region={trip.countries?.[0]} />}
            <OptionPicker
              tripId={tripId}
              dayId={day.id}
              cities={(stays ? staysOn(stays, day.date) : []).map((s) => s.city)}
              onAdded={setSelectedId}
            />
            <p className="muted small">
              {mapProvider === 'offline'
                ? 'Or tap the map to drop a pin (tapping a shop or sight names it).'
                : 'Or tap a place on the map to add it, or an empty spot to drop a custom pin.'}
            </p>
          </section>

          <DayMoney
            trip={trip}
            dayId={day.id}
            estimate={itemsBudget(dayMoney(day, index + 1, dayPlaces, legs, travelers, passCovered).itinerary)}
            expenses={dayExpenses}
            started={tripStarted(trip)}
          />

          <ExportCard tripId={tripId} day={{ id: day.id, number: index + 1 }} />
        </div>
      </div>
      </PassCoverageContext.Provider>
    </TripLayout>
  )
}

/** "From base" / "Back to base": the city's hotel (or station), with no details, only the way there. */
function BaseStopRow({
  dayId,
  stop,
  label,
  bases,
  arrive,
  leave,
  late,
}: {
  dayId: string
  stop: BaseStop
  label: string
  bases: Stay[]
  /** ISO times from the suggested routes to and from it, when known. */
  arrive?: string
  leave?: string
  /** The way back has a ride after 23:00 or ends after midnight (User's choice 4-B). */
  late: LateRide | null
}) {
  const times = [arrive && `Arrive at ${formatTime(arrive)}`, leave && `Leave at ${formatTime(leave)}`].filter(Boolean).join(' · ')
  return (
    <li className="base-stop">
      <span className="base-stop-icon" aria-hidden="true">
        <Icon name={baseIcon(stop.base)} size={20} />
      </span>
      <span className="base-stop-text">
        {/* "From base Meander · Leave at 05:35"; on phones the name goes on a line of its own below. */}
        <span className="base-stop-label">
          {label} <span className="base-stop-name">{stop.base.name}</span>
          {times && <span className={`base-stop-time${late ? ' late' : ''}`}> · {times}</span>}
        </span>
        <span className="base-stop-name-below muted small">{stop.base.name}</span>
        {late && (
          <span className="base-stop-late small">
            <Icon name="moon" size={14} />
            {late.afterMidnight
              ? 'After midnight: most trains have stopped. Check the last train or plan a taxi.'
              : `Late ride (leaves ${late.leaves}): check the last train.`}
          </span>
        )}
      </span>
      {bases.length > 1 && (
        // On a travel day: this morning's hotel or tonight's.
        <select
          className="compact small"
          value={stop.stayId}
          aria-label="Which base"
          title="Changing it removes the way there, which led to the other base"
          onChange={(e) => {
            const stay = bases.find((s) => s.id === e.target.value)
            if (stay) void setBaseStopStay(dayId, stop.id, stay)
          }}
        >
          {bases.map((s) => (
            <option key={s.id} value={s.id}>
              {s.city}
            </option>
          ))}
        </select>
      )}
      <button type="button" className="ghost icon-button" aria-label={`Remove “${label}”`} title="Remove" onClick={() => removeBaseStop(dayId, stop.id)}>
        <Icon name="close" size={16} />
      </button>
    </li>
  )
}

/** "Sunrise 05:43" / "Sunset 18:14": a thin line in the timeline, where it happens among the places. */
function SunRow({ kind, minutes, between }: { kind: 'rise' | 'set'; minutes: number; between: boolean }) {
  return (
    <li className={`sun-row ${kind}${between ? ' between' : ''}`}>
      <Icon name={kind === 'rise' ? 'sunrise' : 'sunset'} size={16} />
      {kind === 'rise' ? 'Sunrise' : 'Sunset'} {clockTime(minutes)}
      <span className="sun-row-line" aria-hidden="true" />
    </li>
  )
}

function DayHeader({
  day,
  number,
  city,
  hotelChange,
  point,
  online,
  trip,
  holidays,
  places,
  legs,
  travelers,
  prevHref,
  nextHref,
}: {
  day: Day
  number: number
  city: string
  /** Morning in one hotel of the city, night in another. */
  hotelChange: boolean
  /** Where the day is spent, for its usual weather. */
  point?: { lat: number; lng: number }
  online: boolean
  trip: Trip
  /** Days off there that day. */
  holidays: DayHoliday[]
  places: Place[]
  legs: Map<string, Leg>
  travelers: number
  prevHref?: string
  nextHref?: string
}) {
  const [title, setTitle] = useDraft(day.title, (value) => updateDay(day.id, { title: value.trim() }))
  const [shared, setShared] = useState('')
  const climate = useClimate(point, day.date, online)
  const [climateInfo, setClimateInfo] = useState(false)

  async function share() {
    try {
      const result = await shareText(`Day ${number}`, dayText(day, number, places, legs, travelers))
      setShared(result === 'copied' ? 'Copied to the clipboard.' : '')
    } catch {
      setShared('Could not share on this device.')
    }
  }

  return (
    <header className="hero day-hero">
      <div className="day-hero-top">
        <p className="hero-kicker">
          Day {number} · {formatDay(day.date)}
          {city && <CityTag city={city} />}
          {hotelChange && <span className="tag hotel-change">Hotel change</span>}
        </p>
        <span className="row day-hero-actions">
          <button type="button" className="ghost icon-button" onClick={share} aria-label="Share this day" title="Share">
            <Icon name="share" />
          </button>
          <button type="button" className="ghost icon-button" onClick={() => window.print()} aria-label="Print this day" title="Print">
            <Icon name="print" />
          </button>
          {/* Phones have the day strip above; arrows only where there is room. */}
          {prevHref && (
            <a className="icon-button day-arrow" href={prevHref} aria-label="Previous day" title="Previous day">
              <Icon name="back" />
            </a>
          )}
          {nextHref && (
            <a className="icon-button day-arrow" href={nextHref} aria-label="Next day" title="Next day">
              <Icon name="forward" />
            </a>
          )}
        </span>
      </div>
      <input
        className="hero-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a title (e.g. Asakusa and Ueno)"
        aria-label="Day title"
      />
      {holidays.map((h) => (
        // "Showa Day · National holiday", with an "i" about the busy week it falls in (Golden Week…).
        <p key={h.name} className="day-holiday">
          <Icon name="flag" size={14} />
          <span>
            <strong>{h.name}</strong> · {holidayKind(h, trip)}
          </span>
          {h.note && <InfoTip label="About this holiday week">{h.note}</InfoTip>}
        </p>
      ))}
      {climate && (
        // Only the symbols (User): a mouse shows what they are on hover, a tap on a phone shows it below.
        <button
          type="button"
          className="day-weather"
          title="Usual weather on this date: average of the last 10 years"
          aria-expanded={climateInfo}
          onClick={() => {
            if (matchMedia('(hover: none)').matches) setClimateInfo(!climateInfo)
          }}
        >
          <span title="Usual low and high">
            <Icon name="thermometer" size={13} /> {climate.min}–{climate.max} °C
          </span>
          <span title="Chance of rain">
            <Icon name="drop" size={13} /> {climate.rain}%
          </span>
        </button>
      )}
      {climateInfo && <p className="muted small day-weather-info">Usual low and high, and chance of rain on this date: average of the last 10 years.</p>}
      {shared && <p className="muted small">{shared}</p>}
    </header>
  )
}

function MapUnavailable({ online }: { online: boolean }) {
  return (
    <div className="card map-unavailable">
      <p>
        {online
          ? 'The map could not load. Reload the page to try again.'
          : 'No internet: the map is not available. Your places, routes and notes below are saved on this device.'}
      </p>
      <p className="muted small">For a map without internet, export this day to Organic Maps (below).</p>
      {online && (
        <button type="button" onClick={() => location.reload()}>
          Reload
        </button>
      )}
    </div>
  )
}

function PendingAddCard({
  pending,
  onAdd,
  onClose,
}: {
  pending: PendingAdd
  onAdd: (place: PlaceResult | { name: string; lat: number; lng: number }) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(pending.kind === 'custom' ? (pending.name ?? '') : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    setBusy(true)
    setError('')
    try {
      if (pending.kind === 'google') {
        // Details are fetched only now, on explicit confirmation (1 request).
        const place = await fetchPlace(pending.googlePlaceId)
        if (!place) throw new Error('This place has no location.')
        await onAdd(place)
      } else {
        await onAdd({ name: name.trim() || 'Custom pin', lat: pending.lat, lng: pending.lng })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="card pending-add">
      {pending.kind === 'google' ? (
        <p>Add the place you tapped on the map to this day?</p>
      ) : (
        <label>
          Add a custom pin here
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus />
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="button" className="primary" disabled={busy} onClick={confirm}>
          {busy ? 'Adding…' : 'Add'}
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
