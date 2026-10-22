import { APILoadingStatus, useApiLoadingStatus, type MapMouseEvent } from '@vis.gl/react-google-maps'
import { useLiveQuery } from 'dexie-react-hooks'
import { Fragment, lazy, Suspense, useMemo, useState } from 'react'
import { dayBudget, travelersOf } from '../budget'
import { BudgetBreakdown } from '../components/BudgetView'
import { DayMap } from '../components/DayMap'
import { ExpenseList } from '../components/ExpenseList'
import { ExportCard } from '../components/ExportCard'
import { DrawToolbar } from '../components/DrawToolbar'
import { DayStrip } from '../components/DayStrip'
import { CityTag, TripLayout } from '../components/TripLayout'
import { cityLabel, staysOn } from '../db/stays'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Icon } from '../components/Icon'
import { LegItem } from '../components/LegItem'
import { OptimizePanel } from '../components/OptimizePanel'
import { OptionPicker } from '../components/OptionPicker'
import { PlaceItem } from '../components/PlaceItem'
import { PlaceSearch } from '../components/PlaceSearch'
import { formatDay } from '../dates'
import { db } from '../db/db'
import { legKey } from '../db/legs'
import type { Day, Leg, Place } from '../db/model'
import { addPlace, applyDayOrder, orderPlaces, updateDay } from '../db/trips'
import type { Drawing } from '../drawing'
import { dayText, shareText } from '../export/shareText'
import { fetchPlace, type PlaceResult } from '../places/googlePlaces'
import { useRefreshStalePlaces } from '../places/refresh'
import { timeConflict } from '../planning/hours'
import { href } from '../router'
import { loadJson, saveJson } from '../settings'
import { useDraft } from '../useDraft'
import { useOnline } from '../useOnline'
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

  return (
    <TripLayout trip={trip} active={{ dayId: day.id }}>
      <DayStrip tripId={tripId} days={days} currentId={day.id} />

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
                  bases={bases}
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
                bases={bases}
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
            {listed.map((place, i) => {
              const next = listed[i + 1]
              const key = next && legKey(place.id, next.id)
              return (
                <Fragment key={place.id}>
                  <PlaceItem
                    place={place}
                    index={i}
                    count={places.length}
                    days={days}
                    currency={trip.baseCurrency}
                    travelers={travelers}
                    date={day.date}
                    selected={place.id === selectedId}
                    onSelect={() => setSelectedId(place.id === selectedId ? null : place.id)}
                    handle={places.length > 1 ? handleProps(place.id) : undefined}
                    dragging={place.id === draggingId}
                  />
                  {/* While dragging, the legs (made for the old neighbours) are hidden. */}
                  {next && !draggingId && (
                    <LegItem
                      tripId={tripId}
                      leg={legs.get(key)}
                      from={place}
                      to={next}
                      date={day.date}
                      currency={trip.baseCurrency}
                      hasGoogleKey={hasGoogleKey}
                      open={openLeg === key}
                      onToggle={() => setOpenLeg(openLeg === key ? null : key)}
                      onDraw={(d) => {
                        setPending(null)
                        setDrawing(d)
                        setMapOpen(true)
                        // On a phone the map is above the list: bring it into view.
                        document.querySelector('.day-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }}
                    />
                  )}
                </Fragment>
              )
            })}
          </ol>

          {/* Like the end of a list in Wanderlog: add the next place right below the last one. */}
          <section className="add-place" aria-labelledby="add-place-title">
            <h2 id="add-place-title" className="section-title">
              Add to this day
            </h2>
            {online && hasGoogleKey && <PlaceSearch onAdd={add} />}
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

          <section className="card">
            <BudgetBreakdown budget={dayBudget(day, dayPlaces, legs, dayExpenses, travelers)} trip={trip} title="Day budget" />
            <h3>Expenses this day</h3>
            <ExpenseList trip={trip} dayId={day.id} expenses={dayExpenses} />
          </section>

          <ExportCard tripId={tripId} day={{ id: day.id, number: index + 1 }} />
        </div>
      </div>
    </TripLayout>
  )
}

function DayHeader({
  day,
  number,
  city,
  places,
  legs,
  travelers,
  prevHref,
  nextHref,
}: {
  day: Day
  number: number
  city: string
  places: Place[]
  legs: Map<string, Leg>
  travelers: number
  prevHref?: string
  nextHref?: string
}) {
  const [title, setTitle] = useDraft(day.title, (value) => updateDay(day.id, { title: value.trim() }))
  const [shared, setShared] = useState('')

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
