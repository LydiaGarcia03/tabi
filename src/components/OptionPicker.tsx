import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { db } from '../db/db'
import type { OptionKind, TripOption } from '../db/model'
import { addOptionToDay } from '../db/options'
import { DAY_KINDS, KIND_ICON, KIND_PLURAL } from '../planning/optionKinds'
import { Icon } from './Icon'
import { BlobImage } from './Photos'
import { useDismiss } from '../useDismiss'

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
  // First photo of each option, shown in the list.
  const photos = useLiveQuery(async () => {
    const first = new Map<string, Blob>()
    for (const p of await db.photos.where('tripId').equals(tripId).sortBy('order')) if (!first.has(p.optionId)) first.set(p.optionId, p.image)
    return first
  }, [tripId])
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<OptionKind | null>(null)
  const [optionId, setOptionId] = useState('')
  const [error, setError] = useState('')

  if (!options || !placeIds || !photos) return null
  const available = options.filter((o) => DAY_KINDS.includes(o.kind) && o.status !== 'discarded')
  if (available.length === 0) return null

  const count = (k: OptionKind) => available.filter((o) => o.kind === k).length
  const shownKind = kind ?? DAY_KINDS.find((k) => count(k) > 0)!
  const ofKind = available.filter((o) => o.kind === shownKind)
  const selected = ofKind.find((o) => o.id === optionId)

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
        <OptionSelect
          groups={sortedGroups}
          selected={selected}
          photos={photos}
          inPlan={(o) => o.placeId != null && placeIds.has(o.placeId)}
          placeholder={`Pick one of the ${KIND_PLURAL[shownKind].toLowerCase()}…`}
          onPick={(o) => {
            setOptionId(o.id)
            setError('')
          }}
        />
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

const located = (o: TripOption) => o.lat != null && o.lng != null

/** The option's first photo, or its kind's icon when it has none. */
export function OptionThumb({ option, photo }: { option: TripOption; photo?: Blob }) {
  return <span className="option-thumb">{photo ? <BlobImage image={photo} alt="" /> : <Icon name={KIND_ICON[option.kind]} size={18} />}</span>
}

/**
 * A dropdown of options with their photo, name and type (a native <select>
 * can only hold text). Keyboard: ↑ ↓ to move, Enter to pick, Esc to close.
 */
function OptionSelect({
  groups,
  selected,
  photos,
  inPlan,
  placeholder,
  onPick,
}: {
  groups: [string, TripOption[]][]
  selected?: TripOption
  photos: Map<string, Blob>
  inPlan: (o: TripOption) => boolean
  placeholder: string
  onPick: (o: TripOption) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const pickable = groups.flatMap(([, options]) => options).filter(located)

  // A tap anywhere else closes the list.
  useDismiss(root, expanded, setExpanded)

  // Keep the highlighted row in view while moving with the keyboard.
  useEffect(() => {
    if (expanded && active) list.current?.querySelector(`[data-id="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [expanded, active])

  const show = () => {
    setActive(selected?.id ?? pickable[0]?.id ?? null)
    setExpanded(true)
  }
  const pick = (o: TripOption) => {
    onPick(o)
    setExpanded(false)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && expanded) {
      e.preventDefault()
      setExpanded(false)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!expanded) return show()
      const i = pickable.findIndex((o) => o.id === active)
      const next = pickable[Math.min(pickable.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))]
      if (next) setActive(next.id)
    } else if ((e.key === 'Enter' || e.key === ' ') && expanded) {
      e.preventDefault()
      const o = pickable.find((p) => p.id === active)
      if (o) pick(o)
    }
  }

  return (
    <div className="option-select" ref={root}>
      <button
        type="button"
        className="option-select-button"
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-activedescendant={expanded && active ? `option-select-${active}` : undefined}
        onClick={() => (expanded ? setExpanded(false) : show())}
        onKeyDown={onKeyDown}
      >
        {selected ? (
          <>
            <OptionThumb option={selected} photo={photos.get(selected.id)} />
            <span className="option-select-name">{selected.name}</span>
            {selected.category && <span className="option-select-type">{selected.category}</span>}
          </>
        ) : (
          <span className="option-select-name muted">{placeholder}</span>
        )}
        <Icon name={expanded ? 'up' : 'down'} size={18} />
      </button>
      {expanded && (
        <ul className="option-select-list" role="listbox" ref={list}>
          {groups.map(([city, options]) => (
            <li key={city} role="presentation">
              <span className="option-select-city">{city}</span>
              <ul role="group" aria-label={city}>
                {options.map((o) => {
                  const note = !located(o) ? 'Not on the map yet' : inPlan(o) ? 'Already in the itinerary' : ''
                  return (
                    <li
                      key={o.id}
                      id={`option-select-${o.id}`}
                      data-id={o.id}
                      role="option"
                      aria-selected={o.id === selected?.id}
                      aria-disabled={!located(o)}
                      className={`option-select-item${o.id === active ? ' active' : ''}`}
                      onPointerEnter={() => located(o) && setActive(o.id)}
                      onClick={() => located(o) && pick(o)}
                    >
                      <OptionThumb option={o} photo={photos.get(o.id)} />
                      <span className="option-select-text">
                        <span className="option-select-name">
                          {o.status === 'favorite' && (
                            <span className="status-mark favorite" title="Favorite">
                              <Icon name="star" size={14} filled />
                            </span>
                          )}
                          {o.name}
                        </span>
                        {note && <span className="muted small">{note}</span>}
                      </span>
                      {o.category && <span className="option-select-type">{o.category}</span>}
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
