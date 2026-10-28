import { useState, type MouseEvent } from 'react'
import { BaggageBreakdown } from '../AirlineGuide'
import { Icon } from '../Icon'
import { itineraryState } from './itinerary'
import { BADGE_ICON, BADGE_LABEL, formatKm, ItineraryTags } from '../OptionDetails'
import { LeadPhoto } from '../Photos'
import { JourneyItinerary, journeyChips, RouteChain } from '../JourneyLegs'
import { Stars } from '../Stars'
import { CityTag } from '../TripLayout'
import { formatDay } from '../../dates'
import type { Day, OptionStatus, Stay, Trip, TripOption } from '../../db/model'
import { updateOption } from '../../db/options'
import { stayNights } from '../../db/stays'
import { describePriced, optionPriced, pricedTotal, travelersOf } from '../../budget'
import { formatMoney } from '../../format'
import { type Group, type Scored } from '../../planning/compare'
import { cheapestFare, chosenFare, faresOf, isStale } from '../../planning/fares'
import { describeWeek } from '../../planning/hours'
import { formatHours, JOURNEY_ICON, journeyCarriers } from '../../planning/journeys'
import { BOOK_AHEAD_LABEL, DAY_KINDS, KIND_ICON, KIND_PLURAL } from '../../planning/optionKinds'
import { ChoosePanel, TakeOutPanel } from './ChoosePanel'

export interface Context {
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

export function OptionGroup({ group, ...context }: { group: Group } & Context) {
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

export function OptionRow({ item, group, trip, stays, days, placeIds, expenseIds, bookedIds, photos, onEdit, onOpen }: { item: Scored; group: Group } & Context) {
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
          {/* The fare and the day it was seen on lines of their own: on one line they widened the column and cut
              the table (User, 2026-10-28). */}
          {fare?.name && <span className={`muted small fare-seen${stale ? ' stale-price' : ''}`}>{fare.name}</span>}
          {fare?.seenOn && <span className={`muted small fare-seen${stale ? ' stale-price' : ''}`}>seen {formatDay(fare.seenOn)}</span>}
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
