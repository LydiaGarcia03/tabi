import { useState, type FormEvent } from 'react'
import { daysBetween } from '../dates'
import type { Expense, Trip } from '../db/model'
import { formatMoney } from '../format'

/** What a booking form saves (the trip and day are added by the caller). */
export type BookingValues = Pick<Expense, 'category' | 'description' | 'amount' | 'notes' | 'hotel' | 'flight'>

interface FormProps {
  trip: Trip
  expense?: Expense
  onSave: (values: BookingValues) => Promise<void>
  onCancel: () => void
}

/** Hotel stay: nights from the dates (or typed), price per night or total. */
export function HotelForm({ trip, expense, onSave, onCancel }: FormProps) {
  const hotel = expense?.hotel
  const [name, setName] = useState(hotel?.name ?? '')
  const [checkIn, setCheckIn] = useState(hotel ? (hotel.checkIn ?? '') : trip.startDate)
  const [checkOut, setCheckOut] = useState(hotel ? (hotel.checkOut ?? '') : trip.endDate)
  const [typedNights, setTypedNights] = useState(hotel && !hotel.checkIn ? String(hotel.nights) : '')
  const [priceMode, setPriceMode] = useState<'night' | 'total'>(hotel && hotel.perNight == null ? 'total' : 'night')
  const [price, setPrice] = useState(
    hotel ? String(hotel.perNight ?? expense!.amount.amount) : '',
  )
  const [currency, setCurrency] = useState(expense?.amount.currency ?? trip.baseCurrency)
  const [notes, setNotes] = useState(expense?.notes ?? '')

  const datesSet = !!checkIn && !!checkOut
  const nights = datesSet ? daysBetween(checkIn, checkOut) : Number(typedNights)
  const priceValue = Number(price)
  const total = priceMode === 'night' ? priceValue * nights : priceValue
  const valid =
    name.trim() !== '' &&
    Number.isInteger(nights) &&
    nights > 0 &&
    price.trim() !== '' &&
    Number.isFinite(priceValue) &&
    priceValue >= 0

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    await onSave({
      category: 'lodging',
      description: name.trim(),
      amount: { amount: total, currency },
      notes: notes.trim() || undefined,
      hotel: {
        name: name.trim(),
        checkIn: datesSet ? checkIn : undefined,
        checkOut: datesSet ? checkOut : undefined,
        nights,
        perNight: priceMode === 'night' ? priceValue : undefined,
      },
    })
  }

  return (
    <form className="expense-form booking-form" onSubmit={submit}>
      <h4>🏨 Hotel</h4>
      <label>
        Hotel name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Hotel Gracery Shinjuku" autoFocus />
      </label>
      <div className="field-row">
        <label>
          Check-in
          <input type="date" value={checkIn} max={checkOut || undefined} onChange={(e) => setCheckIn(e.target.value)} />
        </label>
        <label>
          Check-out
          <input type="date" value={checkOut} min={checkIn || undefined} onChange={(e) => setCheckOut(e.target.value)} />
        </label>
        {!datesSet && (
          <label>
            Nights
            <input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={typedNights}
              onChange={(e) => setTypedNights(e.target.value)}
            />
          </label>
        )}
      </div>
      {datesSet && (
        <p className="muted small">{nights > 0 ? `${nights} ${nights === 1 ? 'night' : 'nights'}` : 'Check-out must be after check-in.'}</p>
      )}
      <div className="segmented" role="radiogroup" aria-label="Price">
        {(
          [
            ['night', 'Price per night'],
            ['total', 'Total price'],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={priceMode === mode}
            className={priceMode === mode ? 'active' : ''}
            onClick={() => setPriceMode(mode)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="field-row">
        <label>
          {priceMode === 'night' ? 'Per night' : 'Total'}
          <input type="number" min="0" step="any" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <CurrencySelect trip={trip} value={currency} onChange={setCurrency} />
      </div>
      {priceMode === 'night' && valid && (
        <p className="small">
          Total: <strong>{formatMoney({ amount: total, currency })}</strong> ({nights} × {formatMoney({ amount: priceValue, currency })})
        </p>
      )}
      <label>
        Notes
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Booking number, breakfast included…" />
      </label>
      <FormButtons valid={valid} label="Save hotel" onCancel={onCancel} />
    </form>
  )
}

/** Flight: from, to, when, flight number and price. */
export function FlightForm({ trip, expense, onSave, onCancel }: FormProps) {
  const flight = expense?.flight
  const [from, setFrom] = useState(flight?.from ?? '')
  const [to, setTo] = useState(flight?.to ?? '')
  const [date, setDate] = useState(flight ? (flight.date ?? '') : trip.startDate)
  const [time, setTime] = useState(flight?.time ?? '')
  const [flightNumber, setFlightNumber] = useState(flight?.flightNumber ?? '')
  const [price, setPrice] = useState(expense ? String(expense.amount.amount) : '')
  const [currency, setCurrency] = useState(expense?.amount.currency ?? trip.displayCurrency)
  const [notes, setNotes] = useState(expense?.notes ?? '')
  const priceValue = Number(price)
  const valid = from.trim() !== '' && to.trim() !== '' && price.trim() !== '' && Number.isFinite(priceValue) && priceValue >= 0

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    await onSave({
      category: 'transport',
      description: `${from.trim()} → ${to.trim()}`,
      amount: { amount: priceValue, currency },
      notes: notes.trim() || undefined,
      flight: {
        from: from.trim(),
        to: to.trim(),
        date: date || undefined,
        time: time || undefined,
        flightNumber: flightNumber.trim() || undefined,
      },
    })
  }

  return (
    <form className="expense-form booking-form" onSubmit={submit}>
      <h4>✈️ Flight</h4>
      <div className="field-row">
        <label>
          From
          <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="GRU · São Paulo" autoFocus />
        </label>
        <label>
          To
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="HND · Tokyo" />
        </label>
      </div>
      <div className="field-row">
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Departure time
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <label>
        Airline / flight number
        <input value={flightNumber} onChange={(e) => setFlightNumber(e.target.value)} placeholder="LATAM LA8070" />
      </label>
      <div className="field-row">
        <label>
          Price
          <input type="number" min="0" step="any" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <CurrencySelect trip={trip} value={currency} onChange={setCurrency} />
      </div>
      <label>
        Notes
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Booking code, baggage, per person…" />
      </label>
      <FormButtons valid={valid} label="Save flight" onCancel={onCancel} />
    </form>
  )
}

function CurrencySelect({ trip, value, onChange }: { trip: Trip; value: string; onChange: (currency: string) => void }) {
  const currencies = [...new Set([trip.baseCurrency, trip.displayCurrency, value])]
  return (
    <label>
      Currency
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {currencies.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
    </label>
  )
}

function FormButtons({ valid, label, onCancel }: { valid: boolean; label: string; onCancel: () => void }) {
  return (
    <div className="row">
      <button type="submit" className="primary" disabled={!valid}>
        {label}
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}
