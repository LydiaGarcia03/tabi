import { useState, type FormEvent } from 'react'
import type { OptionKind, Trip, TripOption } from '../db/model'
import { addOption, deleteOption, updateOption } from '../db/options'
import { CATEGORY_HINT, KIND_ICON, KIND_SINGULAR, OPTION_KINDS, PRICE_LABEL } from '../planning/optionKinds'
import type { Money } from '../routing/types'
import { LocateSearch } from './LocateSearch'
import { Stars } from './Stars'

interface Props {
  trip: Trip
  /** Cities to suggest (from the trip's stays and other options). */
  cities: string[]
  option?: TripOption
  defaults?: { kind?: OptionKind; city?: string }
  onDone: () => void
}

/** Adds or edits something being considered. */
export function OptionForm({ trip, cities, option, defaults, onDone }: Props) {
  const [kind, setKind] = useState<OptionKind>(option?.kind ?? defaults?.kind ?? 'hotel')
  const [name, setName] = useState(option?.name ?? '')
  const [city, setCity] = useState(option?.city ?? defaults?.city ?? '')
  const [category, setCategory] = useState(option?.category ?? '')
  const [price, setPrice] = useState(option?.price ? String(option.price.amount) : '')
  const [total, setTotal] = useState(option?.totalPrice ? String(option.totalPrice.amount) : '')
  const [currency, setCurrency] = useState(option?.price?.currency ?? option?.totalPrice?.currency ?? trip.displayCurrency)
  const [rating, setRating] = useState(option?.rating)
  const [hours, setHours] = useState(option?.hours ?? '')
  const [link, setLink] = useState(option?.link ?? '')
  const [notes, setNotes] = useState(option?.notes ?? '')
  const [location, setLocation] = useState(
    option?.lat != null && option.lng != null
      ? { lat: option.lat, lng: option.lng, address: option.address, googlePlaceId: option.googlePlaceId, googleFetchedAt: option.googleFetchedAt }
      : null,
  )
  const [from, setFrom] = useState(option?.flight?.from ?? '')
  const [to, setTo] = useState(option?.flight?.to ?? '')
  const [date, setDate] = useState(option?.flight?.date ?? '')
  const [time, setTime] = useState(option?.flight?.time ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isFlight = kind === 'flight'
  const valid = isFlight ? from.trim() !== '' && to.trim() !== '' : name.trim() !== ''
  const currencies = [...new Set([trip.displayCurrency, trip.baseCurrency, currency])]

  const money = (text: string): Money | undefined => {
    const amount = Number(text)
    return text.trim() !== '' && Number.isFinite(amount) && amount >= 0 ? { amount, currency } : undefined
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    const values = {
      kind,
      name: isFlight ? name.trim() || `${from.trim()} → ${to.trim()}` : name.trim(),
      city: city.trim() || undefined,
      category: category.trim() || undefined,
      price: money(price),
      totalPrice: kind === 'hotel' ? money(total) : undefined,
      rating,
      hours: hours.trim() || undefined,
      link: link.trim() || undefined,
      notes: notes.trim() || undefined,
      lat: isFlight ? undefined : location?.lat,
      lng: isFlight ? undefined : location?.lng,
      address: isFlight ? undefined : location?.address,
      googlePlaceId: isFlight ? undefined : location?.googlePlaceId,
      googleFetchedAt: isFlight ? undefined : location?.googleFetchedAt,
      flight: isFlight ? { from: from.trim(), to: to.trim(), date: date || undefined, time: time || undefined } : undefined,
    }
    if (option) await updateOption(option.id, values)
    else await addOption({ ...values, tripId: trip.id, status: 'idea' })
    onDone()
  }

  return (
    <form className="card option-form" onSubmit={submit}>
      <h2>{option ? `Edit ${KIND_SINGULAR[kind].toLowerCase()}` : 'New option'}</h2>
      {!option && (
        <div className="segmented" role="radiogroup" aria-label="Kind">
          {OPTION_KINDS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>
              {KIND_ICON[k]} {KIND_SINGULAR[k]}
            </button>
          ))}
        </div>
      )}

      {isFlight ? (
        <>
          <div className="field-row">
            <label>
              From
              <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Navegantes (NVT)" autoFocus />
            </label>
            <label>
              To
              <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Osaka (KIX)" />
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
            <label>
              Airline / route
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="LATAM via Doha" />
            </label>
          </div>
        </>
      ) : (
        <div className="field-row">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Super Hotel Premier Namba" autoFocus />
          </label>
          <label>
            City
            <input value={city} onChange={(e) => setCity(e.target.value)} list="option-cities" placeholder="Osaka" />
            <datalist id="option-cities">
              {cities.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label>
            Type
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={CATEGORY_HINT[kind]} />
          </label>
        </div>
      )}

      <div className="field-row">
        <label>
          {PRICE_LABEL[kind]}
          <input type="number" min="0" step="any" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        {kind === 'hotel' && (
          <label>
            Total for the stay
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder="Optional"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
          </label>
        )}
        <label>
          Currency
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      {kind === 'hotel' && (
        <p className="muted small">Without a total, it is the price per night × the nights of the city's stay (see Cities).</p>
      )}

      <div className="field-row">
        <div className="field">
          <span className="field-label">Your rating</span>
          <Stars value={rating} onChange={setRating} />
        </div>
        {(kind === 'restaurant' || kind === 'place' || kind === 'shop') && (
          <label>
            Opening hours
            <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Lunch and dinner, 10:00–20:00…" />
          </label>
        )}
      </div>

      <label>
        Why / notes
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="FamilyMart downstairs, 350 m from Namba Station, staff speaks English…"
        />
      </label>
      <label>
        Link
        <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
      </label>

      {!isFlight && (
        <div className="field">
          <span className="field-label">Location (for distances and to add it to a day)</span>
          {location ? (
            <p className="small">
              📍 {location.address ?? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`}{' '}
              <button type="button" className="link" onClick={() => setLocation(null)}>
                Change
              </button>
            </p>
          ) : (
            <LocateSearch
              initialQuery={[name, city].filter(Boolean).join(' ')}
              onPick={(p) =>
                setLocation({ lat: p.lat, lng: p.lng, address: p.address, googlePlaceId: p.googlePlaceId, googleFetchedAt: new Date().toISOString() })
              }
            />
          )}
        </div>
      )}

      <div className="row wrap">
        <button type="submit" className="primary" disabled={!valid}>
          {option ? 'Save' : 'Add option'}
        </button>
        <button type="button" onClick={onDone}>
          Cancel
        </button>
        {option && (
          <button
            type="button"
            className={confirmDelete ? 'danger' : 'danger-outline'}
            onClick={async () => {
              if (!confirmDelete) return setConfirmDelete(true)
              await deleteOption(option.id)
              onDone()
            }}
          >
            {confirmDelete ? 'Tap again to delete' : 'Delete'}
          </button>
        )}
      </div>
    </form>
  )
}
