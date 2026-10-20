import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { formatDate } from '../dates'
import { db } from '../db/db'
import { createTrip } from '../db/trips'
import { href, navigate } from '../router'

export function TripsPage() {
  const trips = useLiveQuery(() => db.trips.orderBy('startDate').toArray())

  return (
    <>
      <section className="card">
        <h2>Trips</h2>
        {trips?.length === 0 && <p className="muted">No trips yet. Create your first one below.</p>}
        <ul className="link-list">
          {trips?.map((trip) => (
            <li key={trip.id}>
              <a href={href({ page: 'trip', tripId: trip.id })}>
                <strong>{trip.name}</strong>
                <span className="muted small">
                  {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
      <NewTripForm />
    </>
  )
}

function NewTripForm() {
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
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Japan 2028" required />
      </label>
      <div className="row wrap">
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
      <button type="submit" className="primary">
        Create trip
      </button>
    </form>
  )
}
