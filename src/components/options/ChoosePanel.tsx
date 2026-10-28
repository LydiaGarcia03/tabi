import { useState } from 'react'
import { Icon } from '../Icon'
import { DaySelect } from '../DaySelect'
import { daysBetween } from '../../dates'
import type { Day, Stay, Trip, TripOption } from '../../db/model'
import { addOptionToDay, addOptionToTrip, removeOptionFromItinerary, updateOption } from '../../db/options'
import { stayNights, stayOfCity } from '../../db/stays'
import { travelersOf } from '../../budget'
import { formatMoney } from '../../format'
import { type Scored } from '../../planning/compare'
import { href } from '../../router'
import { currencyChoices } from '../../money/currencies'

/**
 * Un-ticking an option in the itinerary (User's choice 5A from a mock, 2026-10-27): it leaves the itinerary once
 * confirmed. A booked one warns that the real booking may need cancelling.
 */
export function TakeOutPanel({ option, booked, onDone }: { option: TripOption; booked: boolean; onDone: () => void }) {
  const leaves = option.expenseId ? 'the budget and the checklist' : 'its day (with the way there) and the checklist'
  return (
    <div className="choose-panel add-to-day">
      <PanelHead title="Take it out of the itinerary?" onClose={onDone} />
      {booked && <span className="small warning">It's marked as booked: remember to cancel the real booking if you need to.</span>}
      <span className="small muted">It leaves {leaves}; the option stays here, not chosen.</span>
      <div className="row">
        <button type="button" className="primary" onClick={() => removeOptionFromItinerary(option).then(onDone)}>
          Take it out
        </button>
        <button type="button" onClick={onDone}>
          Keep it
        </button>
      </div>
    </div>
  )
}

/** The title of a choose box and its ✕. */
export function PanelHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="add-to-day-head">
      <strong>{title}</strong>
      <button type="button" className="ghost icon-button" aria-label="Cancel" title="Cancel" onClick={onClose}>
        <Icon name="close" size={18} />
      </button>
    </div>
  )
}

/** "1,230.00" or "" for an input. */
const amountText = (money?: { amount: number }) => (money ? String(money.amount) : '')

/** A number typed in a price field, or null when it isn't one. */
function typedAmount(text: string): number | null {
  const value = Number(text)
  return text.trim() !== '' && Number.isFinite(value) && value >= 0 ? value : null
}

export function CurrencyPicker({ trip, value, onChange }: { trip: Trip; value: string; onChange: (currency: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Currency">
      {currencyChoices(trip, value).map((c) => (
        <option key={c}>{c}</option>
      ))}
    </select>
  )
}

/**
 * ✓ on a hotel (User's choice 1B from a mock, 2026-10-27): a small box with the dates (the city's stay)
 * and the price, already editable; "Add" puts it in the itinerary (a stay in the trip, counted in the budget).
 * Not booked: that is a check of its own, ticked later.
 */
export function AddHotelPanel({ item, trip, stays, onDone }: { item: Scored; trip: Trip; stays: Stay[]; onDone: () => void }) {
  const { option } = item
  const stay = stayOfCity(stays, option.city)
  const stayed = stay ? stayNights(stay, trip, stays) : null
  const [checkIn, setCheckIn] = useState(stayed && stayed.nights > 0 ? stayed.checkIn : '')
  const [checkOut, setCheckOut] = useState(stayed && stayed.nights > 0 ? stayed.checkOut : '')
  const [mode, setMode] = useState<'night' | 'total'>(option.totalPrice || !option.price ? 'total' : 'night')
  const [price, setPrice] = useState(amountText(option.totalPrice ?? option.price))
  const [currency, setCurrency] = useState((option.totalPrice ?? option.price)?.currency ?? trip.baseCurrency)
  const nights = checkIn && checkOut ? daysBetween(checkIn, checkOut) : 0
  const value = typedAmount(price)
  const total = value == null ? null : mode === 'night' ? value * nights : value
  const valid = nights > 0 && total != null

  async function add() {
    if (!valid) return
    await addOptionToTrip(option, {
      tripId: trip.id,
      category: 'lodging',
      description: option.name,
      amount: { amount: total, currency },
      notes: option.notes,
      hotel: { name: option.name, checkIn, checkOut, nights, perNight: mode === 'night' ? value! : undefined },
    })
    onDone()
  }

  return (
    <div className="choose-panel add-to-day add-to-trip">
      <PanelHead title="Add to the itinerary" onClose={onDone} />
      <div className="add-stay-dates">
        <label className="date-chip">
          <small>Check-in</small>
          <input type="date" value={checkIn} max={checkOut || undefined} onChange={(e) => setCheckIn(e.target.value)} />
        </label>
        <span className="add-stay-nights">
          <strong>{nights > 0 ? nights : '–'}</strong> {nights === 1 ? 'night' : 'nights'}
        </span>
        <label className="date-chip">
          <small>Check-out</small>
          <input type="date" value={checkOut} min={checkIn || undefined} onChange={(e) => setCheckOut(e.target.value)} />
        </label>
      </div>
      <div className="add-trip-price-field">
        <small>Price</small>
        <div className="add-trip-price">
          <input type="number" min="0" step="any" inputMode="decimal" aria-label="Price" value={price} onChange={(e) => setPrice(e.target.value)} />
          <CurrencyPicker trip={trip} value={currency} onChange={setCurrency} />
          <div className="segmented" role="radiogroup" aria-label="Price is">
            {(
              [
                ['night', '/night'],
                ['total', 'total'],
              ] as const
            ).map(([m, label]) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="add-trip-footer">
        <span className="muted small">
          {checkIn && checkOut && nights <= 0
            ? 'Check-out must be after check-in.'
            : mode === 'night' && valid
              ? `${formatMoney({ amount: total, currency })} for ${nights} ${nights === 1 ? 'night' : 'nights'}`
              : ''}
        </span>
        <button type="button" className="primary" disabled={!valid} onClick={add}>
          Add
        </button>
      </div>
    </div>
  )
}

/** ✓ on a transport option: the same small box, with the date and the price for everyone (tickets × travelers). */
export function AddJourneyPanel({ option, trip, onDone }: { option: TripOption; trip: Trip; onDone: () => void }) {
  const journey = option.journey ?? { mode: 'flight' as const, from: '', to: '' }
  const travelers = travelersOf(trip)
  const [date, setDate] = useState(journey.date ?? '')
  const [price, setPrice] = useState(option.price ? String(option.price.amount * travelers) : '')
  const [currency, setCurrency] = useState(option.price?.currency ?? trip.displayCurrency)
  const value = typedAmount(price)
  const tickets = option.price && travelers > 1 && value === option.price.amount * travelers && currency === option.price.currency

  async function add() {
    if (value == null) return
    await addOptionToTrip(option, {
      tripId: trip.id,
      category: 'transport',
      description: `${journey.from} → ${journey.to}`,
      amount: { amount: value, currency },
      notes: option.notes,
      journey: { ...journey, date: date || undefined },
    })
    onDone()
  }

  return (
    <div className="choose-panel add-to-day add-to-trip">
      <PanelHead title="Add to the itinerary" onClose={onDone} />
      <label className="date-chip">
        <small>{journey.legs?.length ? 'Date of the first departure' : 'Date'}</small>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <div className="add-trip-price-field">
        <small>Total price</small>
        <div className="add-trip-price">
          <input type="number" min="0" step="any" inputMode="decimal" aria-label="Price for everyone" value={price} onChange={(e) => setPrice(e.target.value)} />
          <CurrencyPicker trip={trip} value={currency} onChange={setCurrency} />
        </div>
      </div>
      <div className="add-trip-footer">
        <span className="muted small">{tickets ? `${travelers} tickets × ${formatMoney(option.price!)}` : travelers > 1 ? `For ${travelers} people` : ''}</span>
        <button type="button" className="primary" disabled={value == null} onClick={add}>
          Add
        </button>
      </div>
    </div>
  )
}

/** Picking an option: hotels and transport go into the trip; the rest goes into a day. */
export function ChoosePanel({ item, trip, stays, days, onDone }: { item: Scored; trip: Trip; stays: Stay[]; days: Day[]; onDone: () => void }) {
  const { option } = item
  const stay = stayOfCity(stays, option.city)
  const [dayId, setDayId] = useState(() => days.find((d) => stay && d.date >= stay.startDate)?.id ?? days[0]?.id ?? '')
  const [error, setError] = useState('')

  if (option.kind === 'hotel') return <AddHotelPanel item={item} trip={trip} stays={stays} onDone={onDone} />
  if (option.kind === 'transport') return <AddJourneyPanel option={option} trip={trip} onDone={onDone} />

  // Its own box (User's choice C from a mock, 2026-10-27): one big button (Add), the rest as small links, ✕ to close.
  return (
    <div className="choose-panel add-to-day">
      <div className="add-to-day-head">
        <strong>Add to day</strong>
        <button type="button" className="ghost icon-button" aria-label="Cancel" title="Cancel" onClick={onDone}>
          <Icon name="close" size={18} />
        </button>
      </div>
      {option.lat == null ? (
        <span className="small">Locate it first (Edit → Location) to add it to a day.</span>
      ) : (
        <div className="row">
          <DaySelect days={days} stays={stays} city={option.city} value={dayId} onChange={setDayId} />
          <button
            type="button"
            className="primary"
            disabled={!dayId}
            onClick={async () => {
              try {
                await addOptionToDay(option, dayId)
                onDone()
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err))
              }
            }}
          >
            Add
          </button>
        </div>
      )}
      {error && <span className="error small">{error}</span>}
      <div className="add-to-day-links">
        <button type="button" className="link" onClick={() => updateOption(option.id, { status: 'chosen' }).then(onDone)}>
          Just mark as chosen
        </button>
        {option.lat != null && dayId && (
          <a className="muted" href={href({ page: 'day', tripId: trip.id, dayId })}>
            Open that day
          </a>
        )}
      </div>
    </div>
  )
}
