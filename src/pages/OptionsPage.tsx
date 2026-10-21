import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { AirlineGuideTable, BaggageBreakdown } from '../components/AirlineGuide'
import { HotelForm, JourneyForm, type BookingValues } from '../components/BookingForms'
import { Icon } from '../components/Icon'
import { findAirline } from '../data/airlines'
import { OptionForm } from '../components/OptionForm'
import { FlightPlanner } from '../components/FlightPlanner'
import { PhotoStrip } from '../components/Photos'
import { Sheet } from '../components/Sheet'
import { JourneyItinerary } from '../components/JourneyLegs'
import { Stars } from '../components/Stars'
import { CityTag, TripLayout } from '../components/TripLayout'
import { formatDay } from '../dates'
import { db } from '../db/db'
import type { Day, Expense, OptionKind, OptionStatus, Stay, Trip, TripOption } from '../db/model'
import { addOptionToDay, bookOption, updateOption } from '../db/options'
import { cityLabel, stayNights, stayOfCity } from '../db/stays'
import { formatMoney } from '../format'
import { compareOptions, DEFAULT_WEIGHTS, type Badge, type Group, type Scored, type Weights } from '../planning/compare'
import { formatHours, JOURNEY_ICON, journeyCarriers, journeyDetails } from '../planning/journeys'
import { KIND_ICON, KIND_PLURAL, KIND_SINGULAR, OPTION_KINDS } from '../planning/optionKinds'
import { href } from '../router'
import { loadJson, saveJson } from '../settings'
import { NotFound } from './TripPage'

const WEIGHTS_KEY = 'tabi.compareWeights'

const BADGE_LABEL: Record<Badge, string> = {
  best: '🏆 Best match',
  cheapest: '💰 Cheapest',
  closest: '📍 Closest',
  fastest: '⚡ Fastest',
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
  // Images are Blobs: the browser reads their bytes only when one is shown.
  const photos = useLiveQuery(async () => {
    const byOption = new Map<string, Blob[]>()
    for (const p of await db.photos.where('tripId').equals(tripId).sortBy('order')) {
      byOption.set(p.optionId, [...(byOption.get(p.optionId) ?? []), p.image])
    }
    return byOption
  }, [tripId])

  const [kind, setKind] = useState<OptionKind | 'all'>('all')
  const [city, setCity] = useState('')
  const [showDiscarded, setShowDiscarded] = useState(false)
  const [editing, setEditing] = useState<TripOption | 'new' | null>(null)
  const [planning, setPlanning] = useState(false)
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

  if (trip === undefined || !options || !stays || !days || !placeIds || !expenseIds || !photos) return null
  if (!trip) return <NotFound />

  const counts = Object.fromEntries(OPTION_KINDS.map((k) => [k, options.filter((o) => o.kind === k && o.status !== 'discarded').length]))
  const context = { trip, stays, days, placeIds, expenseIds, photos, onEdit: (o: TripOption) => setEditing(o) }
  // Airlines in the transport options, highlighted in the airline guide.
  const myAirlines = [
    ...new Set(
      options
        .filter((o) => o.journey?.mode === 'flight' && o.status !== 'discarded')
        .flatMap((o) => journeyCarriers(o.journey!).map((c) => findAirline(c)?.name))
        .filter((n): n is string => !!n),
    ),
  ]

  return (
    <TripLayout trip={trip} active="options">
      <header className="hero row between">
        <span>
          <p className="hero-kicker trip-kicker">{trip.name}</p>
          <h1>Options</h1>
        </span>
        <button type="button" className="primary" onClick={() => setEditing('new')}>
          <Icon name="plus" /> Add option
        </button>
      </header>
      <p className="muted small options-intro">
        Hotels, restaurants, places, shops and transport (flights, shinkansen…) you're considering. Compare them by city
        or route, mark favorites ☆, pick one ✓ (adds it to a day or books it) or discard ✕.
      </p>

      {planning && (
        <Sheet title="Flight planner" onClose={() => setPlanning(false)}>
          <FlightPlanner
            trip={trip}
            onSaved={() => {
              setPlanning(false)
              setKind('transport')
            }}
          />
        </Sheet>
      )}

      {editing && (
        <Sheet
          key={editing === 'new' ? 'new' : editing.id}
          title={editing === 'new' ? 'New option' : `Edit ${KIND_SINGULAR[editing.kind].toLowerCase()}`}
          onClose={() => setEditing(null)}
        >
          <OptionForm
            trip={trip}
            cities={cities}
            option={editing === 'new' ? undefined : editing}
            defaults={{ kind: kind === 'all' ? undefined : kind, city: city || undefined }}
            onDone={() => setEditing(null)}
          />
        </Sheet>
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

      {kind === 'transport' && (
        <section className="card planner-entry">
          <span>
            <strong>✈️ Flight planner</strong>
            <span className="muted small">Build and rank itineraries with the airlines and connections you accept.</span>
          </span>
          <button type="button" className="primary" onClick={() => setPlanning(true)}>
            Plan flights
          </button>
        </section>
      )}

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

      {(kind === 'transport' || (kind === 'all' && counts.transport > 0)) && <AirlineGuideTable highlight={myAirlines} />}
    </TripLayout>
  )
}

interface Context {
  trip: Trip
  stays: Stay[]
  days: Day[]
  placeIds: Set<string>
  expenseIds: Set<string>
  /** Photos by option id. */
  photos: Map<string, Blob[]>
  onEdit: (option: TripOption) => void
}

function OptionGroup({ group, ...context }: { group: Group } & Context) {
  const { trip } = context
  const nights = group.kind === 'hotel' && group.stay ? stayNights(group.stay, trip) : null
  const isTransport = group.kind === 'transport'
  const sorted = [...group.items].sort(
    (a, b) =>
      Number(a.option.status === 'discarded') - Number(b.option.status === 'discarded') ||
      (b.score ?? -1) - (a.score ?? -1),
  )

  return (
    <section className="card option-group">
      <header className="option-group-header">
        <h2>
          {KIND_ICON[group.kind]} {isTransport ? group.route || 'Transport' : KIND_PLURAL[group.kind]}
          {group.city && <CityTag city={group.city} />}
        </h2>
        <p className="muted small">
          {group.kind === 'hotel' && group.stay && group.stay.kind && group.stay.kind !== 'stay' && 'No night here (day trip or stop on the way) · '}
          {nights &&
            nights.nights > 0 &&
            `${nights.nights} ${nights.nights === 1 ? 'night' : 'nights'} (${formatDay(nights.checkIn)} → ${formatDay(nights.checkOut)}) · `}
          {isTransport
            ? 'Compared by price, total travel time and your rating. Baggage from the airline guide below.'
            : group.reference
              ? `Distances from ${group.reference.name}`
              : 'Set a base for this city (Cities, on the itinerary page) to compare distances'}
        </p>
      </header>

      <div className="table-scroll">
        <table className="compare-table options-table">
          <thead>
            <tr>
              <th>Name</th>
              <th className="num">{group.kind === 'hotel' ? 'Per night' : group.kind === 'restaurant' ? 'Per person' : 'Price'}</th>
              {group.kind === 'hotel' && <th className="num">Stay total</th>}
              {isTransport ? (
                <>
                  <th className="num">Time</th>
                  <th>Baggage (economy)</th>
                  <th>Comfort</th>
                </>
              ) : (
                <th className="num">Distance</th>
              )}
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

function OptionRow({ item, group, trip, stays, days, placeIds, expenseIds, photos, onEdit }: { item: Scored; group: Group } & Context) {
  const { option } = item
  const [choosing, setChoosing] = useState(false)
  const journey = option.journey
  const isTransport = group.kind === 'transport'
  const carriers = journey?.mode === 'flight' ? journeyCarriers(journey) : []
  // Long-haul first: their legroom matters most.
  const flightAirlines = [...new Map(carriers.map((c) => findAirline(c)).filter((a) => !!a).map((a) => [a!.name, a!])).values()].sort(
    (a, b) => Number(b.scope === 'international') - Number(a.scope === 'international'),
  )
  const inPlan = (option.placeId && placeIds.has(option.placeId)) || (option.expenseId && expenseIds.has(option.expenseId))
  const columns = 7 + (group.kind === 'hotel' ? 1 : 0) + (isTransport ? 2 : 0)

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
            {journey
              ? [
                  JOURNEY_ICON[journey.mode],
                  journey.date && `${formatDay(journey.date)} ${journey.time ?? ''}`,
                  // Airlines are already in the name; connections are listed below.
                  ...journeyDetails({ ...journey, carrier: undefined, legs: undefined, durationHours: undefined }),
                ]
                  .filter(Boolean)
                  .join(' · ')
              : [option.category, option.hours].filter(Boolean).join(' · ')}
          </span>
          {journey && <JourneyItinerary journey={journey} />}
          <PhotoStrip images={photos.get(option.id) ?? []} name={option.name} />
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
        {isTransport ? (
          <>
            <td className="num" data-label="Time">
              {journey?.durationHours != null ? formatHours(journey.durationHours) : '—'}
            </td>
            <td className="baggage-cell" data-label="Baggage (economy)">
              {journey?.mode === 'flight' && carriers.length > 0 ? (
                <BaggageBreakdown carriers={carriers} main={journey.carrier} fare={journey.fare} compact />
              ) : (
                <span className="muted small">{journey?.mode !== 'flight' ? '—' : 'set the airlines (Edit)'}</span>
              )}
            </td>
            <td data-label="Comfort">
              {flightAirlines.length > 0 ? (
                <span className="small comfort-cell">
                  {flightAirlines.map((a) => (
                    <span key={a.name}>
                      {flightAirlines.length > 1 && <span className="muted">{a.name}: </span>}
                      {a.legroom?.economy ?? 'legroom not published'}
                      {a.premiumEconomy !== 'no' && <span className="muted"> · premium eco{a.premiumEconomy === 'some aircraft' ? ' on some' : ''}</span>}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="muted">—</span>
              )}
            </td>
          </>
        ) : (
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
          <button type="button" className="ghost icon-button option-edit" onClick={() => onEdit(option)} aria-label={`Edit ${option.name}`} title="Edit">
            <Icon name="edit" size={19} weight={2.4} />
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

/** Picking an option: hotels and transport become bookings; the rest goes into a day. */
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
    const stayed = stay ? stayNights(stay, trip) : null
    const nights = stayed && stayed.nights > 0 ? stayed : null
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

  if (option.kind === 'transport') {
    const initial = {
      id: '',
      tripId: trip.id,
      category: 'transport',
      description: option.name,
      amount: option.price ?? { amount: 0, currency: trip.displayCurrency },
      notes: option.notes,
      journey: option.journey ?? { mode: 'flight', from: '', to: '' },
    } satisfies Expense
    return (
      <div className="choose-panel">
        <p className="small">Book it: it goes to the budget (check the date, time and price).</p>
        <JourneyForm trip={trip} expense={initial} onSave={book} onCancel={onDone} />
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
    { key: 'distance', label: 'Distance / travel time' },
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
