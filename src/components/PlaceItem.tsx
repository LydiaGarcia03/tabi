import { useState } from 'react'
import { formatDay } from '../dates'
import type { Day, Place } from '../db/model'
import { deletePlace, movePlaceInDay, movePlaceToDay, updatePlace } from '../db/trips'
import { formatMoney } from '../format'
import { useDraft } from '../useDraft'

interface Props {
  place: Place
  index: number
  count: number
  days: Day[]
  /** Trip currency, used for a new cost. */
  currency: string
  selected: boolean
  onSelect: () => void
}

export function PlaceItem({ place, index, count, days, currency, selected, onSelect }: Props) {
  return (
    <li className={`place-item${selected ? ' selected' : ''}`}>
      <button type="button" className="place-header" onClick={onSelect} aria-expanded={selected}>
        <span className="place-number">{index + 1}</span>
        <span className="place-title">
          <strong>{place.name}</strong>
          {place.plannedTime && <span className="muted small"> · {place.plannedTime}</span>}
          {place.cost && <span className="muted small"> · {formatMoney(place.cost)}</span>}
          {!selected && place.notes && <span className="muted small place-notes-preview">{place.notes}</span>}
        </span>
      </button>
      {selected && <PlaceEditor key={place.id} place={place} index={index} count={count} days={days} currency={currency} />}
    </li>
  )
}

function PlaceEditor({ place, index, count, days, currency }: Omit<Props, 'selected' | 'onSelect'>) {
  const [name, setName] = useDraft(place.name, (value) => updatePlace(place.id, { name: value.trim() || place.name }))
  const [notes, setNotes] = useDraft(place.notes, (value) => updatePlace(place.id, { notes: value }))
  const costCurrency = place.cost?.currency ?? currency
  const [cost, setCost] = useDraft(place.cost ? String(place.cost.amount) : '', (value) => {
    const amount = Number(value)
    if (value.trim() === '') void updatePlace(place.id, { cost: undefined })
    else if (Number.isFinite(amount) && amount >= 0) void updatePlace(place.id, { cost: { amount, currency: costCurrency } })
  })
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="place-editor">
      {place.address && <p className="muted small">{place.address}</p>}
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Planned time
        <input
          type="time"
          value={place.plannedTime ?? ''}
          onChange={(e) => updatePlace(place.id, { plannedTime: e.target.value || undefined })}
        />
      </label>
      <label>
        Cost ({costCurrency})
        <input
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          placeholder="Ticket, entry fee…"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
        />
      </label>
      <label>
        Notes
        <textarea
          rows={5}
          value={notes}
          placeholder="History, tickets to have at hand, opening hours, tips…"
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <label>
        Day
        <select value={place.dayId} onChange={(e) => movePlaceToDay(place.id, e.target.value)}>
          {days.map((d) => (
            <option key={d.id} value={d.id}>
              {formatDay(d.date)}
              {d.title ? ` · ${d.title}` : ''}
            </option>
          ))}
        </select>
      </label>
      <div className="row wrap">
        <button type="button" disabled={index === 0} onClick={() => movePlaceInDay(place.dayId, place.id, -1)}>
          ↑ Up
        </button>
        <button type="button" disabled={index === count - 1} onClick={() => movePlaceInDay(place.dayId, place.id, 1)}>
          ↓ Down
        </button>
        <a className="button" href={googleMapsUrl(place)} target="_blank" rel="noreferrer">
          Open in Google Maps
        </a>
        <button
          type="button"
          className={confirmDelete ? 'danger' : ''}
          onClick={() => (confirmDelete ? deletePlace(place.id) : setConfirmDelete(true))}
          onBlur={() => setConfirmDelete(false)}
        >
          {confirmDelete ? 'Tap again to delete' : 'Delete'}
        </button>
      </div>
    </div>
  )
}

function googleMapsUrl(place: Place): string {
  const params = new URLSearchParams({ api: '1', query: `${place.lat},${place.lng}` })
  if (place.googlePlaceId) params.set('query_place_id', place.googlePlaceId)
  return `https://www.google.com/maps/search/?${params}`
}
