import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState, type MouseEvent } from 'react'
import { AirlineGuideTable, BaggageBreakdown } from '../components/AirlineGuide'
import { HotelForm, JourneyForm, type BookingValues } from '../components/BookingForms'
import { Icon, type IconName } from '../components/Icon'
import { findAirline } from '../data/airlines'
import { OptionForm } from '../components/OptionForm'
import { FlightPlanner } from '../components/FlightPlanner'
import { BlobImage, LeadPhoto, PhotoViewer } from '../components/Photos'
import { Sheet } from '../components/Sheet'
import { JourneyItinerary, journeyChips, RouteChain } from '../components/JourneyLegs'
import { Stars } from '../components/Stars'
import { CityTag, TripLayout } from '../components/TripLayout'
import { formatDay } from '../dates'
import { db } from '../db/db'
import type { Day, Expense, OptionKind, OptionStatus, Stay, Trip, TripOption } from '../db/model'
import { addOptionToDay, bookOption, updateOption } from '../db/options'
import { cityLabel, stayNights, stayOfCity } from '../db/stays'
import { describePriced, optionPriced, pricedTotal, travelersOf } from '../budget'
import { formatMoney } from '../format'
import { compareOptions, DEFAULT_WEIGHTS, type Badge, type Group, type Scored, type Weights } from '../planning/compare'
import { cheapestFare, chosenFare, faresOf, isStale } from '../planning/fares'
import { describeWeek } from '../planning/hours'
import { formatHours, JOURNEY_ICON, journeyCarriers } from '../planning/journeys'
import { BOOK_AHEAD_LABEL, DAY_KINDS, KIND_ICON, KIND_PLURAL, KIND_SINGULAR, OPTION_KINDS, PRICE_LABEL } from '../planning/optionKinds'
import { placeUrl } from '../googleMapsLinks'
import { href } from '../router'
import { loadJson, saveJson } from '../settings'
import { NotFound } from './TripPage'

const WEIGHTS_KEY = 'tabi.compareWeights'

const BADGE_LABEL: Record<Badge, string> = {
  best: 'Best match',
  cheapest: 'Cheapest',
  closest: 'Closest',
  fastest: 'Fastest',
  'top-rated': 'Your top',
}

const BADGE_ICON: Record<Badge, IconName> = {
  best: 'sparkle',
  cheapest: 'wallet',
  closest: 'pin',
  fastest: 'clock',
  'top-rated': 'star',
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
  // An option's details (read-only) or its form; `back`: the form was opened from the details and returns to them.
  const [open, setOpen] = useState<{ id: string; edit: boolean; back?: boolean } | 'new' | null>(null)
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

  // Same city filter as the list, so the tab counts match what each tab shows.
  const inCity = (o: TripOption) => !city || (o.city ?? '').trim().toLowerCase() === city.toLowerCase()
  const counts = Object.fromEntries(
    OPTION_KINDS.map((k) => [k, options.filter((o) => o.kind === k && o.status !== 'discarded' && inCity(o)).length]),
  )
  const context = {
    trip,
    stays,
    days,
    placeIds,
    expenseIds,
    photos,
    onEdit: (o: TripOption) => setOpen({ id: o.id, edit: true }),
    onOpen: (o: TripOption) => setOpen({ id: o.id, edit: false }),
  }
  // Gone when it was just deleted: the sheet closes.
  const openOption = open && open !== 'new' ? options.find((o) => o.id === open.id) : undefined
  const openGroup = openOption && groups.find((g) => g.items.some((i) => i.option.id === openOption.id))
  const closeForm = () => setOpen(open && open !== 'new' && open.back ? { id: open.id, edit: false } : null)
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
        <button type="button" className="primary" onClick={() => setOpen('new')}>
          <Icon name="plus" /> Add option
        </button>
      </header>
      <p className="muted small options-intro">
        Hotels, restaurants, places, shops and transport (flights, shinkansen…) you're considering. Compare them by city
        or route, mark favorites <Icon name="star" size={14} />, pick one <Icon name="check" size={14} /> (adds it to a day or
        books it) or discard <Icon name="close" size={14} />.
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

      {open === 'new' && (
        <Sheet key="new" title="New option" onClose={() => setOpen(null)}>
          <OptionForm
            trip={trip}
            cities={cities}
            defaults={{ kind: kind === 'all' ? undefined : kind, city: city || undefined }}
            onDone={() => setOpen(null)}
          />
        </Sheet>
      )}
      {open && open !== 'new' && openOption && (
        <Sheet
          key={openOption.id}
          title={open.edit ? `Edit ${KIND_SINGULAR[openOption.kind].toLowerCase()}` : KIND_SINGULAR[openOption.kind]}
          onClose={() => setOpen(null)}
        >
          {open.edit ? (
            <OptionForm trip={trip} cities={cities} option={openOption} onDone={closeForm} />
          ) : (
            <OptionDetails
              option={openOption}
              item={openGroup?.items.find((i) => i.option.id === openOption.id)}
              group={openGroup}
              trip={trip}
              images={photos.get(openOption.id) ?? []}
              inPlan={!!((openOption.placeId && placeIds.has(openOption.placeId)) || (openOption.expenseId && expenseIds.has(openOption.expenseId)))}
              onEdit={() => setOpen({ id: openOption.id, edit: true, back: true })}
              onClose={() => setOpen(null)}
            />
          )}
        </Sheet>
      )}

      <div className="options-toolbar">
        <div className="segmented" role="tablist" aria-label="Kind">
          <button type="button" role="tab" aria-selected={kind === 'all'} className={kind === 'all' ? 'active' : ''} onClick={() => setKind('all')}>
            All
          </button>
          {OPTION_KINDS.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>
              <Icon name={KIND_ICON[k]} size={16} /> {KIND_PLURAL[k]} {counts[k] > 0 && <span className="count">{counts[k]}</span>}
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
            <strong>
              <Icon name="plane" size={16} /> Flight planner
            </strong>
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
  /** The option's details, read-only. */
  onOpen: (option: TripOption) => void
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
          <Icon name={KIND_ICON[group.kind]} /> {isTransport ? group.route || 'Transport' : KIND_PLURAL[group.kind]}
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
        <table className={`compare-table options-table${isTransport ? ' transport-table' : ''}`}>
          <thead>
            <tr>
              {/* Fixed widths (col-*) so the columns line up from one group's table to the next. */}
              <th>Name</th>
              <th className={`num${isTransport ? '' : ' col-price'}`}>{group.kind === 'hotel' ? 'Per night' : 'Price'}</th>
              {group.kind === 'hotel' && <th className="num col-price">Stay total</th>}
              {isTransport ? (
                <>
                  <th className="num">Time</th>
                  {/* Comfort (legroom, premium economy) is in the option's details. */}
                  <th className="baggage-head">Baggage (economy)</th>
                </>
              ) : (
                <th className="num col-distance">Distance</th>
              )}
              <th className="col-rating">Rating</th>
              <th className="col-score">Score</th>
              {/* Notes are in the edit form only: a notes column squeezed the actions out of narrow windows. */}
              <th className="col-actions" aria-label="Actions" />
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

function OptionRow({ item, group, trip, stays, days, placeIds, expenseIds, photos, onEdit, onOpen }: { item: Scored; group: Group } & Context) {
  const { option } = item
  const [choosing, setChoosing] = useState(false)
  const journey = option.journey
  const isTransport = group.kind === 'transport'
  // Options saved before fares existed show their one price as a fare.
  const fares = isTransport ? faresOf(option) : []
  const fare = chosenFare({ fares, fareIndex: option.fareIndex })
  const cheapest = cheapestFare(fares)
  const stale = isStale(fare?.seenOn)
  const carriers = journey?.mode === 'flight' ? journeyCarriers(journey) : []
  const inPlan = (option.placeId && placeIds.has(option.placeId)) || (option.expenseId && expenseIds.has(option.expenseId))
  const columns = 6 + (group.kind === 'hotel' ? 1 : 0) + (isTransport ? 1 : 0)

  const setStatus = (status: OptionStatus) => updateOption(option.id, { status: option.status === status ? 'idea' : status })
  // A tap on the row opens the details; its photo, link, stars, buttons and folded blocks keep their own job,
  // and selecting text doesn't open anything.
  const openDetails = (e: MouseEvent) => {
    if ((e.target as Element).closest('a, button, input, select, textarea, label, details') || getSelection()?.toString()) return
    onOpen(option)
  }

  return (
    <>
      <tr className={`option-row status-${option.status}`} onClick={openDetails}>
        <td className="option-name" data-label="Name">
          <div className="option-with-photo">
            <LeadPhoto images={photos.get(option.id) ?? []} name={option.name} />
            <div>
              <span className="option-title">
                {option.status === 'favorite' && (
                  <span className="status-mark favorite" title="Favorite">
                    <Icon name="star" size={15} filled />
                  </span>
                )}
                {option.status === 'chosen' && (
                  <span className="status-mark chosen" title="Chosen">
                    <Icon name="check" size={15} weight={2.6} />
                  </span>
                )}
                {journey && (
                  <span aria-hidden="true">
                    <Icon name={JOURNEY_ICON[journey.mode]} size={16} />{' '}
                  </span>
                )}
                {option.link ? (
                  <a href={option.link} target="_blank" rel="noreferrer">
                    {journey ? <RouteChain journey={journey} /> : option.name}
                  </a>
                ) : journey ? (
                  <RouteChain journey={journey} />
                ) : (
                  option.name
                )}
              </span>
              {journey ? (
                <span className="chips option-chips">
                  {journeyChips(journey).map((c) => (
                    <span key={c.text} className={`chip${c.warn ? ' warn' : ''}`}>
                      {c.warn && <Icon name="warning" size={14} />} {c.text}
                    </span>
                  ))}
                  {fares.length > 1 && cheapest?.price && (
                    <span className="chip">
                      {fares.length} fares from {formatMoney(cheapest.price)}
                    </span>
                  )}
                </span>
              ) : (
                <span className="muted small">
                  {[
                    option.category,
                    option.openingHours && describeWeek(option.openingHours),
                    option.hours,
                    option.bookAhead && BOOK_AHEAD_LABEL[option.bookAhead],
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
              {journey && <JourneyItinerary journey={journey} timesOnly />}
              {(inPlan || item.badges.length > 0) && (
                <span className="badges">
                  {inPlan && <span className="tag in-plan">{option.expenseId ? 'Booked' : 'In the itinerary'}</span>}
                  {item.badges.map((b) => (
                    <span key={b} className={`badge badge-${b}`}>
                      <Icon name={BADGE_ICON[b]} size={13} filled={b === 'top-rated'} /> {BADGE_LABEL[b]}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </div>
        </td>
        <td className={`num${isTransport ? '' : ' col-price'}`} data-label={group.kind === 'hotel' ? 'Per night' : 'Price'}>
          {/* Only the total here; the calculation ("¥1,500 × 2 = ¥3,000") is in the edit form (and on hover). */}
          <span
            className={stale ? 'stale-price' : ''}
            title={option.price && DAY_KINDS.includes(option.kind) ? describePriced(optionPriced(option), travelersOf(trip)) : undefined}
          >
            {!option.price
              ? '—'
              : formatMoney(DAY_KINDS.includes(option.kind) ? pricedTotal(optionPriced(option), travelersOf(trip))! : option.price)}
          </span>
          {fare && (fare.name || fare.seenOn) && (
            <span className={`muted small fare-seen${stale ? ' stale-price' : ''}`}>
              {[fare.name, fare.seenOn && `seen ${formatDay(fare.seenOn)}`].filter(Boolean).join(' · ')}
            </span>
          )}
        </td>
        {group.kind === 'hotel' && (
          <td className="num col-price" data-label="Stay total">
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
          </>
        ) : (
          <td className="num col-distance" data-label="Distance">
            {item.distanceKm == null ? (option.lat == null ? <span className="muted small">not located</span> : '—') : formatKm(item.distanceKm)}
          </td>
        )}
        <td className="col-rating" data-label="Rating">
          <Stars value={option.rating} onChange={(rating) => updateOption(option.id, { rating })} />
        </td>
        <td className="col-score" data-label="Score">
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
        <td className="option-actions">
          <button
            type="button"
            className={`icon-toggle${option.status === 'favorite' ? ' on' : ''}`}
            title="Favorite"
            aria-pressed={option.status === 'favorite'}
            onClick={() => setStatus('favorite')}
          >
            <Icon name="star" filled={option.status === 'favorite'} />
          </button>
          <button
            type="button"
            className={`icon-toggle${option.status === 'chosen' ? ' on' : ''}`}
            title={option.status === 'chosen' ? 'Chosen' : 'Choose'}
            aria-pressed={option.status === 'chosen'}
            onClick={() => (option.status === 'chosen' ? setStatus('chosen') : setChoosing(!choosing))}
          >
            <Icon name="check" />
          </button>
          <button
            type="button"
            className={`icon-toggle${option.status === 'discarded' ? ' on' : ''}`}
            title={option.status === 'discarded' ? 'Restore' : 'Discard'}
            aria-pressed={option.status === 'discarded'}
            onClick={() => setStatus('discarded')}
          >
            <Icon name="close" />
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

/** Everything about one option, read-only, with room to read it; "Edit" turns the sheet into the form. */
function OptionDetails({
  option,
  item,
  group,
  trip,
  images,
  inPlan,
  onEdit,
  onClose,
}: {
  option: TripOption
  /** Missing when the option isn't on the board (discarded while discarded ones are hidden). */
  item?: Scored
  group?: Group
  trip: Trip
  images: Blob[]
  inPlan: boolean
  onEdit: () => void
  onClose: () => void
}) {
  const journey = option.journey
  const fares = option.kind === 'transport' ? faresOf(option) : []
  const carriers = journey?.mode === 'flight' ? journeyCarriers(journey) : []
  // Long-haul first: their legroom matters most.
  const flightAirlines = [...new Map(carriers.map((c) => findAirline(c)).filter((a) => !!a).map((a) => [a!.name, a!])).values()].sort(
    (a, b) => Number(b.scope === 'international') - Number(a.scope === 'international'),
  )
  const priced = DAY_KINDS.includes(option.kind) ? optionPriced(option) : undefined
  const travelers = travelersOf(trip)
  // "¥1,500 × 2" next to the total; nothing when the total is the price itself.
  const calculation = priced?.price ? describePriced(priced, travelers).split(' = ')[0] : ''

  return (
    <div className="option-details">
      {images.length > 0 && <DetailPhotos images={images} name={option.name} />}

      <div>
        <p className="option-details-kicker">
          {option.category && <span className="muted small">{option.category}</span>}
          {option.city && <CityTag city={option.city} />}
          {inPlan && <span className="tag in-plan">{option.expenseId ? 'Booked' : 'In the itinerary'}</span>}
        </p>
        <h3 className="option-details-title">
          {option.status === 'favorite' && (
            <span className="status-mark favorite" title="Favorite">
              <Icon name="star" size={18} filled />
            </span>
          )}
          {option.status === 'chosen' && (
            <span className="status-mark chosen" title="Chosen">
              <Icon name="check" size={18} weight={2.6} />
            </span>
          )}
          {option.status === 'discarded' && <span className="muted small">Discarded · </span>}
          {journey ? (
            <>
              <Icon name={JOURNEY_ICON[journey.mode]} /> <RouteChain journey={journey} />
            </>
          ) : (
            option.name
          )}
        </h3>
        {journey && (
          <span className="chips option-chips">
            {journeyChips(journey).map((c) => (
              <span key={c.text} className={`chip${c.warn ? ' warn' : ''}`}>
                {c.warn && <Icon name="warning" size={14} />} {c.text}
              </span>
            ))}
          </span>
        )}
        {item && item.badges.length > 0 && (
          <span className="badges">
            {item.badges.map((b) => (
              <span key={b} className={`badge badge-${b}`}>
                <Icon name={BADGE_ICON[b]} size={13} filled={b === 'top-rated'} /> {BADGE_LABEL[b]}
              </span>
            ))}
          </span>
        )}
      </div>

      <dl className="option-details-facts">
        {option.kind !== 'transport' && option.price && (
          <>
            <dt>{option.kind === 'hotel' ? 'Per night' : DAY_KINDS.includes(option.kind) ? 'Price' : PRICE_LABEL[option.kind]}</dt>
            <dd>
              <strong>{formatMoney(priced ? pricedTotal(priced, travelers)! : option.price)}</strong>
              {calculation && calculation !== formatMoney(option.price) && <span className="muted small"> {calculation}</span>}
            </dd>
          </>
        )}
        {option.kind === 'hotel' && item?.total && (
          <>
            <dt>Stay total</dt>
            <dd>
              <strong>{formatMoney(item.total)}</strong>
              {item.nights != null && <span className="muted small"> {item.nights === 1 ? '1 night' : `${item.nights} nights`}</span>}
            </dd>
          </>
        )}
        {fares.length > 0 && (
          <>
            <dt>{fares.length === 1 ? 'Fare' : 'Fares'}</dt>
            <dd>
              <ul className="option-details-fares">
                {fares.map((f, i) => (
                  <li key={i} className={isStale(f.seenOn) ? 'stale-price' : ''}>
                    {/* The marked fare (the one in the budget) in bold. */}
                    <span className={fares.length > 1 && i === (option.fareIndex ?? 0) ? 'strong' : ''}>
                      {[f.name, f.price && formatMoney(f.price), f.bags].filter(Boolean).join(' · ')}
                    </span>
                    {f.seenOn && <span className="muted small"> · seen {formatDay(f.seenOn)}</span>}
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
        {journey?.durationHours != null && (
          <>
            <dt>Travel time</dt>
            <dd>{formatHours(journey.durationHours)}</dd>
          </>
        )}
        {flightAirlines.length > 0 && (
          <>
            <dt>Comfort</dt>
            <dd className="comfort-cell">
              {flightAirlines.map((a) => (
                <span key={a.name}>
                  {flightAirlines.length > 1 && <span className="muted">{a.name}: </span>}
                  {a.legroom?.economy ?? 'legroom not published'}
                  {a.premiumEconomy !== 'no' && <span className="muted"> · premium economy{a.premiumEconomy === 'some aircraft' ? ' on some aircraft' : ''}</span>}
                </span>
              ))}
            </dd>
          </>
        )}
        {item?.distanceKm != null && group?.reference && (
          <>
            <dt>Distance</dt>
            <dd>
              {formatKm(item.distanceKm)} <span className="muted small">from {group.reference.name}</span>
            </dd>
          </>
        )}
        {option.rating != null && (
          <>
            <dt>Your rating</dt>
            <dd>
              <Stars value={option.rating} />
            </dd>
          </>
        )}
        {(option.openingHours || option.hours) && (
          <>
            <dt>Hours</dt>
            <dd>{[option.openingHours && describeWeek(option.openingHours), option.hours].filter(Boolean).join(' · ')}</dd>
          </>
        )}
        {option.bookAhead && (
          <>
            <dt>Book ahead</dt>
            <dd>{BOOK_AHEAD_LABEL[option.bookAhead]}</dd>
          </>
        )}
        {option.lat != null && option.lng != null && (
          <>
            <dt>Location</dt>
            <dd>
              {option.address ?? `${option.lat.toFixed(5)}, ${option.lng.toFixed(5)}`}
              <br />
              <a href={placeUrl({ name: option.name, lat: option.lat, lng: option.lng, googlePlaceId: option.googlePlaceId })} target="_blank" rel="noreferrer">
                Open in Google Maps
              </a>
            </dd>
          </>
        )}
        {option.link && (
          <>
            <dt>Link</dt>
            <dd className="option-details-link">
              {/* Only the site: search links are long. */}
              <a href={option.link} target="_blank" rel="noreferrer" title={option.link}>
                {siteOf(option.link)}
              </a>
            </dd>
          </>
        )}
      </dl>

      {/* The route is already in the title: only the timed flights are added. */}
      {journey && <JourneyItinerary journey={journey} timesOnly />}
      {carriers.length > 0 && <BaggageBreakdown carriers={carriers} main={journey!.carrier} fare={journey!.fare} />}
      {option.notes && <p className="option-details-notes">{option.notes}</p>}

      <div className="row wrap sheet-actions">
        <button type="button" className="primary" onClick={onEdit}>
          <Icon name="edit" /> Edit
        </button>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

/** The option's photos on top of its details: the first one big, the others beside it; each opens the carousel. */
function DetailPhotos({ images, name }: { images: Blob[]; name: string }) {
  const [viewing, setViewing] = useState<number | null>(null)
  return (
    <div className={`option-details-photos count-${Math.min(images.length, 3)}`}>
      {images.slice(0, 3).map((image, i) => (
        <button key={i} type="button" onClick={() => setViewing(i)} aria-label={`Photo ${i + 1} of ${name}`}>
          <BlobImage image={image} alt="" />
        </button>
      ))}
      {viewing != null && <PhotoViewer images={images} start={viewing} name={name} onClose={() => setViewing(null)} />}
    </div>
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
    // The option's price is per ticket; the booking is for everyone on the trip.
    const travelers = travelersOf(trip)
    const initial = {
      id: '',
      tripId: trip.id,
      category: 'transport',
      description: option.name,
      amount: option.price
        ? { ...option.price, amount: option.price.amount * travelers }
        : { amount: 0, currency: trip.displayCurrency },
      notes: option.notes,
      journey: option.journey ?? { mode: 'flight', from: '', to: '' },
    } satisfies Expense
    return (
      <div className="choose-panel">
        <p className="small">
          Book it: it goes to the budget (check the date, time and price
          {travelers > 1 && option.price ? `; ${travelers} tickets × ${formatMoney(option.price)}` : ''}).
        </p>
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

/** "booking.com" from a full link; the link as typed when it isn't a URL. */
function siteOf(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, '')
  } catch {
    return link
  }
}

function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}
