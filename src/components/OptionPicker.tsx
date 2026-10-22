import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../db/db'
import type { OptionKind, TripOption } from '../db/model'
import { addOptionToDay } from '../db/options'
import { DAY_KINDS, KIND_ICON, KIND_PLURAL } from '../planning/optionKinds'
import { Icon } from './Icon'

const NO_CITY = 'No city'

interface Props {
  tripId: string
  dayId: string
  /** Cities of the day (two on a travel day): their options come first. */
  cities: string[]
  onAdded: (placeId: string) => void
}

/** Adds one of the trip's options (not discarded) to the day, picked from a dropdown. No API call. */
export function OptionPicker({ tripId, dayId, cities, onAdded }: Props) {
  const options = useLiveQuery(() => db.options.where('tripId').equals(tripId).toArray(), [tripId])
  const placeIds = useLiveQuery(async () => new Set(await db.places.where('tripId').equals(tripId).primaryKeys()), [tripId])
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<OptionKind | null>(null)
  const [optionId, setOptionId] = useState('')
  const [error, setError] = useState('')

  if (!options || !placeIds) return null
  const available = options.filter((o) => DAY_KINDS.includes(o.kind) && o.status !== 'discarded')
  if (available.length === 0) return null

  const count = (k: OptionKind) => available.filter((o) => o.kind === k).length
  const shownKind = kind ?? DAY_KINDS.find((k) => count(k) > 0)!
  const ofKind = available.filter((o) => o.kind === shownKind)
  const selected = ofKind.find((o) => o.id === optionId)
  const inPlan = (o: TripOption) => o.placeId != null && placeIds.has(o.placeId)

  // Grouped by city: the day's cities first, then the others alphabetically.
  const groups = new Map<string, TripOption[]>()
  for (const o of ofKind) groups.set(o.city || NO_CITY, [...(groups.get(o.city || NO_CITY) ?? []), o])
  const rank = (city: string) => (cities.includes(city) ? cities.indexOf(city) : city === NO_CITY ? 1000 : 100)
  const sortedGroups = [...groups].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))

  async function add() {
    if (!selected) return
    try {
      onAdded(await addOptionToDay(selected, dayId))
      setOptionId('')
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (!open) {
    return (
      <button type="button" className="option-picker-open" onClick={() => setOpen(true)}>
        <Icon name="sparkle" /> Choose from my options
      </button>
    )
  }

  return (
    <div className="option-picker">
      <div className="segmented" role="radiogroup" aria-label="Kind of option">
        {DAY_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={shownKind === k}
            className={shownKind === k ? 'active' : ''}
            disabled={count(k) === 0}
            onClick={() => {
              setKind(k)
              setOptionId('')
              setError('')
            }}
          >
            <Icon name={KIND_ICON[k]} size={16} /> {KIND_PLURAL[k]} <span className="count">{count(k)}</span>
          </button>
        ))}
      </div>
      <div className="row">
        <select
          value={optionId}
          onChange={(e) => {
            setOptionId(e.target.value)
            setError('')
          }}
          aria-label={`Pick one of the ${KIND_PLURAL[shownKind].toLowerCase()}`}
        >
          <option value="">Pick one of the {KIND_PLURAL[shownKind].toLowerCase()}…</option>
          {sortedGroups.map(([city, list]) => (
            <optgroup key={city} label={city}>
              {list.map((o) => (
                <option key={o.id} value={o.id} disabled={o.lat == null || o.lng == null}>
                  {/* Inside a dropdown only text works: a plain star character, not an emoji. */}
                  {o.status === 'favorite' ? '★ ' : ''}
                  {o.name}
                  {o.category ? ` · ${o.category}` : ''}
                  {o.lat == null || o.lng == null ? ' (not on the map yet)' : inPlan(o) ? ' (already in the itinerary)' : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button type="button" className="primary" disabled={!selected} onClick={add}>
          Add
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <p className="muted small">
        Options without a location can't be added: locate them in Options first.{' '}
        <button type="button" className="link" onClick={() => setOpen(false)}>
          Close
        </button>
      </p>
    </div>
  )
}
