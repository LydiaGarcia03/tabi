import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { AirlineGuideTable } from '../components/AirlineGuide'
import { Icon } from '../components/Icon'
import { findAirline } from '../data/airlines'
import { OptionForm } from '../components/OptionForm'
import { FlightPlanner } from '../components/FlightPlanner'
import { OptionDetails } from '../components/OptionDetails'
import { PHONE, WIDE } from '../breakpoints'
import { OptionsMapView, PickCityForMap, type OptionsMapProvider } from '../components/OptionsMap'
import { Sheet } from '../components/Sheet'
import { TripLayout } from '../components/TripLayout'
import { db } from '../db/db'
import type { OptionKind, TripOption } from '../db/model'
import { stayOfCity } from '../db/stays'
import { compareOptions, DEFAULT_WEIGHTS, type Group, type Weights } from '../planning/compare'
import { journeyCarriers } from '../planning/journeys'
import { KIND_ICON, KIND_PLURAL, KIND_SINGULAR, OPTION_KINDS } from '../planning/optionKinds'
import { loadJson, saveJson } from '../settings'
import { useMediaQuery } from '../useMediaQuery'
import { useOnline } from '../useOnline'
import { CityFilter } from '../components/options/CityFilter'
import { itineraryState } from '../components/options/itinerary'
import { OptionGroup } from '../components/options/OptionGroup'
import { WeightsLink } from '../components/options/Weights'
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
