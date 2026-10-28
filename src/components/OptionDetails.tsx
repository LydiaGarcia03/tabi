import { useState } from 'react'
import { describePriced, optionPriced, pricedTotal, travelersOf } from '../budget'
import { findAirline } from '../data/airlines'
import { formatDay } from '../dates'
import type { Trip, TripOption } from '../db/model'
import { formatMoney } from '../format'
import { placeUrl } from '../googleMapsLinks'
import type { Badge, Group, Scored } from '../planning/compare'
import { faresOf, isStale } from '../planning/fares'
import { describeWeek } from '../planning/hours'
import { formatHours, JOURNEY_ICON, journeyCarriers } from '../planning/journeys'
import { BOOK_AHEAD_LABEL, DAY_KINDS, PRICE_LABEL } from '../planning/optionKinds'
import { BaggageBreakdown } from './AirlineGuide'
import { Icon, type IconName } from './Icon'
import { JourneyItinerary, journeyChips, RouteChain } from './JourneyLegs'
import { BlobImage, PhotoViewer } from './Photos'
import { Stars } from './Stars'
import { CityTag } from './TripLayout'

export const BADGE_LABEL: Record<Badge, string> = {
  best: 'Best match',
  cheapest: 'Cheapest',
  closest: 'Closest',
  fastest: 'Fastest',
  'top-rated': 'Your top',
}

export const BADGE_ICON: Record<Badge, IconName> = {
  best: 'sparkle',
  cheapest: 'wallet',
  closest: 'pin',
  fastest: 'clock',
  'top-rated': 'star',
}

/** Whether an option is in the itinerary (a place of a day, a stay or journey of the trip), and ticked "Booked" there. */
export type ItineraryState = false | 'in' | 'booked'

/** "In the itinerary", plus "Booked" once reserved in real life (no "not booked" tag: the checklist says what is left). */
export function ItineraryTags({ state }: { state: ItineraryState }) {
  if (!state) return null
  return (
    <>
      <span className="tag in-plan">In the itinerary</span>
      {state === 'booked' && (
        <span className="tag in-plan booked">
          <Icon name="check" size={12} weight={2.6} /> Booked
        </span>
      )}
    </>
  )
}

/**
 * Everything about one option, read-only, with room to read it; "Edit" turns the sheet into the form.
 * Without `onEdit` (from the itinerary) it is only for reading: options are edited on the Options page.
 */
export function OptionDetails({
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
  /** Missing when the option isn't on the board (discarded while discarded ones are hidden), or seen from the itinerary. */
  item?: Scored
  group?: Group
  trip: Trip
  images: Blob[]
  inPlan: ItineraryState
  onEdit?: () => void
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
          <ItineraryTags state={inPlan} />
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
        {onEdit && (
          <button type="button" className="primary" onClick={onEdit}>
            <Icon name="edit" /> Edit
          </button>
        )}
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

function siteOf(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, '')
  } catch {
    return link
  }
}

export function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}
