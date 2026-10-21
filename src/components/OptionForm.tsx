import { useEffect, useState, type FormEvent } from 'react'
import type { Journey, OptionKind, Trip, TripOption } from '../db/model'
import { addOption, deleteOption, updateOption } from '../db/options'
import { optionPhotos, setOptionPhotos } from '../db/photos'
import { cleanJourney, JOURNEY_LABEL, journeyCarriers } from '../planning/journeys'
import { CATEGORY_PRESETS, KIND_ICON, KIND_SINGULAR, OPTION_KINDS, PRICE_LABEL } from '../planning/optionKinds'
import type { Money } from '../routing/types'
import { JourneyFields } from './BookingForms'
import { LocateSearch } from './LocateSearch'
import { PhotoPicker } from './Photos'
import { Stars } from './Stars'

interface Props {
  trip: Trip
  /** Cities to suggest (from the trip's stays and other options). */
  cities: string[]
  option?: TripOption
  defaults?: { kind?: OptionKind; city?: string }
  onDone: () => void
}

/** "Emirates · Navegantes → Osaka", "Gol + Qatar Airways · Navegantes → Osaka", "Shinkansen · Osaka → Tokyo" */
function transportName(journey: Journey): string {
  return `${journeyCarriers(journey).join(' + ') || JOURNEY_LABEL[journey.mode]} · ${journey.from} → ${journey.to}`
}

/** The type as one-tap choices (like the transport modes), or typed with "Other…". */
function TypePicker({ presets, value, onChange }: { presets: string[]; value: string; onChange: (value: string) => void }) {
  const [typing, setTyping] = useState(value !== '' && !presets.includes(value))
  return (
    <div className="field">
      <span className="field-label">Type</span>
      <div className="chip-picker" role="radiogroup" aria-label="Type">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={!typing && value === p}
            className={!typing && value === p ? 'active' : ''}
            onClick={() => {
              setTyping(false)
              onChange(value === p ? '' : p)
            }}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={typing}
          className={typing ? 'active' : ''}
          onClick={() => {
            setTyping(!typing)
            onChange('')
          }}
        >
          Other…
        </button>
      </div>
      {typing && <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Type it" aria-label="Type" autoFocus />}
    </div>
  )
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
  const [journey, setJourney] = useState<Journey>(option?.journey ?? { mode: 'flight', from: '', to: '' })
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Saved only when changed, so saving before they finish loading never drops them.
  const [photos, setPhotos] = useState<Blob[] | null>(null)
  const [savedPhotos, setSavedPhotos] = useState<Blob[] | null>(option ? null : [])

  useEffect(() => {
    if (option) void optionPhotos(option.id).then((list) => setSavedPhotos(list.map((p) => p.image)))
  }, [option])

  const isTransport = kind === 'transport'
  const cleaned = cleanJourney(journey)
  const valid = isTransport ? cleaned.from !== '' && cleaned.to !== '' : name.trim() !== ''
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
      // A transport option is named after its carrier (or mode) and route.
      name: isTransport ? transportName(cleaned) : name.trim(),
      city: isTransport ? undefined : city.trim() || undefined,
      category: isTransport ? undefined : category.trim() || undefined,
      price: money(price),
      totalPrice: kind === 'hotel' ? money(total) : undefined,
      rating,
      hours: hours.trim() || undefined,
      link: link.trim() || undefined,
      notes: notes.trim() || undefined,
      lat: isTransport ? undefined : location?.lat,
      lng: isTransport ? undefined : location?.lng,
      address: isTransport ? undefined : location?.address,
      googlePlaceId: isTransport ? undefined : location?.googlePlaceId,
      googleFetchedAt: isTransport ? undefined : location?.googleFetchedAt,
      journey: isTransport ? cleaned : undefined,
    }
    const id = option ? option.id : await addOption({ ...values, tripId: trip.id, status: 'idea' })
    if (option) await updateOption(option.id, values)
    if (photos) await setOptionPhotos({ id, tripId: trip.id }, photos)
    onDone()
  }

  return (
    <form className="option-form" onSubmit={submit}>
      {!option && (
        <div className="segmented" role="radiogroup" aria-label="Kind">
          {OPTION_KINDS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>
              {KIND_ICON[k]} {KIND_SINGULAR[k]}
            </button>
          ))}
        </div>
      )}

      {isTransport ? (
        <JourneyFields journey={journey} onChange={setJourney} planning />
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
        </div>
      )}
      {!isTransport && <TypePicker presets={CATEGORY_PRESETS[kind]} value={category} onChange={setCategory} />}

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
      {savedPhotos && <PhotoPicker images={photos ?? savedPhotos} onChange={setPhotos} />}

      {!isTransport && (
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

      <div className="row wrap sheet-actions">
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
