import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type HTMLAttributes } from 'react'
import { describePlaceCost, peopleGoing } from '../budget'
import { formatDay } from '../dates'
import { db } from '../db/db'
import type { Day, Place, PlaceKind } from '../db/model'
import { optionPhotos } from '../db/photos'
import { deletePlace, movePlaceInDay, movePlaceToDay, updatePlace } from '../db/trips'
import { formatDuration } from '../format'
import { placeUrl } from '../googleMapsLinks'
import { DEFAULT_VISIT_MINUTES, describeWindow, timeConflict, weekdayOf, windowFor } from '../planning/hours'
import { BOOK_AHEAD_FOR, BOOK_AHEAD_LABEL, BOOKED_LABEL, KIND_SINGULAR, PLACE_KIND_LABEL, PLACE_KINDS } from '../planning/optionKinds'
import { Icon } from './Icon'
import { OpeningHoursEditor } from './OpeningHoursEditor'
import { OptionDetails } from './OptionDetails'
import { Sheet } from './Sheet'
import { useDraft } from '../useDraft'

interface Props {
  place: Place
  index: number
  count: number
  days: Day[]
  /** Trip currency, used for a new cost. */
  currency: string
  /** People on the trip (the default number going to the place). */
  travelers: number
  /** Date of the day, "YYYY-MM-DD" (for that weekday's opening hours). */
  date: string
  selected: boolean
  onSelect: () => void
  /** Props of the drag handle (from `useReorder`); no handle when absent. */
  handle?: HTMLAttributes<HTMLButtonElement>
  dragging?: boolean
}

export function PlaceItem({ place, index, count, days, currency, travelers, date, selected, onSelect, handle, dragging }: Props) {
  const hours = describeWindow(windowFor(place.openingHours, weekdayOf(date)))
  const conflict = timeConflict(place, date)
  return (
    <li className={`place-item${selected ? ' selected' : ''}${dragging ? ' dragging' : ''}`} data-reorder-id={place.id}>
      <div className="place-row">
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
                    <Icon name="wallet" size={14} /> {describePlaceCost(place, travelers)}
                  </span>
                )}
              </span>
            )}
            {/* On its own line, so it doesn't move around with the length of the line above. */}
            {place.bookAhead && (
              <span className={`small${place.booked ? ' muted' : ' warning'}`}>
                {place.booked ? (
                  <>
                    <Icon name="check" size={14} /> {BOOKED_LABEL[place.bookAhead]}
                  </>
                ) : (
                  BOOK_AHEAD_LABEL[place.bookAhead]
                )}
              </span>
            )}
            {conflict && (
              <span className="warning small">
                <Icon name="warning" size={15} /> {conflict}
              </span>
            )}
            {!selected && place.notes && <span className="muted small place-notes-preview">{place.notes}</span>}
          </span>
          <span className="place-chevron" aria-hidden="true">
            <Icon name="down" size={16} />
          </span>
        </button>
        {handle && (
          <button
            type="button"
            className="place-handle ghost"
            aria-label={`Move “${place.name}”: drag, or use the arrow keys`}
            title="Drag to change the order"
            {...handle}
          >
            <Icon name="reorder" size={20} />
          </button>
        )}
      </div>
      {selected && (
        <PlaceEditor
          key={place.id}
          place={place}
          index={index}
          count={count}
          days={days}
          currency={currency}
          travelers={travelers}
          date={date}
        />
      )}
    </li>
  )
}

/**
 * A place added from an option: its details (photos, link, rating…) in a sheet, read-only.
 * Photos are only added on the Options page.
 */
function FromOption({ place }: { place: Place }) {
  const found = useLiveQuery(async () => {
    const option = await db.options.where('tripId').equals(place.tripId).filter((o) => o.placeId === place.id).first()
    const trip = option && (await db.trips.get(place.tripId))
    if (!option || !trip) return null
    return { option, trip, images: (await optionPhotos(option.id)).map((p) => p.image) }
  }, [place.tripId, place.id])
  const [open, setOpen] = useState(false)
  if (!found) return null
  const { option, trip, images } = found
  return (
    <>
      <button type="button" className="link place-option-link" onClick={() => setOpen(true)}>
        <Icon name="external" size={16} /> See option details
        {images.length > 0 && <span className="muted"> · {images.length === 1 ? '1 photo' : `${images.length} photos`}</span>}
      </button>
      {open && (
        <Sheet title={KIND_SINGULAR[option.kind]} onClose={() => setOpen(false)}>
          <OptionDetails option={option} trip={trip} images={images} inPlan={place.bookAhead && place.booked ? 'booked' : 'in'} onClose={() => setOpen(false)} />
        </Sheet>
      )}
    </>
  )
}

function PlaceEditor({ place, index, count, days, currency, travelers }: Omit<Props, 'selected' | 'onSelect'>) {
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
  // Empty = everyone on the trip, so it follows when the trip's number changes.
  const [people, setPeople] = useDraft(place.people != null ? String(place.people) : '', (value) => {
    const number = Number(value)
    if (value.trim() === '' || number === travelers) void updatePlace(place.id, { people: undefined })
    else if (Number.isInteger(number) && number >= 1) void updatePlace(place.id, { people: number })
  })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const bookAheadKind = BOOK_AHEAD_FOR[place.kind ?? 'place'] ?? 'either'

  return (
    <div className="place-editor">
      <FromOption place={place} />
      {place.address && <p className="muted small">{place.address}</p>}
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="field-row visit-fields">
        <label>
          Arrive at
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
          Kind
          <select
            value={place.kind ?? 'place'}
            onChange={(e) => {
              const kind = e.target.value as PlaceKind
              // A ticked "book ahead" follows the kind: a table for a restaurant, a ticket for a place.
              void updatePlace(place.id, { kind, bookAhead: place.bookAhead && (BOOK_AHEAD_FOR[kind] ?? 'either') })
            }}
          >
            {PLACE_KINDS.map((k) => (
              <option key={k} value={k}>
                {PLACE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field-row cost-fields">
        <label>
          {place.costForGroup ? 'Cost for the group' : 'Cost per person'} ({costCurrency})
          <input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            placeholder="Ticket, meal…"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </label>
        <label>
          Price is
          <select
            value={place.costForGroup ? 'group' : 'person'}
            onChange={(e) => updatePlace(place.id, { costForGroup: e.target.value === 'group' || undefined })}
          >
            <option value="person">Per person</option>
            <option value="group">For the group</option>
          </select>
        </label>
        {!place.costForGroup && (
          <label>
            People
            <input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              placeholder={String(travelers)}
              value={people}
              onChange={(e) => setPeople(e.target.value)}
              aria-label="People going"
            />
          </label>
        )}
      </div>
      {place.cost && (place.costForGroup || peopleGoing(place.people, travelers) > 1 || travelers > 1) && (
        <p className="muted small">In the budget: {describePlaceCost(place, travelers)}</p>
      )}
      <OpeningHoursEditor value={place.openingHours} onChange={(openingHours) => updatePlace(place.id, { openingHours })} />
      <div className="row wrap">
        <label className="check">
          <input
            type="checkbox"
            checked={place.bookAhead != null}
            // Unticking forgets it was booked; a place from an option keeps its kind (reservation/ticket) while ticked.
            onChange={(e) =>
              updatePlace(place.id, e.target.checked ? { bookAhead: bookAheadKind } : { bookAhead: undefined, booked: undefined })
            }
          />
          {BOOK_AHEAD_LABEL[place.bookAhead ?? bookAheadKind]}
        </label>
        {place.bookAhead && (
          <label className="check">
            <input type="checkbox" checked={place.booked ?? false} onChange={(e) => updatePlace(place.id, { booked: e.target.checked })} />
            {BOOKED_LABEL[place.bookAhead]}
          </label>
        )}
      </div>
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
          <Icon name="up" size={16} /> Up
        </button>
        <button type="button" disabled={index === count - 1} onClick={() => movePlaceInDay(place.dayId, place.id, 1)}>
          <Icon name="down" size={16} /> Down
        </button>
        <button
          type="button"
          className={confirmDelete ? 'danger' : ''}
          onClick={() => (confirmDelete ? deletePlace(place.id) : setConfirmDelete(true))}
          onBlur={() => setConfirmDelete(false)}
        >
          {confirmDelete ? 'Tap again to delete' : 'Delete'}
        </button>
        <a
          className="button ghost icon-button place-maps-link"
          href={placeUrl(place)}
          target="_blank"
          rel="noreferrer"
          aria-label="Open in Google Maps"
          title="Open in Google Maps"
        >
          <Icon name="external" size={18} />
        </a>
      </div>
    </div>
  )
}
