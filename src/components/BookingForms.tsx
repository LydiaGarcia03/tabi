import { useState, type FormEvent } from 'react'
import { AIRLINES, findAirline } from '../data/airlines'
import { daysBetween } from '../dates'
import type { Expense, Journey, Trip } from '../db/model'
import { formatMoney } from '../format'
import { CABIN_HINTS, cleanJourney, JOURNEY_ICON, JOURNEY_LABEL, JOURNEY_MODES } from '../planning/journeys'
import { BaggageSummary } from './AirlineGuide'

/** What a booking form saves (the trip and day are added by the caller). */
export type BookingValues = Pick<Expense, 'category' | 'description' | 'amount' | 'notes'> &
  Partial<Pick<Expense, 'hotel' | 'journey'>>

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

/** A trip between cities (flight, shinkansen…) booked as a trip-wide expense. */
export function JourneyForm({ trip, expense, onSave, onCancel }: FormProps) {
  const [journey, setJourney] = useState<Journey>(
    expense?.journey ?? { mode: 'flight', from: '', to: '', date: trip.startDate },
  )
  const [price, setPrice] = useState(expense ? String(expense.amount.amount) : '')
  const [currency, setCurrency] = useState(expense?.amount.currency ?? trip.displayCurrency)
  const [notes, setNotes] = useState(expense?.notes ?? '')
  const priceValue = Number(price)
  const valid =
    journey.from.trim() !== '' && journey.to.trim() !== '' && price.trim() !== '' && Number.isFinite(priceValue) && priceValue >= 0

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    await onSave({
      category: 'transport',
      description: `${journey.from.trim()} → ${journey.to.trim()}`,
      amount: { amount: priceValue, currency },
      notes: notes.trim() || undefined,
      journey: cleanJourney(journey),
    })
  }

  return (
    <form className="expense-form booking-form" onSubmit={submit}>
      <h4>
        {JOURNEY_ICON[journey.mode]} {JOURNEY_LABEL[journey.mode]}
      </h4>
      <JourneyFields journey={journey} onChange={setJourney} />
      <div className="field-row">
        <label>
          Price
          <input type="number" min="0" step="any" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <CurrencySelect trip={trip} value={currency} onChange={setCurrency} />
      </div>
      <label>
        Notes
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Booking code, seats, per person…" />
      </label>
      <FormButtons valid={valid} label="Save" onCancel={onCancel} />
    </form>
  )
}

/** Mode, route, time, carrier and class: shared by bookings and transport options. */
export function JourneyFields({ journey, onChange }: { journey: Journey; onChange: (journey: Journey) => void }) {
  const set = (changes: Partial<Journey>) => onChange({ ...journey, ...changes })
  const isFlight = journey.mode === 'flight'
  const airline = isFlight ? findAirline(journey.carrier) : undefined

  return (
    <>
      <div className="segmented" role="radiogroup" aria-label="Mode">
        {JOURNEY_MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={journey.mode === m}
            className={journey.mode === m ? 'active' : ''}
            onClick={() => set({ mode: m })}
          >
            {JOURNEY_ICON[m]} {JOURNEY_LABEL[m]}
          </button>
        ))}
      </div>
      <div className="field-row">
        <label>
          From
          <input value={journey.from} onChange={(e) => set({ from: e.target.value })} placeholder={isFlight ? 'Navegantes (NVT)' : 'Shin-Osaka'} />
        </label>
        <label>
          To
          <input value={journey.to} onChange={(e) => set({ to: e.target.value })} placeholder={isFlight ? 'Osaka (KIX)' : 'Tokyo'} />
        </label>
      </div>
      <div className="field-row">
        <label>
          Date
          <input type="date" value={journey.date ?? ''} onChange={(e) => set({ date: e.target.value || undefined })} />
        </label>
        <label>
          Departure time
          <input type="time" value={journey.time ?? ''} onChange={(e) => set({ time: e.target.value || undefined })} />
        </label>
        <label>
          Total time (hours)
          <input
            type="number"
            min="0"
            step="0.25"
            inputMode="decimal"
            value={journey.durationHours ?? ''}
            onChange={(e) => set({ durationHours: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
        </label>
      </div>
      <div className="field-row">
        <label>
          {isFlight ? 'Airline' : 'Operator'}
          <input
            value={journey.carrier ?? ''}
            list={isFlight ? 'airline-names' : undefined}
            onChange={(e) => set({ carrier: e.target.value })}
            placeholder={isFlight ? 'Emirates' : 'JR Central'}
          />
          {isFlight && (
            <datalist id="airline-names">
              {AIRLINES.map((a) => (
                <option key={a.name} value={a.name} />
              ))}
            </datalist>
          )}
        </label>
        <label>
          {isFlight ? 'Flight number' : journey.mode === 'shinkansen' || journey.mode === 'train' ? 'Train' : 'Number'}
          <input value={journey.number ?? ''} onChange={(e) => set({ number: e.target.value })} placeholder={isFlight ? 'EK262' : 'Nozomi 21'} />
        </label>
      </div>
      <div className="field-row">
        <label>
          Class
          <input value={journey.cabin ?? ''} list={`cabins-${journey.mode}`} onChange={(e) => set({ cabin: e.target.value })} />
          <datalist id={`cabins-${journey.mode}`}>
            {CABIN_HINTS[journey.mode].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        {isFlight && (
          <label>
            Fare
            <input
              value={journey.fare ?? ''}
              list="fare-names"
              onChange={(e) => set({ fare: e.target.value })}
              placeholder="Saver, Classic, Light…"
            />
            {airline && (
              <datalist id="fare-names">
                {airline.checked.map((r) => (
                  <option key={r.fare} value={r.fare} />
                ))}
              </datalist>
            )}
          </label>
        )}
        <label>
          Connections
          <input value={journey.stops ?? ''} onChange={(e) => set({ stops: e.target.value })} placeholder={isFlight ? 'via Dubai' : 'Direct'} />
        </label>
      </div>
      {airline && <BaggageSummary airline={airline} fare={journey.fare} />}
    </>
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
