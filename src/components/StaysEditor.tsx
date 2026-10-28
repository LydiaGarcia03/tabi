import { useState, type FormEvent } from 'react'
import { formatDay } from '../dates'
import { addExpense } from '../db/expenses'
import type { Day, Expense, Leg, Stay, StayBase, StayKind, Trip, TripOption } from '../db/model'
import { legTimes } from '../db/legs'
import { formatTime } from '../format'
import { addStay, baseIcon, deleteStay, homeOf, routeStays, stayNights, updateStay } from '../db/stays'
import { JOURNEY_LABEL, journeyDetails, journeysOnRoute } from '../planning/journeys'
import { href } from '../router'
import { JourneyForm } from './BookingForms'
import { useCityHue } from '../cityColors'
import { Icon, type IconName } from './Icon'
import { LocateSearch } from './LocateSearch'
import { Sheet } from './Sheet'

/** What is open in the sheet: a city to edit, a new city, or a way to get somewhere. */
type Editing = { city: Stay | 'new' } | { transfer: { from?: Stay; to?: Stay; roundTrip: boolean } } | null

/**
 * The trip as a route: each city a stop (dates, nights, base), day trips
 * inside the city you sleep in, and between stops how you get there.
 * Forms open in a sheet so the card stays a clean overview.
 */
export function StaysEditor({
  trip,
  stays,
  expenses,
  options,
  days,
  legs,
}: {
  trip: Trip
  stays: Stay[]
  expenses: Expense[]
  /** The trip's options: hotels for the city's base, transport to compare per route. */
  options: TripOption[]
  /** Days and legs: a day trip's way there and back can be planned in the day ("From base" / "Back to base"). */
  days: Day[]
  legs: Leg[]
}) {
  const [editing, setEditing] = useState<Editing>(null)
  const sorted = [...stays].sort((a, b) => a.startDate.localeCompare(b.startDate))
  const last = sorted.at(-1)
  // Travel goes city to city along the route; day trips leave from where you sleep and come back.
  const route = routeStays(sorted)
  const dayTrips = sorted.filter((s) => s.kind === 'day-trip')
  const homes = new Map(dayTrips.map((t) => [t.id, homeOf(sorted, t)]))
  const hotels = options.filter((o) => o.kind === 'hotel')
  const transport = options.filter((o) => o.kind === 'transport' && o.status !== 'discarded')
  const close = () => setEditing(null)

  const leg = (key: string, from?: Stay, to?: Stay) => (
    <RouteLeg
      key={key}
      trip={trip}
      stays={sorted}
      expenses={expenses}
      transport={transport}
      from={from}
      to={to}
      onAdd={() => setEditing({ transfer: { from, to, roundTrip: false } })}
    />
  )

  const nightsTotal = route.reduce((sum, s) => sum + stayNights(s, trip, sorted).nights, 0)

  return (
    <section className="card">
      <header className="row between">
        <h2>Cities</h2>
        {route.length > 0 && (
          <span className="muted small">
            {route.length} {route.length === 1 ? 'city' : 'cities'} · {nightsTotal} {nightsTotal === 1 ? 'night' : 'nights'}
          </span>
        )}
      </header>
      {sorted.length === 0 && (
        <p className="muted small">Split the trip by city (e.g. Osaka 30 Mar – 1 Apr): days show their city, and hotel options get their total for the stay.</p>
      )}

      {sorted.length > 0 && (
        <ol className="city-route">
          {route.length > 0 && leg('arrival', undefined, route[0])}
          {route.map((stay, i) => [
            <CityItem key={stay.id} stay={stay} stays={sorted} trip={trip} onEdit={() => setEditing({ city: stay })} />,
            ...dayTrips
              .filter((t) => homes.get(t.id)?.id === stay.id)
              .map((t) => (
                <DayTripItem
                  key={t.id}
                  dayTrip={t}
                  home={stay}
                  stays={sorted}
                  expenses={expenses}
                  planned={plannedInDays(t, days, legs)}
                  onEdit={() => setEditing({ city: t })}
                  onAddTransport={() => setEditing({ transfer: { from: stay, to: t, roundTrip: true } })}
                />
              )),
            leg(`after-${stay.id}`, stay, route[i + 1]),
          ])}
          {/* Day trips with no city to sleep in around them. */}
          {dayTrips
            .filter((t) => !homes.get(t.id))
            .map((t) => (
              <CityItem key={t.id} stay={t} stays={sorted} trip={trip} onEdit={() => setEditing({ city: t })} />
            ))}
        </ol>
      )}

      <button type="button" onClick={() => setEditing({ city: 'new' })}>
        + Add city
      </button>

      {editing && 'city' in editing && (
        <Sheet title={editing.city === 'new' ? 'New city' : `Edit ${editing.city.city}`} onClose={close}>
          <StayForm
            trip={trip}
            stay={editing.city === 'new' ? undefined : editing.city}
            hotels={hotels}
            defaults={{ startDate: last && last.endDate < trip.endDate ? last.endDate : trip.startDate, endDate: trip.endDate }}
            onDone={close}
          />
        </Sheet>
      )}
      {editing && 'transfer' in editing && (
        <Sheet title={legLabel(editing.transfer)} onClose={close}>
          <NewJourney trip={trip} {...editing.transfer} onDone={close} />
        </Sheet>
      )}
    </section>
  )
}

function legLabel({ from, to, roundTrip }: { from?: Stay; to?: Stay; roundTrip?: boolean }): string {
  if (!from) return `Getting to ${to!.city}`
  if (!to) return `Going home from ${from.city}`
  return roundTrip ? `${from.city} ⇄ ${to.city}` : `${from.city} → ${to.city}`
}

/** "Thu 30 Mar – Sun 2 Apr" or "Mon 19 Oct". */
function dateRange(stay: Stay): string {
  return stay.endDate === stay.startDate ? formatDay(stay.startDate) : `${formatDay(stay.startDate)} – ${formatDay(stay.endDate)}`
}

const BASE_LABEL: Record<NonNullable<StayBase['kind']>, string> = { hotel: 'Hotel', station: 'Station', other: 'Base' }

function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="ghost icon-button cr-edit" onClick={onClick} aria-label={label} title={label}>
      <Icon name="edit" size={19} weight={2.4} />
    </button>
  )
}

/** A city on the route: name, dates and nights, base. Its marker carries the city color. */
function CityItem({ stay, stays, trip, onEdit }: { stay: Stay; stays: Stay[]; trip: Trip; onEdit: () => void }) {
  const hue = useCityHue(stay.city)
  const nights = stayNights(stay, trip, stays).nights
  const note =
    stay.kind === 'day-trip' ? 'Day trip' : stay.kind === 'stopover' ? 'Stop on the way · no hotel' : `${nights} ${nights === 1 ? 'night' : 'nights'}`
  return (
    <li className="cr-item cr-city" style={{ ['--hue' as string]: hue }}>
      <span className="cr-rail">
        <span className="cr-mark" />
      </span>
      <div className="cr-body">
        <span className="cr-title">{stay.city}</span>
        <span className="cr-meta">
          {dateRange(stay)} · {note}
        </span>
        <span className="cr-meta">
          {stay.base ? (
            <>
              {BASE_LABEL[stay.base.kind ?? 'other']}: <span className="cr-strong">{stay.base.name}</span>
            </>
          ) : (
            <span className="cr-faint">No base set</span>
          )}
        </span>
      </div>
      <EditButton label={`Edit ${stay.city}`} onClick={onEdit} />
    </li>
  )
}

/** A day trip's way there and back as planned in its day(s): the legs from "From base" and to "Back to base". */
interface PlannedWay {
  there?: { depart?: string }
  back?: { arrive?: string }
}

function plannedInDays(dayTrip: Stay, days: Day[], legs: Leg[]): PlannedWay | null {
  const inTrip = days.filter((d) => d.date >= dayTrip.startDate && d.date <= dayTrip.endDate)
  if (inTrip.length === 0) return null
  const drawn = (l: Leg) => l.segments.length > 0
  // The way there leaves the first day's starting base stop; the way back arrives at a later base stop of the last day.
  const start = inTrip[0].baseStops?.find((s) => s.slot === 0)
  const there = start && legs.find((l) => l.fromPlaceId === start.id && drawn(l))
  const ends = new Set((inTrip.at(-1)!.baseStops ?? []).filter((s) => s.slot !== 0).map((s) => s.id))
  const back = legs.find((l) => ends.has(l.toPlaceId) && drawn(l))
  if (!there && !back) return null
  return {
    there: there && { depart: legTimes(there.segments).depart },
    back: back && { arrive: legTimes(back.segments).arrive },
  }
}

/** "Leave 05:35 · back 21:10", with what is still missing. */
function plannedText(planned: PlannedWay): string {
  const there = planned.there ? (planned.there.depart ? `Leave ${formatTime(planned.there.depart)}` : 'Way there planned') : 'Way there not planned'
  const back = planned.back ? (planned.back.arrive ? `back ${formatTime(planned.back.arrive)}` : 'way back planned') : 'way back not planned'
  return `${there} · ${back}`
}

/** A day trip from the city you sleep in, with its way there and back. */
function DayTripItem({
  dayTrip,
  home,
  stays,
  expenses,
  planned,
  onEdit,
  onAddTransport,
}: {
  dayTrip: Stay
  home: Stay
  stays: Stay[]
  expenses: Expense[]
  planned: PlannedWay | null
  onEdit: () => void
  onAddTransport: () => void
}) {
  const hue = useCityHue(dayTrip.city)
  const booked = [...journeysOnRoute(expenses, stays, home.city, dayTrip.city), ...journeysOnRoute(expenses, stays, dayTrip.city, home.city)]
  return (
    <li className="cr-item cr-day-trip" style={{ ['--hue' as string]: hue }}>
      <span className="cr-rail">
        <span className="cr-mark" />
      </span>
      <div className="cr-body">
        <span className="cr-title">
          {dayTrip.city} <span className="cr-faint">· day trip from {home.city}</span>
        </span>
        <span className="cr-meta">
          {dateRange(dayTrip)}
          {booked.length > 0 ? (
            <>
              {' · '}
              <span className="cr-strong">{journeyDetails(booked[0].journey!).join(' · ') || 'Transport in the itinerary'}</span>
            </>
          ) : planned ? (
            // Planned in the day itself (e.g. trains from the hotel): the day has the details.
            <>
              {' · '}
              <span className="cr-strong">{plannedText(planned)}</span>
            </>
          ) : (
            <>
              {' · '}
              <button type="button" className="cr-add inline" onClick={onAddTransport}>
                + Transport there and back
              </button>
            </>
          )}
        </span>
      </div>
      <EditButton label={`Edit ${dayTrip.city}`} onClick={onEdit} />
    </li>
  )
}

/** Between two cities (or arriving / going home): what is in the itinerary (with "Booked" once booked), or one link to add it. */
function RouteLeg({
  trip,
  stays,
  expenses,
  transport,
  from,
  to,
  onAdd,
}: {
  trip: Trip
  stays: Stay[]
  expenses: Expense[]
  transport: TripOption[]
  from?: Stay
  to?: Stay
  onAdd: () => void
}) {
  const booked = journeysOnRoute(expenses, stays, from?.city, to?.city)
  const considered = journeysOnRoute(transport, stays, from?.city, to?.city)
  const edge = !from ? 'first' : !to ? 'last' : ''

  return (
    <li className={`cr-item cr-leg ${edge}`}>
      <span className="cr-rail">{edge && <span className="cr-mark" />}</span>
      <div className="cr-body">
        <span className="cr-label">
          {!from ? 'From home' : !to ? 'Back home' : `${from.city} → ${to.city}`}
          {booked.length === 0 && considered.length > 0 && (
            <>
              {' · '}
              <a className="cr-options" href={href({ page: 'options', tripId: trip.id })}>
                {considered.length} {considered.length === 1 ? 'option' : 'options'}
              </a>
            </>
          )}
        </span>
        {booked.map((e) => (
          <span key={e.id} className="cr-meta">
            <span className="cr-strong">{JOURNEY_LABEL[e.journey!.mode]}</span>
            {' · '}
            {[e.journey!.date && formatDay(e.journey!.date), e.journey!.time, ...journeyDetails(e.journey!)].filter(Boolean).join(' · ')}
            {e.booked && (
              <span className="tag in-plan booked">
                <Icon name="check" size={12} weight={2.6} /> Booked
              </span>
            )}
          </span>
        ))}
      </div>
      {/* Small, on the right of the leg, where the cities have their edit button. */}
      {booked.length === 0 && (
        <button type="button" className="cr-add" onClick={onAdd}>
          + Transport
        </button>
      )}
    </li>
  )
}

/** Adding the way to get somewhere to the itinerary, prefilled with the route and the day. */
function NewJourney({ trip, from, to, roundTrip, onDone }: { trip: Trip; from?: Stay; to?: Stay; roundTrip: boolean; onDone: () => void }) {
  const initial = {
    id: '',
    tripId: trip.id,
    category: 'transport',
    description: '',
    amount: { amount: 0, currency: trip.displayCurrency },
    journey: {
      mode: roundTrip ? 'train' : from && to ? 'shinkansen' : 'flight',
      from: from?.city ?? '',
      to: to?.city ?? '',
      // Leave on the first day of the next city or the day trip (or the last day of the trip).
      date: to?.startDate ?? from?.endDate,
    },
  } satisfies Expense
  return (
    <JourneyForm
      trip={trip}
      expense={initial}
      onSave={async (values) => {
        await addExpense({ ...values, tripId: trip.id })
        onDone()
      }}
      onCancel={onDone}
    />
  )
}

const STAY_KINDS: [StayKind, string, IconName][] = [
  ['stay', 'Sleeping here', 'bed'],
  ['day-trip', 'Day trip', 'return'],
  ['stopover', 'Stop on the way', 'arrow'],
]

const STAY_KIND_HINT: Record<StayKind, string> = {
  stay: 'You sleep here: hotel options get the nights of these days.',
  'day-trip': 'There and back the same day, sleeping in the city you are staying in (e.g. Kyoto from Osaka). No hotel; the trip goes on from that city.',
  stopover: 'Visited on the way to the next city, without sleeping here (e.g. Nara between Kyoto and Osaka). No hotel.',
}

type BaseKind = NonNullable<StayBase['kind']>

const BASE_KINDS: [BaseKind, string][] = [
  ['hotel', 'Hotel'],
  ['station', 'Station'],
  ['other', 'Other'],
]

/**
 * Where distances in the city are measured from: a hotel (one of the hotel
 * options, or searched by name), a station or anything else (searched).
 */
function BasePicker({
  city,
  base,
  hotels,
  region,
  onChange,
}: {
  city: string
  base?: StayBase
  hotels: TripOption[]
  /** The trip's first country: searches find places there first. */
  region?: string
  onChange: (base: StayBase | undefined) => void
}) {
  const [kind, setKind] = useState<BaseKind>(base?.kind ?? (hotels.length > 0 ? 'hotel' : 'station'))
  // The hotel options of this city that are still in the running.
  const cityHotels = hotels.filter(
    (h) => h.status !== 'discarded' && (h.city ?? '').trim().toLowerCase() === city.toLowerCase(),
  )
  // A hotel base comes from one of the options or from a map search.
  const [source, setSource] = useState<'option' | 'search'>(
    base?.kind === 'hotel' && !base.optionId ? 'search' : cityHotels.length > 0 || !base ? 'option' : 'search',
  )

  return (
    <div className="field stay-base">
      <span className="field-label">Base for distances</span>
      <p className="small">
        {base ? (
          <>
            <Icon name={baseIcon(base)} size={16} /> <strong>{base.name}</strong>{' '}
            <button type="button" className="link" onClick={() => onChange(undefined)}>
              Clear
            </button>
          </>
        ) : (
          <span className="muted">Not set. Hotel and restaurant options of this city are compared by distance from it.</span>
        )}
      </p>
      <div className="segmented" role="radiogroup" aria-label="Base type">
        {BASE_KINDS.map(([value, label]) => (
          <button key={value} type="button" role="radio" aria-checked={kind === value} className={kind === value ? 'active' : ''} onClick={() => setKind(value)}>
            <Icon name={baseIcon({ kind: value })} size={16} /> {label}
          </button>
        ))}
      </div>

      {kind === 'hotel' && (
        <div className="base-sources" role="radiogroup" aria-label="Where the hotel comes from">
          <label className="check base-source">
            <input type="radio" name="hotel-source" checked={source === 'option'} onChange={() => setSource('option')} />
            From my hotel options
          </label>
          {source === 'option' && (
            <div className="base-source-body">
              <select
                value={base?.optionId && cityHotels.some((h) => h.id === base.optionId) ? base.optionId : ''}
                disabled={cityHotels.length === 0}
                onChange={(e) => {
                  const h = cityHotels.find((o) => o.id === e.target.value)
                  if (h && h.lat != null && h.lng != null) onChange({ name: h.name, lat: h.lat, lng: h.lng, kind: 'hotel', optionId: h.id })
                }}
                aria-label="Your hotel options"
              >
                {cityHotels.length === 0 ? (
                  <option value="">— No hotel options for {city || 'this city'} —</option>
                ) : (
                  <>
                    <option value="">Choose one…</option>
                    {cityHotels.map((h) => (
                      <option key={h.id} value={h.id} disabled={h.lat == null || h.lng == null}>
                        {h.status === 'chosen' ? '✓ ' : h.status === 'favorite' ? '★ ' : ''}
                        {h.name}
                        {h.lat == null ? ' (no location yet)' : ''}
                      </option>
                    ))}
                  </>
                )}
              </select>
              {cityHotels.some((h) => h.lat == null) && (
                <p className="muted small">Options without a location can't be picked: edit them in Options to find them on the map.</p>
              )}
            </div>
          )}
          <label className="check base-source">
            <input type="radio" name="hotel-source" checked={source === 'search'} onChange={() => setSource('search')} />
            Search on the map
          </label>
          {source === 'search' && (
            <div className="base-source-body">
              <LocateSearch
                near={city || undefined}
                region={region}
                placeholder="Hotel name (e.g. Super Hotel Namba)"
                onPick={(p) => onChange({ name: p.name, lat: p.lat, lng: p.lng, kind: 'hotel' })}
              />
            </div>
          )}
          <p className="muted small">
            With a hotel as base, restaurants and places are measured from it; hotel options aren't compared by distance
            (pick a station for that).
          </p>
        </div>
      )}

      {kind !== 'hotel' && (
        <LocateSearch
          key={kind}
          initialQuery={kind === 'station' && city ? `${city} station` : ''}
          near={city || undefined}
          region={region}
          placeholder={kind === 'station' ? 'Station name (e.g. Shin-Osaka)' : 'Name of the place'}
          onPick={(p) => onChange({ name: p.name, lat: p.lat, lng: p.lng, kind })}
        />
      )}
    </div>
  )
}

function StayForm({
  trip,
  stay,
  defaults,
  hotels,
  onDone,
}: {
  trip: Trip
  stay?: Stay
  defaults?: { startDate: string; endDate: string }
  /** The trip's hotel options, to pick the base from. */
  hotels: TripOption[]
  onDone: () => void
}) {
  const [city, setCity] = useState(stay?.city ?? '')
  const [startDate, setStartDate] = useState(stay?.startDate ?? defaults?.startDate ?? trip.startDate)
  const [endDate, setEndDate] = useState(stay?.endDate ?? defaults?.endDate ?? trip.endDate)
  const [base, setBase] = useState(stay?.base)
  const [kind, setKind] = useState<StayKind>(stay?.kind ?? 'stay')
  const valid = city.trim() !== '' && !!startDate && !!endDate && endDate >= startDate

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    const values = { city: city.trim(), startDate, endDate, base, kind: kind === 'stay' ? undefined : kind }
    if (stay) await updateStay(stay.id, values)
    else await addStay({ ...values, tripId: trip.id })
    onDone()
  }

  return (
    <form className="expense-form" onSubmit={submit}>
      <label>
        City
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Osaka" autoFocus />
      </label>
      <div className="field">
        <span className="field-label">How you'll visit it</span>
        <div className="segmented" role="radiogroup" aria-label="How you'll visit it">
          {STAY_KINDS.map(([value, label, icon]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={kind === value}
              className={kind === value ? 'active' : ''}
              onClick={() => {
                setKind(value)
                // Day trips and stops are usually a single day.
                if (value !== 'stay') setEndDate(startDate)
              }}
            >
              <Icon name={icon} size={16} /> {label}
            </button>
          ))}
        </div>
        <p className="muted small">{STAY_KIND_HINT[kind]}</p>
      </div>
      <div className="field-row">
        <label>
          First day
          <input type="date" value={startDate} min={trip.startDate} max={trip.endDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          Last day
          <input type="date" value={endDate} min={startDate} max={trip.endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
      </div>
      {kind === 'stay' && <p className="muted small">A travel day can be the last day of one city and the first of the next.</p>}
      <BasePicker city={city.trim()} base={base} hotels={hotels} region={trip.countries?.[0]} onChange={setBase} />
      <div className="row wrap sheet-actions">
        <button type="submit" className="primary" disabled={!valid}>
          Save city
        </button>
        <button type="button" onClick={onDone}>
          Cancel
        </button>
        {stay && (
          <button
            type="button"
            className="danger-outline"
            onClick={async () => {
              await deleteStay(stay.id)
              onDone()
            }}
          >
            Remove
          </button>
        )}
      </div>
    </form>
  )
}
