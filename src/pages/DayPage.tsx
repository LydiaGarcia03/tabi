import type { MapMouseEvent } from '@vis.gl/react-google-maps'
import { useLiveQuery } from 'dexie-react-hooks'
import { Fragment, useMemo, useState } from 'react'
import { dayBudget } from '../budget'
import { BudgetBreakdown } from '../components/BudgetView'
import { DayMap } from '../components/DayMap'
import { ExpenseList } from '../components/ExpenseList'
import { DrawToolbar } from '../components/DrawToolbar'
import { LegItem } from '../components/LegItem'
import { PlaceItem } from '../components/PlaceItem'
import { PlaceSearch } from '../components/PlaceSearch'
import { formatDay } from '../dates'
import { db } from '../db/db'
import { legKey } from '../db/legs'
import type { Day } from '../db/model'
import { addPlace, orderPlaces, updateDay } from '../db/trips'
import type { Drawing } from '../drawing'
import { fetchPlace, type PlaceResult } from '../places/googlePlaces'
import { href } from '../router'
import { useDraft } from '../useDraft'
import { NotFound } from './TripPage'

type PendingAdd =
  | { kind: 'google'; googlePlaceId: string }
  | { kind: 'custom'; lat: number; lng: number }

export function DayPage({ tripId, dayId, hasGoogleKey }: { tripId: string; dayId: string; hasGoogleKey: boolean }) {
  // `null` = not found; `undefined` = still loading.
  const day = useLiveQuery(async () => (await db.days.get(dayId)) ?? null, [dayId])
  const days = useLiveQuery(() => db.days.where('tripId').equals(tripId).sortBy('date'), [tripId])
  const dayPlaces = useLiveQuery(() => db.places.where('dayId').equals(dayId).toArray(), [dayId])
  const anyTripPlace = useLiveQuery(() => db.places.where('tripId').equals(tripId).first(), [tripId])
  const tripLegs = useLiveQuery(() => db.legs.where('tripId').equals(tripId).toArray(), [tripId])
  const legs = useMemo(() => new Map((tripLegs ?? []).map((l) => [legKey(l.fromPlaceId, l.toPlaceId), l])), [tripLegs])
  const trip = useLiveQuery(async () => (await db.trips.get(tripId)) ?? null, [tripId])
  const dayExpenses = useLiveQuery(() => db.expenses.where('dayId').equals(dayId).toArray(), [dayId])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openLeg, setOpenLeg] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingAdd | null>(null)
  const [drawing, setDrawing] = useState<Drawing | null>(null)

  if (day === undefined || days === undefined || dayPlaces === undefined || trip === undefined || !dayExpenses) return null
  if (!day || !trip) return <NotFound />

  const places = orderPlaces(day, dayPlaces)
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

  return (
    <>
      <nav className="row between">
        <a href={href({ page: 'trip', tripId })}>← Trip</a>
        <span className="row">
          {prev && <a href={href({ page: 'day', tripId, dayId: prev.id })}>‹ Previous</a>}
          {next && <a href={href({ page: 'day', tripId, dayId: next.id })}>Next ›</a>}
        </span>
      </nav>

      <DayHeader key={day.id} day={day} number={index + 1} />

      <div className="day-layout">
        <div className="day-map-column">
          {hasGoogleKey ? (
            <>
              <DayMap
                places={places}
                legs={legs}
                selectedPlaceId={selectedId}
                onSelectPlace={setSelectedId}
                onMapClick={onMapClick}
                fallbackCenter={anyTripPlace ? { lat: anyTripPlace.lat, lng: anyTripPlace.lng } : undefined}
                drawing={drawing}
              />
              {drawing && <DrawToolbar drawing={drawing} onChange={setDrawing} />}
              {pending && !drawing && <PendingAddCard pending={pending} onAdd={add} onClose={() => setPending(null)} />}
              <PlaceSearch onAdd={add} />
              <p className="muted small">Tip: tap a place on the map to add it, or an empty spot to drop a custom pin.</p>
            </>
          ) : (
            <p className="error">Map and place search need the Google key (VITE_GOOGLE_MAPS_API_KEY).</p>
          )}
        </div>

        <div className="day-list-column">
          <ol className="place-list">
            {places.length === 0 && <li className="muted">No places yet. Search above or tap the map.</li>}
            {places.map((place, i) => {
              const next = places[i + 1]
              const key = next && legKey(place.id, next.id)
              return (
                <Fragment key={place.id}>
                  <PlaceItem
                    place={place}
                    index={i}
                    count={places.length}
                    days={days}
                    currency={trip.baseCurrency}
                    selected={place.id === selectedId}
                    onSelect={() => setSelectedId(place.id === selectedId ? null : place.id)}
                  />
                  {next && (
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
                        // On a phone the map is above the list: bring it into view.
                        document.querySelector('.day-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }}
                    />
                  )}
                </Fragment>
              )
            })}
          </ol>

          <section className="card">
            <BudgetBreakdown budget={dayBudget(day, dayPlaces, legs, dayExpenses)} trip={trip} title="Day budget" />
            <h3>Expenses this day</h3>
            <ExpenseList trip={trip} dayId={day.id} expenses={dayExpenses} />
          </section>
        </div>
      </div>
    </>
  )
}

function DayHeader({ day, number }: { day: Day; number: number }) {
  const [title, setTitle] = useDraft(day.title, (value) => updateDay(day.id, { title: value.trim() }))
  return (
    <header className="day-header">
      <h2>
        Day {number} · {formatDay(day.date)}
      </h2>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (e.g. Asakusa and Ueno)"
        aria-label="Day title"
      />
    </header>
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
  const [name, setName] = useState('')
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
