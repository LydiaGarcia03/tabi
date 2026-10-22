import { useState, type FormEvent } from 'react'
import { AIRLINES, findAirline } from '../data/airlines'
import { daysBetween } from '../dates'
import type { Expense, Journey, Trip } from '../db/model'
import { formatMoney } from '../format'
import {
  CABIN_HINTS,
  cleanJourney,
  JOURNEY_ICON,
  JOURNEY_LABEL,
  JOURNEY_MODES,
  journeyCarriers,
  mergeLegs,
  splitIntoLegs,
  withLegSummary,
} from '../planning/journeys'
import { BaggageBreakdown } from './AirlineGuide'
import { ExtraInfo, JourneyLegsEditor, legsHaveDetails } from './JourneyLegs'

/** "+ Connections" with what it does on a second line ("choose the airlines on the way"). */
function ToggleLink({ sign, label, hint, onClick }: { sign: '+' | '−'; label: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" className="link toggle-link" onClick={onClick}>
      <span>
        {sign} {label}
      </span>
      <span className="muted small">{hint}</span>
    </button>
  )
}

/** The journey without departure times, numbers or aircraft (and each leg's times). */
function withoutDetails(journey: Journey): Journey {
  return {
    ...journey,
    time: undefined,
    number: undefined,
    legs: journey.legs?.map(({ departTime, arriveTime, departDay, arriveDay, minutes, number, aircraft, ...leg }) => leg),
  }
}

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
  const cleaned = cleanJourney(journey)
  const valid = cleaned.from !== '' && cleaned.to !== '' && price.trim() !== '' && Number.isFinite(priceValue) && priceValue >= 0

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    await onSave({
      category: 'transport',
      description: `${cleaned.from} → ${cleaned.to}`,
      amount: { amount: priceValue, currency },
      notes: notes.trim() || undefined,
      journey: cleaned,
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

/**
 * Mode, route, time, carrier and class: shared by bookings and transport options.
 * `planning` (options): the departure time and number are only known once the
 * ticket is bought, so they stay folded under "+ Extra info" (with
 * connections: each leg's times, numbers and the layovers); the fare is in the
 * option's fares table, with its price.
 */
export function JourneyFields({
  journey,
  onChange,
  planning = false,
}: {
  journey: Journey
  onChange: (journey: Journey) => void
  planning?: boolean
}) {
  const set = (changes: Partial<Journey>) => onChange({ ...journey, ...changes })
  const isFlight = journey.mode === 'flight'
  const hasLegs = !!journey.legs?.length
  const [details, setDetails] = useState(!planning || !!journey.time || !!journey.number || legsHaveDetails(journey))
  const numberLabel = isFlight ? 'Flight number' : journey.mode === 'shinkansen' || journey.mode === 'train' ? 'Train' : 'Number'
  const detailsLabel = 'Extra info'
  const detailsHint = hasLegs
    ? isFlight
      ? 'times, flight numbers, aircraft, layovers'
      : 'times, numbers and layovers'
    : isFlight
      ? 'departure time, flight number'
      : `departure time and ${numberLabel.toLowerCase()}`
  // With legs, the main airline is picked among theirs (the one flown longest by default).
  const airline = isFlight ? findAirline(hasLegs ? withLegSummary(journey).carrier : journey.carrier) : undefined

  // Right under the origin and destination: "+" opens more fields below, the same button as "−" closes them.
  const toggles = (
    <div className="journey-more">
      {hasLegs ? (
        <ToggleLink sign="−" label="Connections" hint={isFlight ? 'back to a direct flight' : 'back to a direct journey'} onClick={() => onChange(mergeLegs(journey))} />
      ) : (
        <ToggleLink
          sign="+"
          label="Connections"
          hint={isFlight ? 'choose the airlines on the way' : 'the stretches on the way'}
          onClick={() => onChange(splitIntoLegs(journey))}
        />
      )}
      {!details ? (
        <ToggleLink sign="+" label={detailsLabel} hint={detailsHint} onClick={() => setDetails(true)} />
      ) : (
        planning && (
          <ToggleLink
            sign="−"
            label={detailsLabel}
            hint={`hide and clear the ${detailsHint}`}
            onClick={() => {
              setDetails(false)
              onChange(withoutDetails(journey))
            }}
          />
        )
      )}
    </div>
  )

  return (
    <>
      {isFlight && (
        <datalist id="airline-names">
          {AIRLINES.map((a) => (
            <option key={a.name} value={a.name} />
          ))}
        </datalist>
      )}
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
      <label>
        {hasLegs ? 'Date of the first departure' : 'Date'}
        <input type="date" value={journey.date ?? ''} onChange={(e) => set({ date: e.target.value || undefined })} />
      </label>
      {hasLegs ? (
        <JourneyLegsEditor journey={journey} onChange={onChange} detailed={details} toggles={toggles} boxed={planning} />
      ) : (
        <>
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
          {toggles}
          <div className="field-row">
            <label>
              {isFlight ? 'Airline' : 'Operator'}
              <input
                value={journey.carrier ?? ''}
                list={isFlight ? 'airline-names' : undefined}
                onChange={(e) => set({ carrier: e.target.value })}
                placeholder={isFlight ? 'Emirates' : 'JR Central'}
              />
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
          {details && (
            <ExtraInfo show={planning}>
              <div className="field-row">
                <label>
                  Departure time
                  <input type="time" value={journey.time ?? ''} onChange={(e) => set({ time: e.target.value || undefined })} />
                </label>
                <label>
                  {numberLabel}
                  <input value={journey.number ?? ''} onChange={(e) => set({ number: e.target.value })} placeholder={isFlight ? 'EK262' : 'Nozomi 21'} />
                </label>
              </div>
            </ExtraInfo>
          )}
          {journey.stops && <p className="muted small">Connections noted: {journey.stops}.</p>}
        </>
      )}
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
        {/* Options keep their fares (with prices) in their own table. */}
        {isFlight && !planning && (
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
      </div>
      {isFlight && <BaggageBreakdown carriers={hasLegs ? journeyCarriers(journey) : [journey.carrier ?? '']} main={airline?.name} fare={journey.fare} />}
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
    <div className="row sheet-actions">
      <button type="submit" className="primary" disabled={!valid}>
        {label}
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}
