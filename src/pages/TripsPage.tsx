import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { ImportBackup } from '../components/ImportBackup'
import { dateRange, daysBetween, formatDate, today } from '../dates'
import { db } from '../db/db'
import type { Trip } from '../db/model'
import { createTrip } from '../db/trips'
import { href, navigate } from '../router'

export function TripsPage() {
  const trips = useLiveQuery(() => db.trips.orderBy('startDate').toArray())
  const [creating, setCreating] = useState(false)

  if (!trips) return null

  return (
    <>
      <div className="page-title row between">
        <h1>Trips</h1>
        {!creating && (
          <button type="button" className="primary" onClick={() => setCreating(true)}>
            <Icon name="plus" /> New trip
          </button>
        )}
      </div>

      {creating && <NewTripForm onCancel={() => setCreating(false)} />}

      {trips.length === 0 && !creating && (
        <section className="empty-state">
          <p>No trips yet.</p>
          <p className="muted small">Create one to start planning, or import a backup from another device.</p>
        </section>
      )}

      <ul className="trip-cards">
        {trips.map((trip) => (
          <li key={trip.id}>
            <TripCard trip={trip} />
          </li>
        ))}
      </ul>

      <details className="card disclosure">
        <summary>Import a backup</summary>
        <ImportBackup />
      </details>
    </>
  )
}

function TripCard({ trip }: { trip: Trip }) {
  const days = dateRange(trip.startDate, trip.endDate).length
  return (
    <a className="trip-card" href={href({ page: 'trip', tripId: trip.id })}>
      <span className="trip-card-name">{trip.name}</span>
      <span className="muted small">
        {formatDate(trip.startDate)} – {formatDate(trip.endDate)} · {days} {days === 1 ? 'day' : 'days'}
      </span>
      <span className="trip-card-when">{countdown(trip)}</span>
    </a>
  )
}

function countdown(trip: Trip): string {
  const now = today()
  const toStart = daysBetween(now, trip.startDate)
  if (toStart > 1) return `In ${toStart} days`
  if (toStart === 1) return 'Tomorrow'
  if (now <= trip.endDate) return `Day ${daysBetween(trip.startDate, now) + 1} · happening now`
  return 'Done'
}

function NewTripForm({ onCancel }: { onCancel: () => void }) {
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const invalidDates = !!startDate && !!endDate && endDate < startDate

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !startDate || !endDate || invalidDates) return
    const tripId = await createTrip({ name: name.trim(), startDate, endDate })
    navigate({ page: 'trip', tripId })
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>New trip</h2>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Japan 2028" required autoFocus />
      </label>
      <div className="field-row">
        <label>
          Start
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </label>
        <label>
          End
          <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} required />
        </label>
      </div>
      {invalidDates && <p className="error">The end date must be on or after the start date.</p>}
      <div className="row">
        <button type="submit" className="primary">
          Create trip
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
