import type { MapMouseEvent } from '@vis.gl/react-google-maps'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { DayMap } from '../components/DayMap'
import { PlaceItem } from '../components/PlaceItem'
import { PlaceSearch } from '../components/PlaceSearch'
import { formatDay } from '../dates'
import { db } from '../db/db'
import type { Day } from '../db/model'
import { addPlace, orderPlaces, updateDay } from '../db/trips'
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingAdd | null>(null)

  if (day === undefined || days === undefined || dayPlaces === undefined) return null
  if (!day) return <NotFound />

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
                selectedPlaceId={selectedId}
                onSelectPlace={setSelectedId}
                onMapClick={onMapClick}
                fallbackCenter={anyTripPlace ? { lat: anyTripPlace.lat, lng: anyTripPlace.lng } : undefined}
              />
              {pending && <PendingAddCard pending={pending} onAdd={add} onClose={() => setPending(null)} />}
              <PlaceSearch onAdd={add} />
              <p className="muted small">Tip: tap a place on the map to add it, or an empty spot to drop a custom pin.</p>
            </>
          ) : (
            <p className="error">Map and place search need the Google key (VITE_GOOGLE_MAPS_API_KEY).</p>
          )}
        </div>

        <ol className="place-list">
          {places.length === 0 && <li className="muted">No places yet. Search above or tap the map.</li>}
          {places.map((place, i) => (
            <PlaceItem
              key={place.id}
              place={place}
              index={i}
              count={places.length}
              days={days}
              selected={place.id === selectedId}
              onSelect={() => setSelectedId(place.id === selectedId ? null : place.id)}
            />
          ))}
        </ol>
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
