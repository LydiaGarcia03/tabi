import { useEffect, useRef, useState, type HTMLAttributes } from 'react'
import { describePlaceCost, peopleGoing } from '../budget'
import type { Place, PlaceKind } from '../db/model'
import { deletePlace, movePlaceInDay, updatePlace } from '../db/trips'
import { formatDuration } from '../format'
import { placeUrl } from '../googleMapsLinks'
import {
  DEFAULT_VISIT_MINUTES,
  describeWindow,
  formatMinutes,
  timeConflict,
  toMinutes,
  weekdayOf,
  windowFor,
} from '../planning/hours'
import {
  BOOK_AHEAD_FOR,
  BOOK_AHEAD_LABEL,
  BOOKED_LABEL,
  KIND_SINGULAR,
  PLACE_KIND_ICON,
  PLACE_KIND_LABEL,
  PLACE_KINDS,
} from '../planning/optionKinds'
import { Icon } from './Icon'
import { LocateSearch, type Located } from './LocateSearch'
import { OpeningHoursEditor } from './OpeningHoursEditor'
import { OptionDetails } from './OptionDetails'
import { Sheet } from './Sheet'
import { useDraft } from '../useDraft'
import { useDismiss } from '../useDismiss'
import { useFromOption } from '../places/useFromOption'
import { cleanInside, floorLabel, toInsideDraft } from '../places/floors'
import { FloorPill, InsidePills } from './InsideFields'

interface Props {
  place: Place
  index: number
  count: number
  /** Trip currency, used for a new cost. */
  currency: string
  /** The trip's currencies (a choice next to the cost when there are several, e.g. yen and dollars). */
  currencies?: string[]
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

export function PlaceItem({ place, index, count, currency, currencies, travelers, date, selected, onSelect, handle, dragging }: Props) {
  const hours = describeWindow(windowFor(place.openingHours, weekdayOf(date)))
  const conflict = timeConflict(place, date)
  const fromOption = useFromOption(place)
  const [details, setDetails] = useState(false)
  return (
    <li className={`place-item${selected ? ' selected' : ''}${dragging ? ' dragging' : ''}`} data-reorder-id={place.id}>
      <div className="place-row">
        {/* A div, not a button: the name inside it is a button of its own when the place came from an option. */}
        <div
          role="button"
          tabIndex={0}
          className="place-header"
          onClick={onSelect}
          onKeyDown={(e) => {
            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault()
              onSelect()
            }
          }}
          aria-expanded={selected}
        >
          <span className="place-number">
            <span>{index + 1}</span>
          </span>
          <span className="place-title">
            {selected ? (
              <PlaceNameField key={place.id} place={place} onDetails={fromOption ? () => setDetails(true) : undefined} />
            ) : (
            <span className="place-name">
              <span className="place-kind" title={PLACE_KIND_LABEL[place.kind ?? 'place']}>
                <Icon name={PLACE_KIND_ICON[place.kind ?? 'place']} size={15} />
              </span>
              {/* From an option: the name (and the icon after it) opens the option's details (User's choice A, 2026-11-03). */}
              {fromOption ? (
                <button
                  type="button"
                  className="place-option-name"
                  title="See option details"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDetails(true)
                  }}
                >
                  <span className="place-option-text">{place.name}</span>
                  <Icon name="external" size={15} />
                </button>
              ) : (
                place.name
              )}
              {place.inside && <span className="floor-tag">{floorLabel(place.inside.floor)}</span>}
            </span>
            )}
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
        </div>
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
          currency={currency}
          currencies={currencies}
          travelers={travelers}
          date={date}
        />
      )}
      {/* The option's details (photos, link, rating…), read-only: photos are only added on the Options page. */}
      {details && fromOption && (
        <Sheet title={KIND_SINGULAR[fromOption.option.kind]} onClose={() => setDetails(false)}>
          <OptionDetails
            option={fromOption.option}
            trip={fromOption.trip}
            images={fromOption.images}
            inPlan={place.bookAhead && place.booked ? 'booked' : 'in'}
            onClose={() => setDetails(false)}
          />
        </Sheet>
      )}
    </li>
  )
}

/**
 * The open card's name and kind, in place of the name on top (User's choice A from a mock, 2026-11-03): the field is
 * ready to type when the card opens; a place from an option gets a button beside it for the option's details.
 * Clicks here never close the card.
 */
function PlaceNameField({ place, onDetails }: { place: Place; onDetails?: () => void }) {
  const [name, setName] = useDraft(place.name, (value) => updatePlace(place.id, { name: value.trim() || place.name }))
  const input = useRef<HTMLInputElement>(null)
  // Ready to type with a mouse; on touch screens the keyboard would cover the card just opened to read it.
  useEffect(() => {
    if (window.matchMedia('(hover: hover)').matches) input.current?.focus({ preventScroll: true })
  }, [])
  return (
    <span className="place-name-edit" onClick={(e) => e.stopPropagation()}>
      <span className="pe-name">
        <KindPicker
          kind={place.kind ?? 'place'}
          onChange={(kind) =>
            // A ticked "book ahead" follows the kind: a table for a restaurant, a ticket for a place.
            void updatePlace(place.id, { kind, bookAhead: place.bookAhead && (BOOK_AHEAD_FOR[kind] ?? 'either') })
          }
        />
        <input ref={input} value={name} aria-label="Name" onChange={(e) => setName(e.target.value)} />
      </span>
      {onDetails && (
        <button type="button" className="place-option-button" title="See option details" aria-label="See option details" onClick={onDetails}>
          <Icon name="external" size={18} />
        </button>
      )}
    </span>
  )
}

/**
 * The open place card (User's choice B from a mock, 2026-11-01): no labels, each line starts with the icon the
 * closed card uses for it (clock, pin, wallet, door, pencil), so the open card reads like the closed one unfolded.
 */
function PlaceEditor({ place, index, count, currency, currencies = [], travelers }: Omit<Props, 'selected' | 'onSelect'>) {
  const [notes, setNotes] = useDraft(place.notes, (value) => updatePlace(place.id, { notes: value }))
  const [chosenCurrency, setChosenCurrency] = useState(currency)
  const costCurrency = place.cost?.currency ?? chosenCurrency
  const costCurrencies = [...new Set([...currencies, costCurrency])]
  const changeCurrency = (code: string) => {
    setChosenCurrency(code)
    if (place.cost) void updatePlace(place.id, { cost: { ...place.cost, currency: code } })
  }
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
  const [inside, setInside] = useDraft(toInsideDraft(place.inside), (value) => updatePlace(place.id, { inside: cleanInside(value) }))
  const [relocating, setRelocating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const bookAheadKind = BOOK_AHEAD_FOR[place.kind ?? 'place'] ?? 'either'
  const leaveAt = place.plannedTime && formatMinutes(toMinutes(place.plannedTime) + (place.visitMinutes ?? DEFAULT_VISIT_MINUTES))

  /** A new location from the search (or typed coordinates): the user's name for it stays. */
  function relocate(found: Located) {
    setRelocating(false)
    void updatePlace(place.id, {
      lat: found.lat,
      lng: found.lng,
      address: found.address,
      googlePlaceId: found.googlePlaceId,
      googleFetchedAt: found.googlePlaceId ? new Date().toISOString() : undefined,
      local: undefined, // The driver card's local address belonged to the old spot.
    })
  }

  return (
    <div className="place-editor">
      <div className="pe-line pe-line-first">
        <Icon name="clock" size={17} />
        <div className="pe-row pe-when">
          <label className="pill-field">
            <span className="pill-unit">Arrive</span>
            <input
              type="time"
              value={place.plannedTime ?? ''}
              onChange={(e) => updatePlace(place.id, { plannedTime: e.target.value || undefined })}
            />
          </label>
          <label className="pill-field" title="Visit length">
            <input
              className="pill-number"
              type="number"
              min="0"
              step="5"
              inputMode="numeric"
              placeholder={String(DEFAULT_VISIT_MINUTES)}
              value={visit}
              aria-label="Visit (minutes)"
              onChange={(e) => setVisit(e.target.value)}
            />
            <span className="pill-unit">min</span>
          </label>
          {leaveAt && (
            <span className="pe-until muted small">
              until <b>{leaveAt}</b>
            </span>
          )}
        </div>
      </div>

      <div className="pe-line">
        <Icon name="pin" size={17} />
        <div className="pe-stack">
          <div className="pe-row">
            <span className="small muted pe-address">
              {place.address ?? 'Custom pin'}{' '}
              <button type="button" className="link pe-change" onClick={() => setRelocating(!relocating)}>
                <Icon name={relocating ? 'close' : 'edit'} size={13} /> {relocating ? 'Cancel' : 'Change'}
              </button>
            </span>
            <FloorPill value={inside} onChange={setInside} />
          </div>
          {relocating && <LocateSearch onPick={relocate} placeholder="Search a place or paste coordinates" />}
          <InsidePills value={inside} onChange={setInside} />
        </div>
      </div>

      <div className="pe-line">
        <Icon name="wallet" size={17} />
        <div className="pe-stack">
          <div className="pe-row">
            {/* The currency inside the cost (User's choice B, 2026-11-01); a choice only with several currencies. */}
            <label className="pill-field pe-cost">
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="Cost"
                value={cost}
                aria-label={place.costForGroup ? 'Cost for everyone' : 'Cost per person'}
                onChange={(e) => setCost(e.target.value)}
              />
              {costCurrencies.length > 1 ? (
                <select value={costCurrency} aria-label="Currency" onChange={(e) => changeCurrency(e.target.value)}>
                  {costCurrencies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="pill-unit pill-currency">{costCurrency}</span>
              )}
            </label>
            <div className="segmented pe-price-is" role="radiogroup" aria-label="Price is">
              {(
                [
                  [false, 'Per person'],
                  [true, 'For everyone'],
                ] as const
              ).map(([group, label]) => (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={!!place.costForGroup === group}
                  className={!!place.costForGroup === group ? 'active' : ''}
                  onClick={() => updatePlace(place.id, { costForGroup: group || undefined })}
                >
                  {label}
                </button>
              ))}
            </div>
            {!place.costForGroup && (
              <label className="pill-field" title="People going">
                <Icon name="people" size={15} />
                <input
                  className="pill-number"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  placeholder={String(travelers)}
                  value={people}
                  aria-label="People going"
                  onChange={(e) => setPeople(e.target.value)}
                />
              </label>
            )}
          </div>
          {place.cost && (place.costForGroup || peopleGoing(place.people, travelers) > 1 || travelers > 1) && (
            <p className="muted small">In the budget: {describePlaceCost(place, travelers)}</p>
          )}
          <div className="pe-row">
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
        </div>
      </div>

      <div className="pe-line">
        <Icon name="door" size={17} />
        <OpeningHoursEditor bare value={place.openingHours} onChange={(openingHours) => updatePlace(place.id, { openingHours })} />
      </div>

      <div className="pe-line">
        <Icon name="edit" size={17} />
        <textarea
          rows={4}
          value={notes}
          aria-label="Notes"
          placeholder="History, tickets to have at hand, tips…"
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="pe-line pe-line-end">
        <span />
        <div className="leg-footer place-footer">
          <a className="leg-footer-maps" href={placeUrl(place)} target="_blank" rel="noreferrer">
            <Icon name="external" size={14} /> <span className="place-footer-wide">Open in </span>Google Maps
          </a>
          <span className="place-footer-spacer" />
          <button
            type="button"
            className="link"
            disabled={index === 0}
            aria-label="Move up"
            title="Move up"
            onClick={() => movePlaceInDay(place.dayId, place.id, -1)}
          >
            <Icon name="up" size={14} />
            <span className="place-footer-wide"> Up</span>
          </button>
          <button
            type="button"
            className="link"
            disabled={index === count - 1}
            aria-label="Move down"
            title="Move down"
            onClick={() => movePlaceInDay(place.dayId, place.id, 1)}
          >
            <Icon name="down" size={14} />
            <span className="place-footer-wide"> Down</span>
          </button>
          <button
            type="button"
            className={`link place-delete${confirmDelete ? ' confirm' : ''}`}
            onClick={() => (confirmDelete ? deletePlace(place.id) : setConfirmDelete(true))}
            onBlur={() => setConfirmDelete(false)}
          >
            <Icon name="trash" size={14} /> {confirmDelete ? 'Tap again to delete' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** The kind as an icon at the start of the name; a tap opens the four kinds with their names. */
function KindPicker({ kind, onChange }: { kind: PlaceKind; onChange: (kind: PlaceKind) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, open, setOpen)
  return (
    <div className="kind-picker" ref={ref}>
      <button
        type="button"
        className="kind-picker-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Kind: ${PLACE_KIND_LABEL[kind]}`}
        title={`Kind: ${PLACE_KIND_LABEL[kind]}`}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      >
        <Icon name={PLACE_KIND_ICON[kind]} size={18} />
        <Icon name="down" size={13} />
      </button>
      {open && (
        <ul className="kind-picker-menu" role="listbox" aria-label="Kind">
          {PLACE_KINDS.map((k) => (
            <li key={k}>
              <button
                type="button"
                role="option"
                aria-selected={k === kind}
                className={k === kind ? 'chosen' : ''}
                onClick={() => {
                  setOpen(false)
                  if (k !== kind) onChange(k)
                }}
              >
                <Icon name={PLACE_KIND_ICON[k]} size={18} />
                {PLACE_KIND_LABEL[k]}
                <Icon name="check" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
