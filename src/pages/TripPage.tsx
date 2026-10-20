import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { formatDay } from '../dates'
import { db } from '../db/db'
import type { Trip } from '../db/model'
import { deleteTrip, updateTrip } from '../db/trips'
import { href, navigate } from '../router'
import { useDraft } from '../useDraft'

export function TripPage({ tripId }: { tripId: string }) {
  // `null` = not found; `undefined` = still loading.
  const trip = useLiveQuery(async () => (await db.trips.get(tripId)) ?? null, [tripId])
  const days = useLiveQuery(() => db.days.where('tripId').equals(tripId).sortBy('date'), [tripId])

  if (trip === undefined || days === undefined) return null
  if (!trip) return <NotFound />

  return (
    <>
      <p>
        <a href={href({ page: 'trips' })}>← All trips</a>
      </p>
      <TripDetails key={trip.id} trip={trip} />
      <section className="card">
        <h2>Days</h2>
        <ul className="link-list">
          {days.map((day, i) => {
            const outside = day.date < trip.startDate || day.date > trip.endDate
            return (
              <li key={day.id}>
                <a href={href({ page: 'day', tripId, dayId: day.id })}>
                  <strong>
                    Day {i + 1} · {formatDay(day.date)}
                  </strong>
                  <span className="muted small">
                    {day.title || 'No title'} · {day.placeIds.length} place(s)
                    {outside && ' · outside trip dates'}
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      </section>
      <DeleteTrip trip={trip} />
    </>
  )
}

function TripDetails({ trip }: { trip: Trip }) {
  const [name, setName] = useDraft(trip.name, (value) => updateTrip(trip.id, { name: value.trim() || trip.name }))

  return (
    <section className="card">
      <label>
        Trip name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="row wrap">
        <label>
          Start
          <input
            type="date"
            value={trip.startDate}
            max={trip.endDate}
            onChange={(e) => e.target.value && updateTrip(trip.id, { startDate: e.target.value })}
          />
        </label>
        <label>
          End
          <input
            type="date"
            value={trip.endDate}
            min={trip.startDate}
            onChange={(e) => e.target.value && updateTrip(trip.id, { endDate: e.target.value })}
          />
        </label>
      </div>
      <p className="muted small">Changing dates adds the new days. Days outside the dates are removed only if empty.</p>
    </section>
  )
}

function DeleteTrip({ trip }: { trip: Trip }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <section className="card">
      {confirming ? (
        <>
          <p>Delete “{trip.name}” with all its days and places? This cannot be undone.</p>
          <div className="row">
            <button
              type="button"
              className="danger"
              onClick={async () => {
                await deleteTrip(trip.id)
                navigate({ page: 'trips' })
              }}
            >
              Delete trip
            </button>
            <button type="button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <button type="button" onClick={() => setConfirming(true)}>
          Delete trip…
        </button>
      )}
    </section>
  )
}

export function NotFound() {
  return (
    <section className="card">
      <p>Not found. It may have been deleted.</p>
      <a href={href({ page: 'trips' })}>← All trips</a>
    </section>
  )
}
