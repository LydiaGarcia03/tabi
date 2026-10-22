import { useState, type FormEvent } from 'react'
import { formatDate, formatDay, today } from '../dates'
import type { ChecklistItem, Day, Place, Trip } from '../db/model'
import { updatePlace, updateTrip } from '../db/trips'
import { BOOK_AHEAD_TODO } from '../planning/optionKinds'
import { href } from '../router'

/** A place in the itinerary that needs a reservation or a ticket. */
export interface PlaceToBook {
  place: Place & { bookAhead: NonNullable<Place['bookAhead']> }
  day: Day
}

/**
 * Reminders and shopping list of the trip (stored on the trip), after the
 * places of the itinerary to book (listed from the places themselves, so they
 * follow when a place moves to another day or is removed).
 */
export function Checklist({ trip, toBook }: { trip: Trip; toBook: PlaceToBook[] }) {
  const items = trip.checklist ?? []
  const [text, setText] = useState('')
  const [due, setDue] = useState('')
  const now = today()

  const save = (next: ChecklistItem[]) => updateTrip(trip.id, { checklist: next })

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    await save([...items, { id: crypto.randomUUID(), text: text.trim(), done: false, due: due || undefined }])
    setText('')
    setDue('')
  }

  // Open items first (soonest due first), done ones last.
  const sorted = [...items].sort(
    (a, b) => Number(a.done) - Number(b.done) || (a.due ?? '9999').localeCompare(b.due ?? '9999'),
  )

  return (
    <section className="card">
      <h2>Checklist</h2>
      {toBook.length > 0 && (
        <ul className="checklist">
          {/* Not done first, then by day. */}
          {[...toBook]
            .sort((a, b) => Number(a.place.booked ?? false) - Number(b.place.booked ?? false) || a.day.date.localeCompare(b.day.date))
            .map(({ place, day }) => (
              <li key={place.id} className={place.booked ? 'done' : ''}>
                <label className="check">
                  <input type="checkbox" checked={place.booked ?? false} onChange={(e) => updatePlace(place.id, { booked: e.target.checked })} />
                  <span>
                    {BOOK_AHEAD_TODO[place.bookAhead]}: {place.name}
                    <span className="small muted"> · {formatDay(day.date)}</span>
                  </span>
                </label>
                <a className="small" href={href({ page: 'day', tripId: trip.id, dayId: day.id })}>
                  Open day
                </a>
              </li>
            ))}
        </ul>
      )}
      {items.length === 0 && toBook.length === 0 && <p className="muted small">Reminders and things to buy: “Book hotels 4–6 months before”, “Pocket Wi-Fi”…</p>}
      <ul className="checklist">
        {sorted.map((item) => (
          <li key={item.id} className={item.done ? 'done' : ''}>
            <label className="check">
              <input
                type="checkbox"
                checked={item.done}
                onChange={(e) => save(items.map((i) => (i.id === item.id ? { ...i, done: e.target.checked } : i)))}
              />
              <span>
                {item.text}
                {item.due && (
                  <span className={`small ${!item.done && item.due < now ? 'warning' : 'muted'}`}> · by {formatDate(item.due)}</span>
                )}
              </span>
            </label>
            <button
              type="button"
              className="link"
              aria-label={`Remove “${item.text}”`}
              onClick={() => save(items.filter((i) => i.id !== item.id))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form className="checklist-add" onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a reminder…" aria-label="New reminder" />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date (optional)" title="Due date (optional)" />
        <button type="submit" disabled={!text.trim()}>
          Add
        </button>
      </form>
    </section>
  )
}
