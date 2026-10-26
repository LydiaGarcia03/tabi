import { useEffect, useState, type FormEvent } from 'react'
import type { Journey, OptionKind, Trip, TripOption } from '../db/model'
import { addOption, deleteOption, updateOption } from '../db/options'
import { optionPhotos, setOptionPhotos } from '../db/photos'
import { findAirline } from '../data/airlines'
import { cleanFares, faresOf } from '../planning/fares'
import { cleanJourney, JOURNEY_LABEL, journeyCarriers, withLegSummary } from '../planning/journeys'
import { describePriced, travelersOf } from '../budget'
import {
  BOOK_AHEAD_FOR,
  BOOK_AHEAD_LABEL,
  CATEGORY_PRESETS,
  DAY_KINDS,
  KIND_ICON,
  KIND_SINGULAR,
  OPTION_KINDS,
  PRICE_LABEL,
} from '../planning/optionKinds'
import type { Money } from '../routing/types'
import { JourneyFields } from './BookingForms'
import { FaresEditor } from './FaresEditor'
import { Icon } from './Icon'
import { LocateSearch } from './LocateSearch'
import { OpeningHoursEditor } from './OpeningHoursEditor'
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
  const [forGroup, setForGroup] = useState(option?.priceForGroup ?? false)
  // Empty = everyone on the trip.
  const [people, setPeople] = useState(option?.people != null ? String(option.people) : '')
  const [rating, setRating] = useState(option?.rating)
  const [hours, setHours] = useState(option?.hours ?? '')
  const [openingHours, setOpeningHours] = useState(option?.openingHours)
  const [bookAhead, setBookAhead] = useState(option?.bookAhead != null)
  const [link, setLink] = useState(option?.link ?? '')
  const [notes, setNotes] = useState(option?.notes ?? '')
  const [location, setLocation] = useState(
    option?.lat != null && option.lng != null
      ? { lat: option.lat, lng: option.lng, address: option.address, googlePlaceId: option.googlePlaceId, googleFetchedAt: option.googleFetchedAt }
      : null,
  )
  const [journey, setJourney] = useState<Journey>(option?.journey ?? { mode: 'flight', from: '', to: '' })
  const [fares, setFares] = useState(() => faresOf(option))
  const [fareIndex, setFareIndex] = useState(option?.fareIndex ?? 0)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Saved only when changed, so saving before they finish loading never drops them.
  const [photos, setPhotos] = useState<Blob[] | null>(null)
  const [savedPhotos, setSavedPhotos] = useState<Blob[] | null>(option ? null : [])

  useEffect(() => {
    if (option) void optionPhotos(option.id).then((list) => setSavedPhotos(list.map((p) => p.image)))
  }, [option])

  const isTransport = kind === 'transport'
  // Restaurants, places and shops: opening hours and a price per person (or for the group).
  const hasHours = DAY_KINDS.includes(kind)
  const travelers = travelersOf(trip)
  const peopleCount = Number(people)
  const peopleGoing = people.trim() !== '' && Number.isInteger(peopleCount) && peopleCount >= 1 && peopleCount !== travelers ? peopleCount : undefined
  const bookAheadKind = BOOK_AHEAD_FOR[kind]
  const cleaned = cleanJourney(journey)
  const valid = isTransport ? cleaned.from !== '' && cleaned.to !== '' : name.trim() !== ''
  const currencies = [...new Set([trip.displayCurrency, trip.baseCurrency, currency])]
  // Fare names of the main airline, from the airline guide.
  const fareSuggestions =
    journey.mode === 'flight' ? (findAirline(withLegSummary(journey).carrier)?.checked.map((r) => r.fare) ?? []) : []

  const money = (text: string): Money | undefined => {
    const amount = Number(text)
    return text.trim() !== '' && Number.isFinite(amount) && amount >= 0 ? { amount, currency } : undefined
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    const saved = cleanFares(
      fares.map((f) => (f.price ? { ...f, price: { ...f.price, currency } } : f)),
      fareIndex,
    )
    const fare = saved.fares[saved.index]
    const values = {
      kind,
      // A transport option is named after its carrier (or mode) and route.
      name: isTransport ? transportName(cleaned) : name.trim(),
      city: isTransport ? undefined : city.trim() || undefined,
      category: isTransport ? undefined : category.trim() || undefined,
      price: isTransport ? fare?.price : money(price),
      priceForGroup: (hasHours && forGroup) || undefined,
      people: hasHours && !forGroup ? peopleGoing : undefined,
      fares: isTransport && saved.fares.length ? saved.fares : undefined,
      fareIndex: isTransport && saved.fares.length > 1 ? saved.index : undefined,
      totalPrice: kind === 'hotel' ? money(total) : undefined,
      rating,
      hours: (hasHours && hours.trim()) || undefined,
      openingHours: hasHours ? openingHours : undefined,
      bookAhead: bookAhead ? bookAheadKind : undefined,
      link: link.trim() || undefined,
      notes: notes.trim() || undefined,
      lat: isTransport ? undefined : location?.lat,
      lng: isTransport ? undefined : location?.lng,
      address: isTransport ? undefined : location?.address,
      googlePlaceId: isTransport ? undefined : location?.googlePlaceId,
      googleFetchedAt: isTransport ? undefined : location?.googleFetchedAt,
      journey: isTransport ? { ...cleaned, fare: fare?.name } : undefined,
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
              <Icon name={KIND_ICON[k]} size={16} /> {KIND_SINGULAR[k]}
            </button>
          ))}
        </div>
      )}

      {isTransport ? (
        // The marked fare drives the baggage shown under the journey.
        <JourneyFields journey={{ ...journey, fare: fares[fareIndex]?.name }} onChange={setJourney} planning />
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

      {isTransport && (
        <FaresEditor
          fares={fares}
          index={fareIndex}
          currency={currency}
          suggestions={fareSuggestions}
          onChange={(next, index) => {
            setFares(next)
            setFareIndex(index)
          }}
        />
      )}
      <div className="field-row">
        {!isTransport && (
          <label>
            {hasHours && forGroup ? 'Price for the group' : PRICE_LABEL[kind]}
            <input type="number" min="0" step="any" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
        )}
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
      {hasHours && (
        <div className="field-row">
          <label>
            Price is
            <select value={forGroup ? 'group' : 'person'} onChange={(e) => setForGroup(e.target.value === 'group')}>
              <option value="person">Per person</option>
              <option value="group">For the group</option>
            </select>
          </label>
          {!forGroup && (
            <label>
              People going
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                placeholder={String(travelers)}
                value={people}
                onChange={(e) => setPeople(e.target.value)}
              />
            </label>
          )}
        </div>
      )}
      {hasHours && money(price) && (forGroup || travelers > 1 || peopleGoing != null) && (
        <p className="muted small">
          In the budget: {describePriced({ price: money(price), forGroup, people: peopleGoing }, travelers)}
        </p>
      )}

      {bookAheadKind && (
        <label className="check">
          <input type="checkbox" checked={bookAhead} onChange={(e) => setBookAhead(e.target.checked)} />
          {BOOK_AHEAD_LABEL[bookAheadKind]}
        </label>
      )}

      <div className="field">
        <span className="field-label">Your rating</span>
        <Stars value={rating} onChange={setRating} />
      </div>
      {hasHours && (
        <>
          <OpeningHoursEditor value={openingHours} onChange={setOpeningHours} />
          {hours && (
            // Typed as free text before the hours editor existed.
            <p className="muted small">
              Hours typed before: {hours}{' '}
              <button type="button" className="link" onClick={() => setHours('')}>
                Remove
              </button>
            </p>
          )}
        </>
      )}

      <label>
        Notes
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="FamilyMart downstairs, 350 m from Namba Station, staff speaks English…"
        />
      </label>
      {!isTransport && (
        <div className="field">
          <span className="field-label">Location on map</span>
          {location ? (
            <p className="small">
              <Icon name="pin" size={15} /> {location.address ?? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`}{' '}
              <button type="button" className="link" onClick={() => setLocation(null)}>
                Change
              </button>
            </p>
          ) : (
            <LocateSearch
              initialQuery={name}
              near={city || undefined}
              onPick={(p) =>
                setLocation({ lat: p.lat, lng: p.lng, address: p.address, googlePlaceId: p.googlePlaceId, googleFetchedAt: new Date().toISOString() })
              }
            />
          )}
        </div>
      )}

      {savedPhotos && <PhotoPicker images={photos ?? savedPhotos} name={name || 'Photos'} onChange={setPhotos} />}
      <label>
        Link
        <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
      </label>

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
