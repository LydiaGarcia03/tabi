import { useRef, useState, type FormEvent } from 'react'
import { formatDate, formatDay, today } from '../dates'
import { updateExpense } from '../db/expenses'
import type { ChecklistItem, Day, Expense, Place, Trip } from '../db/model'
import { updatePlace, updateTrip } from '../db/trips'
import type { IconName } from '../iconPaths'
import { expenseNeedsBooking, JOURNEY_ICON, JOURNEY_LABEL } from '../planning/journeys'
import { href } from '../router'
import { Icon } from './Icon'

/** A place in the itinerary that needs a reservation or a ticket. */
export interface PlaceToBook {
  place: Place & { bookAhead: NonNullable<Place['bookAhead']> }
  day: Day
}

/** One line of "To book": a hotel, a journey or a place of the itinerary. */
interface ToBook {
  id: string
  icon: IconName
  name: string
  /** "Ticket · Sat 1 Apr", "Hotel · 6 → 13 Apr · 7 nights". */
  sub: string
  /** "YYYY-MM-DD" it happens (for the order); undated ones last. */
  date: string
  booked: boolean
  setBooked: (booked: boolean) => void
  /** The day it is in (places): a tap on the line opens it. */
  dayId?: string
}

const PLACE_ICON: Record<PlaceToBook['place']['bookAhead'], IconName> = { reservation: 'food', ticket: 'ticket', either: 'ticket' }
const PLACE_KIND: Record<PlaceToBook['place']['bookAhead'], string> = { reservation: 'Table', ticket: 'Ticket', either: 'Ticket or table' }

/** What the itinerary has that needs booking: hotels, flights (and transport marked "Booking needed"), tables and tickets. */
function toBookItems(places: PlaceToBook[], expenses: Expense[]): ToBook[] {
  const fromExpenses = expenses.filter(expenseNeedsBooking).map((e): ToBook => {
    const setBooked = (booked: boolean) => void updateExpense(e.id, { booked: booked || undefined })
    if (e.hotel) {
      const { hotel } = e
      return {
        id: e.id,
        icon: 'home',
        name: hotel.name,
        sub: [
          'Hotel',
          hotel.checkIn && hotel.checkOut && `${formatDay(hotel.checkIn)} → ${formatDay(hotel.checkOut)}`,
          `${hotel.nights} ${hotel.nights === 1 ? 'night' : 'nights'}`,
        ]
          .filter(Boolean)
          .join(' · '),
        date: hotel.checkIn ?? '9999',
        booked: !!e.booked,
        setBooked,
      }
    }
    const journey = e.journey!
    return {
      id: e.id,
      icon: JOURNEY_ICON[journey.mode],
      name: `${journey.from} → ${journey.to}`,
      sub: [JOURNEY_LABEL[journey.mode], journey.date && formatDay(journey.date), journey.carrier].filter(Boolean).join(' · '),
      date: journey.date ?? '9999',
      booked: !!e.booked,
      setBooked,
    }
  })
  const fromPlaces = places.map(
    ({ place, day }): ToBook => ({
      id: place.id,
      icon: PLACE_ICON[place.bookAhead],
      name: place.name,
      sub: `${PLACE_KIND[place.bookAhead]} · ${formatDay(day.date)}`,
      date: day.date,
      booked: !!place.booked,
      setBooked: (booked) => void updatePlace(place.id, { booked }),
      dayId: day.id,
    }),
  )
  return [...fromExpenses, ...fromPlaces].sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * The trip's checklist (User's choice A from a mock, 2026-10-27, with an icon before each thing to book): first
 * what the itinerary still needs booked — one list by date, the name with "Ticket · Sat 1 Apr" under it, a tap on
 * the line opens its day, the box ticks it Booked; booked ones folded — listed from the itinerary itself so it
 * follows when things move or leave it; then the reminders (stored on the trip), added with an optional due date.
 */
export function Checklist({ trip, toBook, expenses }: { trip: Trip; toBook: PlaceToBook[]; expenses: Expense[] }) {
  const items = trip.checklist ?? []
  const [text, setText] = useState('')
  const [due, setDue] = useState('')
  const dueInput = useRef<HTMLInputElement>(null)
  const now = today()
  const booking = toBookItems(toBook, expenses)
  const left = booking.filter((b) => !b.booked)
  const done = booking.filter((b) => b.booked)

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

  const renderBooking = (b: ToBook) => {
    const content = (
      <>
        <span className="check-icon">
          <Icon name={b.icon} size={16} />
        </span>
        <span className="check-text">
          <span>{b.name}</span>
          {b.sub && <span className="small muted">{b.sub}</span>}
        </span>
        {b.dayId && <Icon name="forward" size={16} />}
      </>
    )
    return (
      <li key={b.id} className={`check-row${b.booked ? ' done' : ''}`}>
        <input type="checkbox" checked={b.booked} aria-label={`${b.name}: booked`} onChange={(e) => b.setBooked(e.target.checked)} />
        {b.dayId ? (
          <a className="check-body" href={href({ page: 'day', tripId: trip.id, dayId: b.dayId })}>
            {content}
          </a>
        ) : (
          <span className="check-body">{content}</span>
        )}
      </li>
    )
  }

  return (
    <section className="card checklist-card">
      <h2>Checklist</h2>
      {booking.length > 0 && (
        <div className="to-book">
          <p className="to-book-head">
            To book · {done.length} of {booking.length} booked
          </p>
          <span className={`progress${left.length === 0 ? ' done' : ''}`} aria-hidden="true">
            <span style={{ width: `${(done.length / booking.length) * 100}%` }} />
          </span>
          {left.length > 0 && <ul className="checklist">{left.map(renderBooking)}</ul>}
          {done.length > 0 && (
            <details className="to-book-done">
              <summary>{done.length} booked</summary>
              <ul className="checklist">{done.map(renderBooking)}</ul>
            </details>
          )}
        </div>
      )}
      <p className="to-book-head">Reminders</p>
      {items.length === 0 && <p className="muted small">Things to do or buy: “Book hotels 4–6 months before”, “Pocket Wi-Fi”…</p>}
      <ul className="checklist">
        {sorted.map((item) => (
          <li key={item.id} className={`check-row${item.done ? ' done' : ''}`}>
            <input
              type="checkbox"
              checked={item.done}
              aria-label={item.text}
              onChange={(e) => save(items.map((i) => (i.id === item.id ? { ...i, done: e.target.checked } : i)))}
            />
            <span className="check-body">
              <span className="check-text">
                <span>{item.text}</span>
                {item.due && <span className={`small ${!item.done && item.due < now ? 'warning' : 'muted'}`}>by {formatDate(item.due)}</span>}
              </span>
              <button
                type="button"
                className="ghost icon-button check-remove"
                aria-label={`Remove “${item.text}”`}
                title="Remove"
                onClick={() => save(items.filter((i) => i.id !== item.id))}
              >
                <Icon name="close" size={16} />
              </button>
            </span>
          </li>
        ))}
      </ul>
      <form className="checklist-add" onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a reminder…" aria-label="New reminder" />
        {/* The due date is optional: a calendar button opens the date picker; the date shows below once chosen. */}
        <button
          type="button"
          className={`icon-button checklist-due${due ? ' set' : ''}`}
          aria-label="Due date (optional)"
          title="Due date (optional)"
          onClick={() => dueInput.current?.showPicker()}
        >
          <Icon name="calendar" size={18} />
        </button>
        <input ref={dueInput} type="date" className="checklist-due-input" value={due} onChange={(e) => setDue(e.target.value)} tabIndex={-1} aria-hidden="true" />
        <button type="submit" className="primary icon-button" disabled={!text.trim()} aria-label="Add">
          <Icon name="plus" size={18} />
        </button>
      </form>
      {due && (
        <p className="checklist-due-chosen small muted">
          By {formatDate(due)}
          <button type="button" className="link-quiet" onClick={() => setDue('')} aria-label="Remove the due date">
            <Icon name="close" size={14} />
          </button>
        </p>
      )}
    </section>
  )
}
