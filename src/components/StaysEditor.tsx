import { useState, type FormEvent } from 'react'
import { daysBetween, formatDay } from '../dates'
import type { Stay, Trip } from '../db/model'
import { addStay, deleteStay, updateStay } from '../db/stays'
import { LocateSearch } from './LocateSearch'
import { CityTag } from './TripLayout'

/** The trip split by city: which days are spent where. */
export function StaysEditor({ trip, stays }: { trip: Trip; stays: Stay[] }) {
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const sorted = [...stays].sort((a, b) => a.startDate.localeCompare(b.startDate))
  const last = sorted.at(-1)

  return (
    <section className="card">
      <h2>Cities</h2>
      {sorted.length === 0 && editing === null && (
        <p className="muted small">Split the trip by city (e.g. Osaka 30 Mar – 1 Apr): days show their city, and hotel options get their total for the stay.</p>
      )}
      <ul className="stay-list">
        {sorted.map((stay) =>
          editing === stay.id ? (
            <li key={stay.id}>
              <StayForm trip={trip} stay={stay} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={stay.id} className="stay-row">
              <span className="stay-main">
                <CityTag city={stay.city} />
                <span className="small">
                  {formatDay(stay.startDate)} – {formatDay(stay.endDate)} · {daysBetween(stay.startDate, stay.endDate) + 1}{' '}
                  {daysBetween(stay.startDate, stay.endDate) === 0 ? 'day' : 'days'}
                </span>
                {stay.base && <span className="muted small">Distances from {stay.base.name}</span>}
              </span>
              <span className="row">
                <button type="button" className="link" onClick={() => setEditing(stay.id)}>
                  Edit
                </button>
              </span>
            </li>
          ),
        )}
      </ul>
      {editing === 'new' ? (
        <StayForm
          trip={trip}
          defaults={{ startDate: last && last.endDate < trip.endDate ? last.endDate : trip.startDate, endDate: trip.endDate }}
          onDone={() => setEditing(null)}
        />
      ) : (
        editing === null && (
          <button type="button" onClick={() => setEditing('new')}>
            + Add city
          </button>
        )
      )}
    </section>
  )
}

function StayForm({
  trip,
  stay,
  defaults,
  onDone,
}: {
  trip: Trip
  stay?: Stay
  defaults?: { startDate: string; endDate: string }
  onDone: () => void
}) {
  const [city, setCity] = useState(stay?.city ?? '')
  const [startDate, setStartDate] = useState(stay?.startDate ?? defaults?.startDate ?? trip.startDate)
  const [endDate, setEndDate] = useState(stay?.endDate ?? defaults?.endDate ?? trip.endDate)
  const [base, setBase] = useState(stay?.base)
  const valid = city.trim() !== '' && !!startDate && !!endDate && endDate >= startDate

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    const values = { city: city.trim(), startDate, endDate, base }
    if (stay) await updateStay(stay.id, values)
    else await addStay({ ...values, tripId: trip.id })
    onDone()
  }

  return (
    <form className="expense-form" onSubmit={submit}>
      <label>
        City
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Osaka" autoFocus />
      </label>
      <div className="field-row">
        <label>
          First day
          <input type="date" value={startDate} min={trip.startDate} max={trip.endDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          Last day
          <input type="date" value={endDate} min={startDate} max={trip.endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
      </div>
      <p className="muted small">A travel day can be the last day of one city and the first of the next.</p>
      <div className="stay-base">
        <span className="small">
          <strong>Base for distances</strong> (station, hotel…):{' '}
          {base ? (
            <>
              {base.name}{' '}
              <button type="button" className="link" onClick={() => setBase(undefined)}>
                Clear
              </button>
            </>
          ) : (
            <span className="muted">not set</span>
          )}
        </span>
        <LocateSearch
          initialQuery={city ? `${city} station` : ''}
          placeholder="e.g. Shimbashi Station"
          onPick={(p) => setBase({ name: p.name, lat: p.lat, lng: p.lng })}
        />
      </div>
      <div className="row wrap">
        <button type="submit" className="primary" disabled={!valid}>
          Save city
        </button>
        <button type="button" onClick={onDone}>
          Cancel
        </button>
        {stay && (
          <button
            type="button"
            className="danger-outline"
            onClick={async () => {
              await deleteStay(stay.id)
              onDone()
            }}
          >
            Remove
          </button>
        )}
      </div>
    </form>
  )
}
