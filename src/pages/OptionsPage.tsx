import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { AirlineGuideTable, BaggageBreakdown } from '../components/AirlineGuide'
import { Icon } from '../components/Icon'
import { findAirline } from '../data/airlines'
import { OptionForm } from '../components/OptionForm'
import { FlightPlanner } from '../components/FlightPlanner'
import { BADGE_ICON, BADGE_LABEL, formatKm, ItineraryTags, OptionDetails, type ItineraryState } from '../components/OptionDetails'
import { PHONE, WIDE } from '../breakpoints'
import { OptionsMapView, PickCityForMap, type OptionsMapProvider } from '../components/OptionsMap'
import { LeadPhoto } from '../components/Photos'
import { Sheet } from '../components/Sheet'
import { JourneyItinerary, journeyChips, RouteChain } from '../components/JourneyLegs'
import { Stars } from '../components/Stars'
import { CityTag, TripLayout } from '../components/TripLayout'
import { CityDot, DaySelect } from '../components/DaySelect'
import { useCityHue } from '../cityColors'
import { daysBetween, formatDay } from '../dates'
import { db } from '../db/db'
import type { Day, OptionKind, OptionStatus, Stay, Trip, TripOption } from '../db/model'
import { addOptionToDay, addOptionToTrip, removeOptionFromItinerary, updateOption } from '../db/options'
import { stayNights, stayOfCity } from '../db/stays'
import { describePriced, optionPriced, pricedTotal, travelersOf } from '../budget'
import { formatMoney } from '../format'
import { compareOptions, DEFAULT_WEIGHTS, type Group, type Scored, type Weights } from '../planning/compare'
import { cheapestFare, chosenFare, faresOf, isStale } from '../planning/fares'
import { describeWeek } from '../planning/hours'
import { formatHours, JOURNEY_ICON, journeyCarriers } from '../planning/journeys'
import { BOOK_AHEAD_LABEL, DAY_KINDS, KIND_ICON, KIND_PLURAL, KIND_SINGULAR, OPTION_KINDS } from '../planning/optionKinds'
import { href } from '../router'
import { loadJson, saveJson } from '../settings'
import { useMediaQuery } from '../useMediaQuery'
import { useOnline } from '../useOnline'
import { NotFound } from './TripPage'

const WEIGHTS_KEY = 'tabi.compareWeights'
/** "Show map" on the Options page, remembered on this device. */
const MAP_KEY = 'tabi.optionsMap'

/** Everything being considered, grouped by kind and city, to compare and pick. */
export function OptionsPage({ tripId, hasGoogleKey }: { tripId: string; hasGoogleKey: boolean }) {
  const trip = useLiveQuery(async () => (await db.trips.get(tripId)) ?? null, [tripId])
  const options = useLiveQuery(() => db.options.where('tripId').equals(tripId).toArray(), [tripId])
  const stays = useLiveQuery(() => db.stays.where('tripId').equals(tripId).toArray(), [tripId])
  const days = useLiveQuery(() => db.days.where('tripId').equals(tripId).sortBy('date'), [tripId])
  const placeIds = useLiveQuery(async () => new Set(await db.places.where('tripId').equals(tripId).primaryKeys()), [tripId])
  const expenseIds = useLiveQuery(async () => new Set(await db.expenses.where('tripId').equals(tripId).primaryKeys()), [tripId])
  // Places and trip-wide stays/journeys ticked "Booked" (reserved in real life).
  const bookedIds = useLiveQuery(async () => {
    const places = await db.places.where('tripId').equals(tripId).filter((p) => !!p.bookAhead && !!p.booked).primaryKeys()
    const expenses = await db.expenses.where('tripId').equals(tripId).filter((e) => !!e.booked).primaryKeys()
    return new Set([...places, ...expenses])
  }, [tripId])
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
  const [mapOn, setMapOnState] = useState(() => loadJson<boolean>(MAP_KEY) ?? false)
  const setMapOn = (on: boolean) => {
    setMapOnState(on)
    saveJson(MAP_KEY, on)
  }
  const wide = useMediaQuery(WIDE)
  const phone = useMediaQuery(PHONE)
  const online = useOnline()
  // The trip's offline map (downloaded on a day page): the options map without internet.
  const hasOfflineMap = useLiveQuery(async () => !!(await db.mapAreas.get(tripId)), [tripId])
  // A Google map already shown stays while it is (unmounting it offline can make Google's code throw).
  const [googleShown, setGoogleShown] = useState(false)
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

  if (trip === undefined || !options || !stays || !days || !placeIds || !expenseIds || !bookedIds || !photos) return null
  if (!trip) return <NotFound />

  // Same city filter as the list, so the tab counts match what each tab shows.
  const inCity = (o: TripOption) => !city || (o.city ?? '').trim().toLowerCase() === city.toLowerCase()
  const counts = Object.fromEntries(
    OPTION_KINDS.map((k) => [k, options.filter((o) => o.kind === k && o.status !== 'discarded' && inCity(o)).length]),
  )
  // Discarded ones the current filters would show: on phones, "N discarded hidden · Show" at the end of the list.
  const discarded = options.filter((o) => o.status === 'discarded' && (kind === 'all' || o.kind === kind) && inCity(o)).length
  const context = {
    trip,
    stays,
    days,
    placeIds,
    expenseIds,
    bookedIds,
    photos,
    onEdit: (o: TripOption) => setOpen({ id: o.id, edit: true }),
    onOpen: (o: TripOption) => setOpen({ id: o.id, edit: false }),
  }
  // Gone when it was just deleted: the sheet closes.
  const openOption = open && open !== 'new' ? options.find((o) => o.id === open.id) : undefined
  const openGroup = openOption && groups.find((g) => g.items.some((i) => i.option.id === openOption.id))
  const closeForm = () => setOpen(open && open !== 'new' && open.back ? { id: open.id, edit: false } : null)
  const inPlan = (o: TripOption) => itineraryState(o, context)
  // The map shows places (not transport routes), one city at a time: nothing is loaded for "All cities".
  // Google with internet; without, the offline map if this trip's was downloaded; else no map at all.
  const provider: OptionsMapProvider | null = hasGoogleKey && (online || googleShown) ? 'google' : hasOfflineMap ? 'offline' : null
  const mapAvailable = !!provider && kind !== 'transport'
  const showMap = mapAvailable && mapOn
  const mapGroups = showMap && city ? groups.filter((g) => g.kind !== 'transport') : []
  const googleOnScreen = provider === 'google' && mapGroups.length > 0
  if (googleOnScreen !== googleShown) setGoogleShown(googleOnScreen)
  const listGroups = showMap && city ? groups.filter((g) => g.kind === 'transport') : groups
  // On a phone the map and its drawer take the screen: the intro and the score settings wait for the list.
  const compact = showMap && !!city && !wide
  // Airlines in the transport options, highlighted in the airline guide.
  const myAirlines = [
    ...new Set(
      options
        .filter((o) => o.journey?.mode === 'flight' && o.status !== 'discarded')
        .flatMap((o) => journeyCarriers(o.journey!).map((c) => findAirline(c)?.name))
        .filter((n): n is string => !!n),
    ),
  ]

  const mapToggle = mapAvailable && (
    <button
      type="button"
      className={`options-map-toggle${mapOn ? ' on' : ''}`}
      aria-pressed={mapOn}
      aria-label="Map"
      title={mapOn ? 'Hide map' : 'Show map'}
      onClick={() => setMapOn(!mapOn)}
    >
      {/* Phones: the icon only, a toggle (highlighted while the map is shown). */}
      <Icon name="map" size={16} /> <span className="options-map-toggle-label">{mapOn ? 'Hide map' : 'Show map'}</span>
    </button>
  )

  return (
    <TripLayout trip={trip} active="options">
      {/* Phones: no title (the bottom bar says where you are); city, map and add on one line, the kinds as tabs below. */}
      {phone ? (
        <div className="options-phone-bar">
          <div className="options-phone-top">
            <CityFilter city={city} cities={cities} onChange={setCity} />
            {mapToggle}
            <button type="button" className="primary options-add" aria-label="Add option" title="Add option" onClick={() => setOpen('new')}>
              <Icon name="plus" size={20} />
            </button>
          </div>
          <div className="options-tabs" role="tablist" aria-label="Kind">
            <button type="button" role="tab" aria-selected={kind === 'all'} className={kind === 'all' ? 'active' : ''} onClick={() => setKind('all')}>
              <strong>All</strong>
              <span>{OPTION_KINDS.reduce((sum, k) => sum + counts[k], 0)}</span>
            </button>
            {OPTION_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                aria-label={KIND_PLURAL[k]}
                title={KIND_PLURAL[k]}
                className={kind === k ? 'active' : ''}
                onClick={() => setKind(k)}
              >
                <Icon name={KIND_ICON[k]} size={20} />
                <span>{counts[k]}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <header className="hero row between">
          <span>
            <p className="hero-kicker trip-kicker">{trip.name}</p>
            <h1>Options</h1>
          </span>
          <button type="button" className="primary" onClick={() => setOpen('new')}>
            <Icon name="plus" /> Add option
          </button>
        </header>
      )}
      {!compact && !phone && (
        <p className="muted small options-intro">
          Options to consider for your trip. <Icon name="star" size={14} /> marks a favorite, <Icon name="check" size={14} />{' '}
          adds it to the itinerary, <Icon name="close" size={14} /> discards it.
        </p>
      )}

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
              inPlan={inPlan(openOption)}
              onEdit={() => setOpen({ id: openOption.id, edit: true, back: true })}
              onClose={() => setOpen(null)}
            />
          )}
        </Sheet>
      )}

      {!phone && (
        <div className="options-toolbar">
          {/* Kinds and city on one line (the city at its right end); the map and discarded switches after them. */}
          <div className="options-filters">
            {/* The kinds with "Show discarded" (small) right after them; the city at the line's end (User). */}
            <span className="options-filters-start">
              <div className="segmented" role="tablist" aria-label="Kind">
                <button type="button" role="tab" aria-selected={kind === 'all'} className={kind === 'all' ? 'active' : ''} onClick={() => setKind('all')}>
                  All
                </button>
                {OPTION_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={kind === k}
                    aria-label={KIND_PLURAL[k]}
                    title={KIND_PLURAL[k]}
                    className={kind === k ? 'active' : ''}
                    onClick={() => setKind(k)}
                  >
                    <Icon name={KIND_ICON[k]} size={16} /> <span className="kind-label">{KIND_PLURAL[k]}</span>{' '}
                    {counts[k] > 0 && <span className="count">{counts[k]}</span>}
                  </button>
                ))}
              </div>
              <label className="check options-discarded">
                <input type="checkbox" role="switch" className="toggle" checked={showDiscarded} onChange={(e) => setShowDiscarded(e.target.checked)} />
                Show discarded
              </label>
            </span>
            <CityFilter city={city} cities={cities} onChange={setCity} />
          </div>
          <div className="row wrap options-switches">{mapToggle}</div>
        </div>
      )}

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

      {showMap && !city && cities.length > 0 && <PickCityForMap cities={cities} onPick={setCity} />}
      {mapGroups.length > 0 && (
        <OptionsMapView
          city={city}
          provider={provider!}
          groups={mapGroups}
          trip={trip}
          base={stayOfCity(stays, city)?.base}
          photos={photos}
          inPlan={inPlan}
          onOpen={context.onOpen}
        />
      )}

      {groups.length === 0 && (
        <section className="empty-state">
          <p>Nothing here yet.</p>
          <p className="muted small">Add the hotels, restaurants and places you're considering to compare them.</p>
        </section>
      )}

      {listGroups.map((group) => (
        <OptionGroup key={group.key} group={group} {...context} />
      ))}

      {phone && (showDiscarded || discarded > 0) && (
        <p className="discarded-toggle">
          <button type="button" className="link" onClick={() => setShowDiscarded(!showDiscarded)}>
            {showDiscarded ? 'Hide discarded' : `${discarded} discarded hidden · Show`}
          </button>
        </p>
      )}

      {groups.length > 0 && <WeightsLink weights={weights} onChange={setWeights} />}

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
  /** Places and trip-wide expenses ticked "Booked". */
  bookedIds: Set<string>
  /** Photos by option id. */
  photos: Map<string, Blob[]>
  onEdit: (option: TripOption) => void
  /** The option's details, read-only. */
  onOpen: (option: TripOption) => void
}

/** In a day (its place) or in the trip (its stay / journey), and whether that is ticked "Booked". */
function itineraryState(option: TripOption, { placeIds, expenseIds, bookedIds }: Pick<Context, 'placeIds' | 'expenseIds' | 'bookedIds'>): ItineraryState {
  const id = option.placeId && placeIds.has(option.placeId) ? option.placeId : option.expenseId && expenseIds.has(option.expenseId) ? option.expenseId : null
  return id ? (bookedIds.has(id) ? 'booked' : 'in') : false
}

function OptionGroup({ group, ...context }: { group: Group } & Context) {
  const { trip, stays } = context
  const nights = group.kind === 'hotel' && group.stay ? stayNights(group.stay, trip, stays) : null
  const isTransport = group.kind === 'transport'
  const facts = [
    group.kind === 'hotel' && group.stay && group.stay.kind && group.stay.kind !== 'stay' && 'No night here (day trip or stop on the way)',
    nights &&
      nights.nights > 0 &&
      `${nights.nights} ${nights.nights === 1 ? 'night' : 'nights'} (${formatDay(nights.checkIn)} → ${formatDay(nights.checkOut)})`,
  ].filter(Boolean)
  const noteIsHint = isTransport || !group.reference
  const note = isTransport
    ? 'Compared by price, total travel time and your rating. Baggage from the airline guide below.'
    : group.reference
      ? `Distances from ${group.reference.name}`
      : 'Set a base for this city (Cities, on the itinerary page) to compare distances'
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
        {/* Explanations (`option-group-hint`) are left out on phones; the facts stay. */}
        <p className={`muted small${facts.length === 0 && noteIsHint ? ' option-group-hint' : ''}`}>
          {facts.join(' · ')}
          <span className={noteIsHint ? 'option-group-hint' : undefined}>
            {facts.length > 0 && ' · '}
            {note}
          </span>
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

function OptionRow({ item, group, trip, stays, days, placeIds, expenseIds, bookedIds, photos, onEdit, onOpen }: { item: Scored; group: Group } & Context) {
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
  const inPlan = itineraryState(option, { placeIds, expenseIds, bookedIds })
  // In the itinerary counts as chosen: un-ticking it takes it out (after a confirmation).
  const chosen = option.status === 'chosen' || !!inPlan
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
                  <ItineraryTags state={inPlan} />
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
            className={`icon-toggle${chosen ? ' on' : ''}`}
            title={inPlan ? 'In the itinerary' : chosen ? 'Chosen' : 'Choose'}
            aria-pressed={chosen}
            onClick={() => (inPlan ? setChoosing(!choosing) : chosen ? setStatus('chosen') : setChoosing(!choosing))}
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
            {inPlan ? (
              <TakeOutPanel option={option} booked={inPlan === 'booked'} onDone={() => setChoosing(false)} />
            ) : (
              <ChoosePanel item={item} trip={trip} stays={stays} days={days} onDone={() => setChoosing(false)} />
            )}
          </td>
        </tr>
      )}
    </>
  )
}

/**
 * Un-ticking an option in the itinerary (User's choice 5A from a mock, 2026-10-27): it leaves the itinerary once
 * confirmed. A booked one warns that the real booking may need cancelling.
 */
function TakeOutPanel({ option, booked, onDone }: { option: TripOption; booked: boolean; onDone: () => void }) {
  const leaves = option.expenseId ? 'the budget and the checklist' : 'its day (with the way there) and the checklist'
  return (
    <div className="choose-panel add-to-day">
      <PanelHead title="Take it out of the itinerary?" onClose={onDone} />
      {booked && <span className="small warning">It's marked as booked: remember to cancel the real booking if you need to.</span>}
      <span className="small muted">It leaves {leaves}; the option stays here, not chosen.</span>
      <div className="row">
        <button type="button" className="primary" onClick={() => removeOptionFromItinerary(option).then(onDone)}>
          Take it out
        </button>
        <button type="button" onClick={onDone}>
          Keep it
        </button>
      </div>
    </div>
  )
}

/** The title of a choose box and its ✕. */
function PanelHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="add-to-day-head">
      <strong>{title}</strong>
      <button type="button" className="ghost icon-button" aria-label="Cancel" title="Cancel" onClick={onClose}>
        <Icon name="close" size={18} />
      </button>
    </div>
  )
}

/** "1,230.00" or "" for an input. */
const amountText = (money?: { amount: number }) => (money ? String(money.amount) : '')

/** A number typed in a price field, or null when it isn't one. */
function typedAmount(text: string): number | null {
  const value = Number(text)
  return text.trim() !== '' && Number.isFinite(value) && value >= 0 ? value : null
}

function CurrencyPicker({ trip, value, onChange }: { trip: Trip; value: string; onChange: (currency: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Currency">
      {[...new Set([trip.baseCurrency, trip.displayCurrency, value])].map((c) => (
        <option key={c}>{c}</option>
      ))}
    </select>
  )
}

/**
 * ✓ on a hotel (User's choice 1B from a mock, 2026-10-27): a small box with the dates (the city's stay)
 * and the price, already editable; "Add" puts it in the itinerary (a stay in the trip, counted in the budget).
 * Not booked: that is a check of its own, ticked later.
 */
function AddHotelPanel({ item, trip, stays, onDone }: { item: Scored; trip: Trip; stays: Stay[]; onDone: () => void }) {
  const { option } = item
  const stay = stayOfCity(stays, option.city)
  const stayed = stay ? stayNights(stay, trip, stays) : null
  const [checkIn, setCheckIn] = useState(stayed && stayed.nights > 0 ? stayed.checkIn : '')
  const [checkOut, setCheckOut] = useState(stayed && stayed.nights > 0 ? stayed.checkOut : '')
  const [mode, setMode] = useState<'night' | 'total'>(option.totalPrice || !option.price ? 'total' : 'night')
  const [price, setPrice] = useState(amountText(option.totalPrice ?? option.price))
  const [currency, setCurrency] = useState((option.totalPrice ?? option.price)?.currency ?? trip.baseCurrency)
  const nights = checkIn && checkOut ? daysBetween(checkIn, checkOut) : 0
  const value = typedAmount(price)
  const total = value == null ? null : mode === 'night' ? value * nights : value
  const valid = nights > 0 && total != null

  async function add() {
    if (!valid) return
    await addOptionToTrip(option, {
      tripId: trip.id,
      category: 'lodging',
      description: option.name,
      amount: { amount: total, currency },
      notes: option.notes,
      hotel: { name: option.name, checkIn, checkOut, nights, perNight: mode === 'night' ? value! : undefined },
    })
    onDone()
  }

  return (
    <div className="choose-panel add-to-day add-to-trip">
      <PanelHead title="Add to the itinerary" onClose={onDone} />
      <div className="add-stay-dates">
        <label className="date-chip">
          <small>Check-in</small>
          <input type="date" value={checkIn} max={checkOut || undefined} onChange={(e) => setCheckIn(e.target.value)} />
        </label>
        <span className="add-stay-nights">
          <strong>{nights > 0 ? nights : '–'}</strong> {nights === 1 ? 'night' : 'nights'}
        </span>
        <label className="date-chip">
          <small>Check-out</small>
          <input type="date" value={checkOut} min={checkIn || undefined} onChange={(e) => setCheckOut(e.target.value)} />
        </label>
      </div>
      <div className="add-trip-price">
        <input type="number" min="0" step="any" inputMode="decimal" aria-label="Price" value={price} onChange={(e) => setPrice(e.target.value)} />
        <CurrencyPicker trip={trip} value={currency} onChange={setCurrency} />
        <div className="segmented" role="radiogroup" aria-label="Price is">
          {(
            [
              ['night', '/night'],
              ['total', 'total'],
            ] as const
          ).map(([m, label]) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="add-trip-footer">
        <span className="muted small">
          {checkIn && checkOut && nights <= 0
            ? 'Check-out must be after check-in.'
            : mode === 'night' && valid
              ? `${formatMoney({ amount: total, currency })} for ${nights} ${nights === 1 ? 'night' : 'nights'}`
              : ''}
        </span>
        <button type="button" className="primary" disabled={!valid} onClick={add}>
          Add
        </button>
      </div>
    </div>
  )
}

/** ✓ on a transport option: the same small box, with the date and the price for everyone (tickets × travelers). */
function AddJourneyPanel({ option, trip, onDone }: { option: TripOption; trip: Trip; onDone: () => void }) {
  const journey = option.journey ?? { mode: 'flight' as const, from: '', to: '' }
  const travelers = travelersOf(trip)
  const [date, setDate] = useState(journey.date ?? '')
  const [price, setPrice] = useState(option.price ? String(option.price.amount * travelers) : '')
  const [currency, setCurrency] = useState(option.price?.currency ?? trip.displayCurrency)
  const value = typedAmount(price)
  const tickets = option.price && travelers > 1 && value === option.price.amount * travelers && currency === option.price.currency

  async function add() {
    if (value == null) return
    await addOptionToTrip(option, {
      tripId: trip.id,
      category: 'transport',
      description: `${journey.from} → ${journey.to}`,
      amount: { amount: value, currency },
      notes: option.notes,
      journey: { ...journey, date: date || undefined },
    })
    onDone()
  }

  return (
    <div className="choose-panel add-to-day add-to-trip">
      <PanelHead title="Add to the itinerary" onClose={onDone} />
      <label className="date-chip">
        <small>{journey.legs?.length ? 'Date of the first departure' : 'Date'}</small>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <div className="add-trip-price">
        <input type="number" min="0" step="any" inputMode="decimal" aria-label="Price for everyone" value={price} onChange={(e) => setPrice(e.target.value)} />
        <CurrencyPicker trip={trip} value={currency} onChange={setCurrency} />
      </div>
      <div className="add-trip-footer">
        <span className="muted small">{tickets ? `${travelers} tickets × ${formatMoney(option.price!)}` : travelers > 1 ? `For ${travelers} people` : ''}</span>
        <button type="button" className="primary" disabled={value == null} onClick={add}>
          Add
        </button>
      </div>
    </div>
  )
}

/** Picking an option: hotels and transport go into the trip; the rest goes into a day. */
function ChoosePanel({ item, trip, stays, days, onDone }: { item: Scored; trip: Trip; stays: Stay[]; days: Day[]; onDone: () => void }) {
  const { option } = item
  const stay = stayOfCity(stays, option.city)
  const [dayId, setDayId] = useState(() => days.find((d) => stay && d.date >= stay.startDate)?.id ?? days[0]?.id ?? '')
  const [error, setError] = useState('')

  if (option.kind === 'hotel') return <AddHotelPanel item={item} trip={trip} stays={stays} onDone={onDone} />
  if (option.kind === 'transport') return <AddJourneyPanel option={option} trip={trip} onDone={onDone} />

  // Its own box (User's choice C from a mock, 2026-10-27): one big button (Add), the rest as small links, ✕ to close.
  return (
    <div className="choose-panel add-to-day">
      <div className="add-to-day-head">
        <strong>Add to day</strong>
        <button type="button" className="ghost icon-button" aria-label="Cancel" title="Cancel" onClick={onDone}>
          <Icon name="close" size={18} />
        </button>
      </div>
      {option.lat == null ? (
        <span className="small">Locate it first (Edit → Location) to add it to a day.</span>
      ) : (
        <div className="row">
          <DaySelect days={days} stays={stays} city={option.city} value={dayId} onChange={setDayId} />
          <button
            type="button"
            className="primary"
            disabled={!dayId}
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
        </div>
      )}
      {error && <span className="error small">{error}</span>}
      <div className="add-to-day-links">
        <button type="button" className="link" onClick={() => updateOption(option.id, { status: 'chosen' }).then(onDone)}>
          Just mark as chosen
        </button>
        {option.lat != null && dayId && (
          <a className="muted" href={href({ page: 'day', tripId: trip.id, dayId })}>
            Open that day
          </a>
        )}
      </div>
    </div>
  )
}

/**
 * The city filter, styled like the kinds bar next to it; in the city's color once one is chosen.
 * Keyboard: ↑ ↓ to move, Enter to pick, Esc to close.
 */
function CityFilter({ city, cities, onChange }: { city: string; cities: string[]; onChange: (city: string) => void }) {
  // Inside TripLayout, so the hue is the city's tag color.
  const hue = useCityHue(city)
  const [expanded, setExpanded] = useState(false)
  const [active, setActive] = useState(city)
  const root = useRef<HTMLSpanElement>(null)
  const values = ['', ...cities]

  // A tap anywhere else closes the list.
  useEffect(() => {
    if (!expanded) return
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setExpanded(false)
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [expanded])

  const show = () => {
    setActive(city)
    setExpanded(true)
  }
  const pick = (value: string) => {
    onChange(value)
    setExpanded(false)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && expanded) {
      e.preventDefault()
      setExpanded(false)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!expanded) return show()
      const i = values.indexOf(active)
      setActive(values[Math.min(values.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))])
    } else if ((e.key === 'Enter' || e.key === ' ') && expanded) {
      e.preventDefault()
      pick(active)
    }
  }

  // Our own list (Chrome's native one can't be styled): "All cities", then each city with its color.
  return (
    <span ref={root} className={`city-filter${city ? ' chosen' : ''}`} style={city ? { ['--hue' as string]: hue } : undefined}>
      <button
        type="button"
        className="city-filter-button"
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-label="City"
        onClick={() => (expanded ? setExpanded(false) : show())}
        onKeyDown={onKeyDown}
      >
        <Icon name="pin" size={16} />
        <span className="city-filter-name">{city || 'All cities'}</span>
        <Icon name={expanded ? 'up' : 'down'} size={18} />
      </button>
      {expanded && (
        <ul className="option-select-list city-filter-list" role="listbox" aria-label="City">
          {values.map((value) => (
            <li
              key={value || 'all'}
              role="option"
              aria-selected={value === city}
              className={`option-select-item${value === active ? ' active' : ''}`}
              onPointerEnter={() => setActive(value)}
              onClick={() => pick(value)}
            >
              {value ? <CityDot city={value} /> : <Icon name="pin" size={16} />}
              <span className="option-select-name">{value || 'All cities'}</span>
              {value === city && <Icon name="check" size={16} />}
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}

/** A quiet link at the end of the page: how scores are made and the weights, in a sheet. */
function WeightsLink({ weights, onChange }: { weights: Weights; onChange: (w: Weights) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="weights-link">
      <button type="button" className="link" onClick={() => setOpen(true)}>
        <Icon name="settings" size={16} /> How the score works · weights
      </button>
      {open && (
        <Sheet title="How the score works" onClose={() => setOpen(false)}>
          <WeightsPanel weights={weights} onChange={onChange} />
          <div className="row wrap sheet-actions">
            <button type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </Sheet>
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
    <div className="weights-panel">
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
    </div>
  )
}

