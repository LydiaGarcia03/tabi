import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { db } from '../db/db'
import type { TripOption } from '../db/model'
import { itineraryState } from './options/itinerary'
import { Icon } from './Icon'
import { ItineraryTags } from './OptionDetails'
import { OptionThumb } from './OptionPicker'
import { useDismiss } from '../useDismiss'

const located = (o: TripOption) => o.lat != null && o.lng != null

/**
 * The city's hotel options to pick the base from: photo, name and "In the itinerary" / "Booked"
 * (a native <select> can only hold text). Keyboard: ↑ ↓ to move, Enter to pick, Esc to close.
 */
export function HotelOptionSelect({
  tripId,
  hotels,
  selectedId,
  onPick,
}: {
  tripId: string
  hotels: TripOption[]
  selectedId?: string
  onPick: (hotel: TripOption) => void
}) {
  const photos = useLiveQuery(async () => {
    const first = new Map<string, Blob>()
    for (const p of await db.photos.where('tripId').equals(tripId).sortBy('order')) if (!first.has(p.optionId)) first.set(p.optionId, p.image)
    return first
  }, [tripId])
  const expenses = useLiveQuery(() => db.expenses.where('tripId').equals(tripId).toArray(), [tripId])
  const [expanded, setExpanded] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  // Where the list floats, fixed on the screen: the sheet's scrolling body would cut a list placed inside it.
  const [place, setPlace] = useState<CSSProperties>({})
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const pickable = hotels.filter(located)
  const selected = hotels.find((h) => h.id === selectedId)

  useDismiss(root, expanded, setExpanded)

  useEffect(() => {
    if (expanded && active) list.current?.querySelector(`[data-id="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [expanded, active])

  // Scrolling the sheet (not the list itself) or resizing would leave the list behind: it closes.
  useEffect(() => {
    if (!expanded) return
    const close = (e: Event) => {
      if (!list.current?.contains(e.target as Node)) setExpanded(false)
    }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [expanded])

  // A hotel is in the itinerary through its trip expense.
  const ids = {
    placeIds: new Set<string>(),
    expenseIds: new Set((expenses ?? []).map((e) => e.id)),
    bookedIds: new Set((expenses ?? []).filter((e) => e.booked).map((e) => e.id)),
  }

  const show = () => {
    // Below the button, or above it when there is more room there.
    const rect = button.current!.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - 12
    const above = rect.top - 12
    const up = below < 240 && above > below
    setPlace({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      right: 'auto',
      ...(up ? { top: 'auto', bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4, bottom: 'auto' }),
      maxHeight: Math.min(320, up ? above : below),
    })
    setActive(selected?.id ?? pickable[0]?.id ?? null)
    setExpanded(true)
  }
  const pick = (h: TripOption) => {
    onPick(h)
    setExpanded(false)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && expanded) {
      // Only the list closes, not the sheet around it.
      e.preventDefault()
      e.stopPropagation()
      setExpanded(false)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!expanded) return show()
      const i = pickable.findIndex((o) => o.id === active)
      const next = pickable[Math.min(pickable.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))]
      if (next) setActive(next.id)
    } else if ((e.key === 'Enter' || e.key === ' ') && expanded) {
      e.preventDefault()
      const h = pickable.find((p) => p.id === active)
      if (h) pick(h)
    }
  }

  return (
    <div className="option-select hotel-select" ref={root}>
      <button
        ref={button}
        type="button"
        className="option-select-button"
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-label="Your hotel options"
        aria-activedescendant={expanded && active ? `hotel-select-${active}` : undefined}
        onClick={() => (expanded ? setExpanded(false) : show())}
        onKeyDown={onKeyDown}
      >
        {selected ? (
          <>
            <OptionThumb option={selected} photo={photos?.get(selected.id)} />
            <span className="option-select-name">{selected.name}</span>
          </>
        ) : (
          <span className="option-select-name muted">Choose one…</span>
        )}
        <Icon name={expanded ? 'up' : 'down'} size={18} />
      </button>
      {expanded && (
        <ul className="option-select-list" role="listbox" ref={list} aria-label="Your hotel options" style={place}>
          {hotels.map((h) => (
            <li
              key={h.id}
              id={`hotel-select-${h.id}`}
              data-id={h.id}
              role="option"
              aria-selected={h.id === selectedId}
              aria-disabled={!located(h)}
              className={`option-select-item${h.id === active ? ' active' : ''}`}
              onPointerEnter={() => located(h) && setActive(h.id)}
              onClick={() => located(h) && pick(h)}
            >
              <OptionThumb option={h} photo={photos?.get(h.id)} />
              <span className="option-select-text">
                <span className="option-select-name">
                  {h.status === 'favorite' && (
                    <span className="status-mark favorite" title="Favorite">
                      <Icon name="star" size={14} filled />
                    </span>
                  )}
                  {h.name}
                </span>
                {!located(h) ? (
                  <span className="muted small">Not on the map yet</span>
                ) : (
                  itineraryState(h, ids) && (
                    <span className="hotel-select-tags">
                      <ItineraryTags state={itineraryState(h, ids)} />
                    </span>
                  )
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
