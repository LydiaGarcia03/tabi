import { useState } from 'react'
import { formatDay } from '../dates'
import type { Day, Place } from '../db/model'
import { deletePlace, movePlaceInDay, movePlaceToDay, updatePlace } from '../db/trips'
import { formatDuration, formatMoney } from '../format'
import { placeUrl } from '../googleMapsLinks'
import { DEFAULT_VISIT_MINUTES, describeWindow, timeConflict, weekdayOf, windowFor } from '../planning/hours'
import { Icon } from './Icon'
import { OpeningHoursEditor } from './OpeningHoursEditor'
import { useDraft } from '../useDraft'

interface Props {
  place: Place
  index: number
  count: number
  days: Day[]
  /** Trip currency, used for a new cost. */
  currency: string
  /** Date of the day, "YYYY-MM-DD" (for that weekday's opening hours). */
  date: string
  selected: boolean
  onSelect: () => void
}

export function PlaceItem({ place, index, count, days, currency, date, selected, onSelect }: Props) {
  const hours = describeWindow(windowFor(place.openingHours, weekdayOf(date)))
  const conflict = timeConflict(place, date)
  return (
    <li className={`place-item${selected ? ' selected' : ''}`}>
      <button type="button" className="place-header" onClick={onSelect} aria-expanded={selected}>
        <span className="place-number">
          <span>{index + 1}</span>
        </span>
        <span className="place-title">
          <span className="place-name">{place.name}</span>
          {(place.plannedTime || place.cost || hours || place.visitMinutes) && (
            <span className="place-meta">
              {place.plannedTime && (
                <span className="meta">
                  <Icon name="clock" size={14} /> {place.plannedTime}
                </span>
              )}
              {place.visitMinutes != null && <span className="meta">{formatDuration(place.visitMinutes)} visit</span>}
              {hours && (
                <span className="meta">
                  <Icon name="door" size={14} /> {hours}
                </span>
              )}
              {place.cost && (
                <span className="meta">
                  <Icon name="wallet" size={14} /> {formatMoney(place.cost)}
                </span>
              )}
            </span>
          )}
          {conflict && <span className="warning small">⚠ {conflict}</span>}
          {!selected && place.notes && <span className="muted small place-notes-preview">{place.notes}</span>}
        </span>
        <span className="place-chevron" aria-hidden="true">
          <Icon name="down" size={16} />
        </span>
      </button>
      {selected && (
        <PlaceEditor key={place.id} place={place} index={index} count={count} days={days} currency={currency} date={date} />
      )}
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
  const [visit, setVisit] = useDraft(place.visitMinutes != null ? String(place.visitMinutes) : '', (value) => {
    const minutes = Number(value)
    if (value.trim() === '') void updatePlace(place.id, { visitMinutes: undefined })
    else if (Number.isFinite(minutes) && minutes >= 0) void updatePlace(place.id, { visitMinutes: Math.round(minutes) })
  })
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="place-editor">
      {place.address && <p className="muted small">{place.address}</p>}
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="field-row">
        <label>
          Planned time
          <input
            type="time"
            value={place.plannedTime ?? ''}
            onChange={(e) => updatePlace(place.id, { plannedTime: e.target.value || undefined })}
          />
        </label>
        <label>
          Visit (min)
          <input
            type="number"
            min="0"
            step="5"
            inputMode="numeric"
            placeholder={String(DEFAULT_VISIT_MINUTES)}
            value={visit}
            onChange={(e) => setVisit(e.target.value)}
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
      </div>
      <OpeningHoursEditor value={place.openingHours} onChange={(openingHours) => updatePlace(place.id, { openingHours })} />
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
      <div className="row wrap place-actions">
        <button type="button" disabled={index === 0} onClick={() => movePlaceInDay(place.dayId, place.id, -1)}>
          ↑ Up
        </button>
        <button type="button" disabled={index === count - 1} onClick={() => movePlaceInDay(place.dayId, place.id, 1)}>
          ↓ Down
        </button>
        <a className="button" href={placeUrl(place)} target="_blank" rel="noreferrer">
          <Icon name="external" size={16} /> Google Maps
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
