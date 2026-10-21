import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { FlightForm, HotelForm, type BookingValues } from '../components/BookingForms'
import { Icon } from '../components/Icon'
import { OptionForm } from '../components/OptionForm'
import { Stars } from '../components/Stars'
import { CityTag, TripLayout } from '../components/TripLayout'
import { formatDay } from '../dates'
import { db } from '../db/db'
import type { Day, Expense, OptionKind, OptionStatus, Stay, Trip, TripOption } from '../db/model'
import { addOptionToDay, bookOption, updateOption } from '../db/options'
import { cityLabel, stayNights, stayOfCity } from '../db/stays'
import { formatMoney } from '../format'
import { compareOptions, DEFAULT_WEIGHTS, type Badge, type Group, type Scored, type Weights } from '../planning/compare'
import { KIND_ICON, KIND_PLURAL, OPTION_KINDS } from '../planning/optionKinds'
import { href } from '../router'
import { loadJson, saveJson } from '../settings'
import { NotFound } from './TripPage'

const WEIGHTS_KEY = 'tabi.compareWeights'

const BADGE_LABEL: Record<Badge, string> = {
  best: '🏆 Best match',
  cheapest: '💰 Cheapest',
  closest: '📍 Closest',
  'top-rated': '⭐ Your top',
}

/** Everything being considered, grouped by kind and city, to compare and pick. */
export function OptionsPage({ tripId }: { tripId: string }) {
  const trip = useLiveQuery(async () => (await db.trips.get(tripId)) ?? null, [tripId])
  const options = useLiveQuery(() => db.options.where('tripId').equals(tripId).toArray(), [tripId])
  const stays = useLiveQuery(() => db.stays.where('tripId').equals(tripId).toArray(), [tripId])
  const days = useLiveQuery(() => db.days.where('tripId').equals(tripId).sortBy('date'), [tripId])
  const placeIds = useLiveQuery(async () => new Set(await db.places.where('tripId').equals(tripId).primaryKeys()), [tripId])
  const expenseIds = useLiveQuery(async () => new Set(await db.expenses.where('tripId').equals(tripId).primaryKeys()), [tripId])

  const [kind, setKind] = useState<OptionKind | 'all'>('all')
  const [city, setCity] = useState('')
  const [showDiscarded, setShowDiscarded] = useState(false)
  const [editing, setEditing] = useState<TripOption | 'new' | null>(null)
  const [weights, setWeightsState] = useState<Weights>(() => loadJson<Weights>(WEIGHTS_KEY) ?? DEFAULT_WEIGHTS)
  const setWeights = (w: Weights) => {
    setWeightsState(w)
    saveJson(WEIGHTS_KEY, w)
  }

  const cities = useMemo(() => {
    const names = [...(stays ?? []).map((s) => s.city), ...(options ?? []).map((o) => o.city ?? '')]
    const seen = new Map<string, string>()
    names.filter((n) => n.trim()).forEach((n) => seen.set(n.trim().toLowerCase(), seen.get(n.trim().toLowerCase()) ?? n.trim()))
    return [...seen.values()]
  }, [stays, options])

  const groups = useMemo(() => {
    if (!trip || !options || !stays) return []
    const shown = options.filter(
      (o) =>
        (kind === 'all' || o.kind === kind) &&
        (!city || (o.city ?? '').trim().toLowerCase() === city.toLowerCase()) &&
        (showDiscarded || o.status !== 'discarded'),
    )
    const order = (g: Group) => `${OPTION_KINDS.indexOf(g.kind)}|${stayOfCity(stays, g.city)?.startDate ?? '9999'}|${g.city}`
    return compareOptions(shown, trip, stays, weights).sort((a, b) => order(a).localeCompare(order(b)))
  }, [trip, options, stays, kind, city, showDiscarded, weights])

  if (trip === undefined || !options || !stays || !days || !placeIds || !expenseIds) return null
  if (!trip) return <NotFound />

  const counts = Object.fromEntries(OPTION_KINDS.map((k) => [k, options.filter((o) => o.kind === k && o.status !== 'discarded').length]))
  const context = { trip, stays, days, placeIds, expenseIds, onEdit: (o: TripOption) => setEditing(o) }

  return (
    <TripLayout trip={trip} active="options">
      <header className="hero row between">
        <span>
          <p className="hero-kicker">{trip.name}</p>
          <h1>Options</h1>
        </span>
        {editing === null && (
          <button type="button" className="primary" onClick={() => setEditing('new')}>
            <Icon name="plus" /> Add option
          </button>
        )}
      </header>
      <p className="muted small options-intro">
        Hotels, restaurants, places, shops and flights you're considering. Compare them by city, mark favorites ☆, pick
        one ✓ (adds it to a day or books it) or discard ✕.
      </p>

      {editing && (
        <OptionForm
          key={editing === 'new' ? 'new' : editing.id}
          trip={trip}
          cities={cities}
          option={editing === 'new' ? undefined : editing}
          defaults={{ kind: kind === 'all' ? undefined : kind, city: city || undefined }}
          onDone={() => setEditing(null)}
        />
      )}

      <div className="options-toolbar">
        <div className="segmented" role="tablist" aria-label="Kind">
          <button type="button" role="tab" aria-selected={kind === 'all'} className={kind === 'all' ? 'active' : ''} onClick={() => setKind('all')}>
            All
          </button>
          {OPTION_KINDS.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>
              {KIND_ICON[k]} {KIND_PLURAL[k]} {counts[k] > 0 && <span className="count">{counts[k]}</span>}
            </button>
          ))}
        </div>
        <div className="row wrap">
          <select value={city} onChange={(e) => setCity(e.target.value)} aria-label="City">
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="check">
            <input type="checkbox" checked={showDiscarded} onChange={(e) => setShowDiscarded(e.target.checked)} />
            Show discarded
          </label>
        </div>
      </div>

      <WeightsPanel weights={weights} onChange={setWeights} />

      {groups.length === 0 && (
        <section className="empty-state">
          <p>Nothing here yet.</p>
          <p className="muted small">Add the hotels, restaurants and places you're considering to compare them.</p>
        </section>
      )}

      {groups.map((group) => (
        <OptionGroup key={group.key} group={group} {...context} />
      ))}
    </TripLayout>
  )
}

interface Context {
  trip: Trip
  stays: Stay[]
  days: Day[]
  placeIds: Set<string>
  expenseIds: Set<string>
  onEdit: (option: TripOption) => void
}

function OptionGroup({ group, ...context }: { group: Group } & Context) {
  const { trip } = context
  const nights = group.kind === 'hotel' && group.stay ? stayNights(group.stay, trip) : null
  const isFlight = group.kind === 'flight'
  const sorted = [...group.items].sort(
    (a, b) =>
      Number(a.option.status === 'discarded') - Number(b.option.status === 'discarded') ||
      (b.score ?? -1) - (a.score ?? -1),
  )

  return (
    <section className="card option-group">
      <header className="option-group-header">
        <h2>
          {KIND_ICON[group.kind]} {KIND_PLURAL[group.kind]}
          {group.city && <CityTag city={group.city} />}
        </h2>
        <p className="muted small">
          {nights &&
            `${nights.nights} ${nights.nights === 1 ? 'night' : 'nights'} (${formatDay(nights.checkIn)} → ${formatDay(nights.checkOut)}) · `}
          {group.reference
            ? `Distances from ${group.reference.name}`
            : !isFlight && 'Set a base for this city (Cities, on the itinerary page) to compare distances'}
        </p>
      </header>

      <div className="table-scroll">
        <table className="compare-table options-table">
          <thead>
            <tr>
              <th>Name</th>
              <th className="num">{group.kind === 'hotel' ? 'Per night' : group.kind === 'restaurant' ? 'Per person' : 'Price'}</th>
              {group.kind === 'hotel' && <th className="num">Stay total</th>}
              {!isFlight && <th className="num">Distance</th>}
              <th>Rating</th>
              <th>Score</th>
              <th>Why</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => (
              <OptionRow key={item.option.id} item={item} group={group} {...context} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function OptionRow({ item, group, trip, stays, days, placeIds, expenseIds, onEdit }: { item: Scored; group: Group } & Context) {
  const { option } = item
  const [choosing, setChoosing] = useState(false)
  const isFlight = group.kind === 'flight'
  const inPlan = (option.placeId && placeIds.has(option.placeId)) || (option.expenseId && expenseIds.has(option.expenseId))
  const columns = 6 + (group.kind === 'hotel' ? 1 : 0) + (isFlight ? 0 : 1)

  const setStatus = (status: OptionStatus) => updateOption(option.id, { status: option.status === status ? 'idea' : status })

  return (
    <>
      <tr className={`option-row status-${option.status}`}>
        <td className="option-name" data-label="Name">
          <span className="option-title">
            {option.status === 'favorite' && <span title="Favorite">🌟 </span>}
            {option.status === 'chosen' && <span title="Chosen">✅ </span>}
            {option.link ? (
              <a href={option.link} target="_blank" rel="noreferrer">
                {option.name}
              </a>
            ) : (
              option.name
            )}
          </span>
          <span className="muted small">
            {[option.category, isFlight && option.flight?.date && `${formatDay(option.flight.date)} ${option.flight.time ?? ''}`, option.hours]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {inPlan && <span className="tag in-plan">{option.expenseId ? 'Booked' : 'In the itinerary'}</span>}
          {item.badges.length > 0 && (
            <span className="badges">
              {item.badges.map((b) => (
                <span key={b} className={`badge badge-${b}`}>
                  {BADGE_LABEL[b]}
                </span>
              ))}
            </span>
          )}
        </td>
        <td className="num" data-label={group.kind === 'hotel' ? 'Per night' : 'Price'}>
          {option.price ? formatMoney(option.price) : '—'}
        </td>
        {group.kind === 'hotel' && (
          <td className="num" data-label="Stay total">
            {item.total ? formatMoney(item.total) : '—'}
            {item.nights != null && item.total && <span className="muted small"> ({item.nights}×)</span>}
          </td>
        )}
        {!isFlight && (
          <td className="num" data-label="Distance">
            {item.distanceKm == null ? (option.lat == null ? <span className="muted small">not located</span> : '—') : formatKm(item.distanceKm)}
          </td>
        )}
        <td data-label="Rating">
          <Stars value={option.rating} onChange={(rating) => updateOption(option.id, { rating })} />
        </td>
        <td data-label="Score">
          {item.score == null ? (
            <span className="muted">—</span>
          ) : (
            <span className="score">
              <span className="score-bar">
                <span style={{ width: `${item.score}%` }} />
              </span>
              {item.score}
            </span>
          )}
        </td>
        <td className="option-notes" data-label="Why">
          {option.notes ? <span className="small">{option.notes}</span> : <span className="muted">—</span>}
        </td>
        <td className="option-actions">
          <button
            type="button"
            className={`icon-toggle${option.status === 'favorite' ? ' on' : ''}`}
            title="Favorite"
            aria-pressed={option.status === 'favorite'}
            onClick={() => setStatus('favorite')}
          >
            {option.status === 'favorite' ? '★' : '☆'}
          </button>
          <button
            type="button"
            className={`icon-toggle${option.status === 'chosen' ? ' on' : ''}`}
            title={option.status === 'chosen' ? 'Chosen' : 'Choose'}
            aria-pressed={option.status === 'chosen'}
            onClick={() => (option.status === 'chosen' ? setStatus('chosen') : setChoosing(!choosing))}
          >
            ✓
          </button>
          <button
            type="button"
            className={`icon-toggle${option.status === 'discarded' ? ' on' : ''}`}
            title={option.status === 'discarded' ? 'Restore' : 'Discard'}
            aria-pressed={option.status === 'discarded'}
            onClick={() => setStatus('discarded')}
          >
            ✕
          </button>
          <button type="button" className="link" onClick={() => onEdit(option)}>
            Edit
          </button>
        </td>
      </tr>
      {choosing && (
        <tr className="choose-row">
          <td colSpan={columns}>
            <ChoosePanel item={item} trip={trip} stays={stays} days={days} onDone={() => setChoosing(false)} />
          </td>
        </tr>
      )}
    </>
  )
}

/** Picking an option: hotels and flights become bookings; the rest goes into a day. */
function ChoosePanel({ item, trip, stays, days, onDone }: { item: Scored; trip: Trip; stays: Stay[]; days: Day[]; onDone: () => void }) {
  const { option } = item
  const stay = stayOfCity(stays, option.city)
  const [dayId, setDayId] = useState(() => days.find((d) => stay && d.date >= stay.startDate)?.id ?? days[0]?.id ?? '')
  const [error, setError] = useState('')

  const book = async (values: BookingValues) => {
    await bookOption(option, { ...values, tripId: trip.id })
    onDone()
  }

  if (option.kind === 'hotel') {
    const nights = stay ? stayNights(stay, trip) : null
    const initial = {
      id: '',
      tripId: trip.id,
      category: 'lodging',
      description: option.name,
      amount: item.total ?? option.price ?? { amount: 0, currency: trip.displayCurrency },
      notes: option.notes,
      hotel: {
        name: option.name,
        checkIn: nights?.checkIn,
        checkOut: nights?.checkOut,
        nights: nights?.nights ?? 1,
        perNight: option.totalPrice ? undefined : option.price?.amount,
      },
    } satisfies Expense
    return (
      <div className="choose-panel">
        <p className="small">Book it: it goes to the budget as a hotel stay (check the dates and price).</p>
        <HotelForm trip={trip} expense={initial} onSave={book} onCancel={onDone} />
      </div>
    )
  }

  if (option.kind === 'flight') {
    const initial = {
      id: '',
      tripId: trip.id,
      category: 'transport',
      description: option.name,
      amount: option.price ?? { amount: 0, currency: trip.displayCurrency },
      notes: option.notes,
      flight: { ...option.flight!, flightNumber: option.category },
    } satisfies Expense
    return (
      <div className="choose-panel">
        <p className="small">Book it: it goes to the budget as a flight.</p>
        <FlightForm trip={trip} expense={initial} onSave={book} onCancel={onDone} />
      </div>
    )
  }

  return (
    <div className="choose-panel row wrap">
      {option.lat == null ? (
        <span className="small">Locate it first (Edit → Location) to add it to a day.</span>
      ) : (
        <>
          <label>
            Add to day
            <select value={dayId} onChange={(e) => setDayId(e.target.value)}>
              {days.map((d, i) => (
                <option key={d.id} value={d.id}>
                  Day {i + 1} · {formatDay(d.date)}
                  {cityLabel(stays, d.date) ? ` · ${cityLabel(stays, d.date)}` : ''}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="primary"
            onClick={async () => {
              try {
                await addOptionToDay(option, dayId)
                onDone()
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err))
              }
            }}
          >
            Add
          </button>
        </>
      )}
      <button type="button" onClick={() => updateOption(option.id, { status: 'chosen' }).then(onDone)}>
        Just mark as chosen
      </button>
      <button type="button" onClick={onDone}>
        Cancel
      </button>
      {error && <span className="error small">{error}</span>}
      {option.lat != null && (
        <a className="small" href={href({ page: 'day', tripId: trip.id, dayId })}>
          Open that day
        </a>
      )}
    </div>
  )
}

function WeightsPanel({ weights, onChange }: { weights: Weights; onChange: (w: Weights) => void }) {
  const sliders: { key: keyof Weights; label: string }[] = [
    { key: 'price', label: 'Price' },
    { key: 'distance', label: 'Distance' },
    { key: 'rating', label: 'Your rating' },
  ]
  return (
    <details className="card disclosure weights-panel">
      <summary>How the score works</summary>
      <p className="muted small">
        Within each group, every option gets 0–100 from how cheap, how close and how highly you rated it, compared with
        the others. Hotels compare the total for the stay. Choose what matters more:
      </p>
      <div className="weights">
        {sliders.map((s) => (
          <label key={s.key}>
            {s.label}: {['ignore', 'low', 'normal', 'high'][weights[s.key]]}
            <input
              type="range"
              min="0"
              max="3"
              step="1"
              value={weights[s.key]}
              onChange={(e) => onChange({ ...weights, [s.key]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
    </details>
  )
}

function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}
