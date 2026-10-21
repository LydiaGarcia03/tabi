import { useState, type FormEvent, type ReactNode } from 'react'
import { CATEGORIES, CATEGORY_ICON, CATEGORY_LABEL } from '../budget'
import { addDays, daysBetween, formatDay } from '../dates'
import { addExpense, deleteExpense, updateExpense } from '../db/expenses'
import type { Expense, ExpenseCategory, Trip } from '../db/model'
import { formatMoney } from '../format'
import { FlightForm, HotelForm, type BookingValues } from './BookingForms'

interface Props {
  trip: Trip
  /** Day the new expenses belong to; omit for trip-wide expenses. */
  dayId?: string
  expenses: Expense[]
}

type Editing = string | 'new' | 'new-hotel' | 'new-flight' | null

/**
 * Free-form expenses with add / edit / delete. Trip-wide lists also have
 * hotels and flights, grouped, with their own forms.
 */
export function ExpenseList({ trip, dayId, expenses }: Props) {
  const [editing, setEditing] = useState<Editing>(null)
  const tripWide = !dayId

  const create = async (values: BookingValues) => {
    await addExpense({ ...values, tripId: trip.id, dayId })
    setEditing(null)
  }
  const update = (id: string) => async (values: BookingValues) => {
    // Clear hotel/flight details the new values don't have.
    await updateExpense(id, { hotel: undefined, flight: undefined, ...values })
    setEditing(null)
  }

  const renderItem = (expense: Expense) => {
    if (editing !== expense.id) {
      return (
        <li key={expense.id}>
          <ExpenseRow expense={expense} onEdit={() => setEditing(expense.id)} />
        </li>
      )
    }
    const props = { trip, expense, onSave: update(expense.id), onCancel: () => setEditing(null) }
    return (
      <li key={expense.id}>
        {expense.hotel ? <HotelForm {...props} /> : expense.flight ? <FlightForm {...props} /> : <ExpenseForm {...props} />}
      </li>
    )
  }

  const flights = expenses.filter((e) => e.flight).sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  const hotels = expenses.filter((e) => e.hotel).sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  const others = expenses.filter((e) => !e.flight && !e.hotel)

  return (
    <div className="expenses">
      {expenses.length === 0 && editing === null && <p className="muted small">No expenses yet.</p>}

      {tripWide && flights.length > 0 && (
        <ExpenseGroup title="Flights">
          <ul className="expense-list">{flights.map(renderItem)}</ul>
        </ExpenseGroup>
      )}
      {tripWide && hotels.length > 0 && (
        <ExpenseGroup title="Lodging" aside={<NightsCoverage trip={trip} hotels={hotels} />}>
          <ul className="expense-list">{hotels.map(renderItem)}</ul>
        </ExpenseGroup>
      )}
      {(others.length > 0 || !tripWide) && (
        <ExpenseGroup title={tripWide && (flights.length || hotels.length) ? 'Other' : undefined}>
          <ul className="expense-list">{(tripWide ? others : expenses).map(renderItem)}</ul>
        </ExpenseGroup>
      )}

      {editing === 'new' && <ExpenseForm trip={trip} defaultCategory={dayId ? 'food' : 'other'} onSave={create} onCancel={() => setEditing(null)} />}
      {editing === 'new-hotel' && <HotelForm trip={trip} onSave={create} onCancel={() => setEditing(null)} />}
      {editing === 'new-flight' && <FlightForm trip={trip} onSave={create} onCancel={() => setEditing(null)} />}

      {editing === null && (
        <div className="row wrap">
          {tripWide && (
            <>
              <button type="button" onClick={() => setEditing('new-flight')}>
                + ✈️ Flight
              </button>
              <button type="button" onClick={() => setEditing('new-hotel')}>
                + 🏨 Hotel
              </button>
            </>
          )}
          <button type="button" onClick={() => setEditing('new')}>
            {tripWide ? '+ Other expense' : '+ Add expense'}
          </button>
        </div>
      )}
    </div>
  )
}

function ExpenseGroup({ title, aside, children }: { title?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="expense-group">
      {title && (
        <div className="expense-group-title">
          <span>{title}</span>
          {aside}
        </div>
      )}
      {children}
    </div>
  )
}

function ExpenseRow({ expense, onEdit }: { expense: Expense; onEdit: () => void }) {
  const { hotel, flight } = expense
  let title = `${CATEGORY_ICON[expense.category]} ${expense.description}`
  const details: string[] = []
  if (hotel) {
    title = `🏨 ${hotel.name}`
    if (hotel.checkIn && hotel.checkOut) details.push(`${formatDay(hotel.checkIn)} → ${formatDay(hotel.checkOut)}`)
    details.push(`${hotel.nights} ${hotel.nights === 1 ? 'night' : 'nights'}`)
    if (hotel.perNight != null) details.push(`${formatMoney({ amount: hotel.perNight, currency: expense.amount.currency })}/night`)
  } else if (flight) {
    title = `✈️ ${flight.from} → ${flight.to}`
    if (flight.date) details.push(`${formatDay(flight.date)}${flight.time ? ` ${flight.time}` : ''}`)
    if (flight.flightNumber) details.push(flight.flightNumber)
  }
  if (expense.notes) details.push(expense.notes)

  return (
    <div className="expense-row">
      <span className="expense-main">
        <span>{title}</span>
        {details.length > 0 && <span className="muted small">{details.join(' · ')}</span>}
      </span>
      <span className="row">
        <strong>{formatMoney(expense.amount)}</strong>
        <button type="button" className="link" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="link" onClick={() => deleteExpense(expense.id)}>
          Remove
        </button>
      </span>
    </div>
  )
}

/** "12 of 14 nights booked": trip nights covered by the hotels' dates. */
function NightsCoverage({ trip, hotels }: { trip: Trip; hotels: Expense[] }) {
  const tripNights = daysBetween(trip.startDate, trip.endDate)
  if (tripNights <= 0) return null
  const booked = new Set<string>()
  let undated = 0
  for (const { hotel } of hotels) {
    if (!hotel) continue
    if (!hotel.checkIn || !hotel.checkOut) {
      undated += hotel.nights
      continue
    }
    // Each night is named by its date; only nights inside the trip count.
    for (let night = hotel.checkIn; night < hotel.checkOut; night = addDays(night, 1)) {
      if (night >= trip.startDate && night < trip.endDate) booked.add(night)
    }
  }
  const complete = booked.size >= tripNights
  return (
    <span className={`small ${complete ? 'muted' : 'warning'}`}>
      {booked.size} of {tripNights} nights booked
      {undated > 0 && ` (+${undated} without dates)`}
    </span>
  )
}

/** Flights by departure, hotels by check-in; undated ones last. */
function sortKey(expense: Expense): string {
  if (expense.flight) return `${expense.flight.date ?? '9999'} ${expense.flight.time ?? ''}`
  return expense.hotel?.checkIn ?? '9999'
}

function ExpenseForm({
  trip,
  expense,
  defaultCategory = 'other',
  onSave,
  onCancel,
}: {
  trip: Trip
  expense?: Expense
  defaultCategory?: ExpenseCategory
  onSave: (values: BookingValues) => Promise<void>
  onCancel: () => void
}) {
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? defaultCategory)
  const [description, setDescription] = useState(expense?.description ?? '')
  const [amount, setAmount] = useState(expense?.amount.amount.toString() ?? '')
  const [currency, setCurrency] = useState(expense?.amount.currency ?? trip.baseCurrency)
  const [notes, setNotes] = useState(expense?.notes ?? '')
  const currencies = [...new Set([trip.baseCurrency, trip.displayCurrency, currency])]
  const value = Number(amount)
  const valid = description.trim() !== '' && amount.trim() !== '' && Number.isFinite(value) && value >= 0

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    await onSave({ category, description: description.trim(), amount: { amount: value, currency }, notes: notes.trim() || undefined })
  }

  return (
    <form className="expense-form" onSubmit={submit}>
      <div className="row wrap">
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="grow">
          Description
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="JR Pass, insurance, lunch…" />
        </label>
      </div>
      <div className="row wrap">
        <label>
          Amount
          <input type="number" min="0" step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          Currency
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Notes
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Paid in advance, per person…" />
      </label>
      <div className="row">
        <button type="submit" className="primary" disabled={!valid}>
          Save expense
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
