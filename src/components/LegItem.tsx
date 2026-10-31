import { Fragment, useEffect, useState } from 'react'
import { formatDay } from '../dates'
import { chooseAlternative, deleteLeg, retranslateLeg, saveLeg, toSegments } from '../db/legs'
import type { Leg, Place, Segment } from '../db/model'
import type { Drawing } from '../drawing'
import { MODE_ICON, MODE_LABEL, fareUnknown, formatDuration, formatMoney, formatTime, segmentColor } from '../format'
import { formatMinutes, toMinutes, visitMinutes } from '../planning/hours'
import { directionsUrl } from '../googleMapsLinks'
import { distanceKm } from '../geo'
import type { IconName } from '../iconPaths'
import { translateRouteResult } from '../i18n/japaneseNames'
import { flightRoute, flightSegments, refreshFlightSteps, type FlightSource } from '../planning/flightSteps'
import { journeyCarriers } from '../planning/journeys'
import { inJapan, utcOffsetAt } from '../data/countries'
import { computeDrivingRoute, computeWalkingRoute, googleProvider } from '../routing/googleProvider'
import { navitimeProvider, suggestionDate } from '../routing/providers'
import { RouteProviderError, type Money, type RouteOption } from '../routing/types'
import { Icon } from './Icon'
import { InfoTip } from './InfoTip'
import { SegmentForm } from './SegmentForm'
import { RouteTimeline, textOn } from './RouteTimeline'

interface Props {
  tripId: string
  leg: Leg | undefined
  from: Place
  to: Place
  /** Date of the day, "YYYY-MM-DD". */
  date: string
  /** Trip currency, used for new segment costs. */
  currency: string
  /** The trip's currencies (a choice next to a step's cost when there are several). */
  currencies?: string[]
  /** The trip's countries: route times are asked in their time zone. */
  countries?: string[]
  hasGoogleKey: boolean
  open: boolean
  onToggle: () => void
  /** Starts drawing a segment on the day map. */
  onDraw: (drawing: Drawing) => void
  /** Adds a "back to base" stop between the two places (hidden when not given). */
  onAddBaseStop?: () => void
  /** Flights of the day in the itinerary not used in its route yet: "Use my flight". */
  flights?: FlightSource[]
  /** Every flight of the day, used or not: keeps the flight steps up to date with their source. */
  allFlights?: FlightSource[]
}

/**
 * The way between two consecutive places. Header (User's mix of two mocks,
 * 2026-10-25): "GETTING THERE · 1 h 7 min · ¥1,080", the line chain under it
 * while closed, a chevron; "+ Add the way there" when there's no route yet.
 */
export function LegItem({
  tripId,
  leg,
  from,
  to,
  date,
  currency,
  currencies,
  countries,
  hasGoogleKey,
  open,
  onToggle,
  onDraw,
  onAddBaseStop,
  flights = [],
  allFlights = [],
}: Props) {
  const segments = leg?.segments ?? []
  return (
    <li className={`leg-item${open ? ' open' : ''}${segments.length ? '' : ' empty'}`}>
      {segments.length === 0 && !open ? (
        <div className="leg-add-row">
          <button type="button" className="leg-add" onClick={onToggle} aria-expanded={false}>
            <Icon name="plus" size={15} /> Add the way there
          </button>
          <UseFlight flights={flights} onUse={(f) => saveLeg(tripId, from.id, to.id, { segments: flightSegments(f) })} />
        </div>
      ) : (
        <button type="button" className="leg-summary" onClick={onToggle} aria-expanded={open}>
          <span className="leg-label">
            <span className="leg-title">
              Getting there
              <LegTotals segments={segments} />
            </span>
            {/* Open, the timeline below says it all: the chain would repeat it. */}
            {segments.length > 0 && !open && <LegChain segments={segments} />}
          </span>
          <span className="leg-chevron">
            <Icon name={open ? 'up' : 'down'} size={16} />
          </span>
        </button>
      )}
      {open && (
        <LegEditor
          tripId={tripId}
          leg={leg}
          from={from}
          to={to}
          date={date}
          currency={currency}
          currencies={currencies}
          countries={countries}
          hasGoogleKey={hasGoogleKey}
          onDraw={onDraw}
          onAddBaseStop={onAddBaseStop}
          flights={flights}
          allFlights={allFlights}
        />
      )}
    </li>
  )
}

/**
 * "✈ Use my flight ITM → OKA" (design chosen by User from a mock,
 * 2026-10-26); with several flights, a short list.
 */
function UseFlight({ flights, onUse }: { flights: FlightSource[]; onUse: (flight: FlightSource) => void }) {
  const [choosing, setChoosing] = useState(false)
  if (flights.length === 0) return null
  if (flights.length === 1) {
    return (
      <button type="button" className="leg-add use-flight" onClick={() => onUse(flights[0])}>
        <Icon name="plane" size={15} /> Use my flight {flightRoute(flights[0].journey)}
      </button>
    )
  }
  return (
    <span className="use-flight-wrap">
      <button type="button" className="leg-add use-flight" onClick={() => setChoosing(!choosing)} aria-expanded={choosing}>
        <Icon name="plane" size={15} /> Use my flight…
      </button>
      {choosing && (
        <ul className="use-flight-menu">
          {flights.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                className="link"
                onClick={() => {
                  setChoosing(false)
                  onUse(f)
                }}
              >
                <Icon name="plane" size={14} /> {[journeyCarriers(f.journey).join(' + '), flightRoute(f.journey), f.journey.date && formatDay(f.journey.date)].filter(Boolean).join(' · ')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}

/** " · 1 h 7 min · ¥1,080" after the title. */
function LegTotals({ segments }: { segments: Segment[] }) {
  const minutes = segments.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0)
  const fares = totalFares(segments)
  // A ride without a known price: "fare unknown" (or "+ fare unknown" after the known ones), never read as free.
  const unknown = segments.some(fareUnknown)
  const money = [fares.length > 0 && fares.map(formatMoney).join(' + '), unknown && (fares.length > 0 ? '+ fare unknown' : 'fare unknown')]
    .filter(Boolean)
    .join(' ')
  const parts = [minutes > 0 && formatDuration(minutes), money].filter(Boolean)
  return parts.length > 0 ? <span className="leg-totals"> · {parts.join(' · ')}</span> : null
}

/** "🚶4′ › Yotsubashi › 🚶6′ › JR Kyoto › …": walks as a small walker, rides as short colored badges. */
function LegChain({ segments }: { segments: Segment[] }) {
  return (
    <span className="leg-chain">
      {segments.map((s, i) => (
        <Fragment key={s.id}>
          {i > 0 && <span className="leg-chain-sep">›</span>}
          {s.mode === 'walk' ? (
            <span className="leg-chain-walk">
              <Icon name="walk" size={14} />
              {s.durationMinutes != null && `${s.durationMinutes}′`}
            </span>
          ) : (
            <span className="leg-chain-ride" style={{ background: segmentColor(s), color: textOn(segmentColor(s)) }}>
              <Icon name={MODE_ICON[s.mode]} size={13} />
              {shortLineName(s.lineName) || MODE_LABEL[s.mode]}
            </span>
          )}
        </Fragment>
      ))}
    </span>
  )
}

/** "Yotsubashi Line" → "Yotsubashi", "JR Kyoto Line" → "JR Kyoto" (keeps the chain on one line). */
function shortLineName(name: string | undefined): string | undefined {
  return name?.replace(/\s+(Main\s+)?Line$/i, '')
}

/** `first`: the new step goes before the others (the way to the airport). */
type Editing = { kind: 'new'; first?: boolean } | { kind: 'edit'; id: string } | null

/** When the suggested route should leave or arrive. */
interface Timing {
  kind: 'depart' | 'arrive'
  time: string
}

/**
 * Be at the next place at its planned time; else leave the previous one after
 * its visit; else 09:00. Base stops have no time: leaving the hotel at 05:30
 * comes from arriving at the first place at 07:00. Where the time comes from
 * isn't shown (User: it's obvious).
 */
function defaultTiming(from: Place, to: Place): Timing {
  if (to.plannedTime) return { kind: 'arrive', time: to.plannedTime }
  if (from.plannedTime) {
    return { kind: 'depart', time: formatMinutes(toMinutes(from.plannedTime) + visitMinutes(from)) }
  }
  return { kind: 'depart', time: '09:00' }
}

function LegEditor({
  tripId,
  leg,
  from,
  to,
  date,
  currency,
  currencies,
  countries = [],
  hasGoogleKey,
  onDraw,
  onAddBaseStop,
  flights = [],
  allFlights = [],
}: Omit<Props, 'open' | 'onToggle'>) {
  const [busy, setBusy] = useState<'transit' | 'walk' | 'car' | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Editing>(null)
  const [timing, setTiming] = useState(() => defaultTiming(from, to))
  /** Edit buttons under each step are shown only in this mode (reading stays clean). */
  const [editMode, setEditMode] = useState(false)
  const segments = leg?.segments ?? []

  // Names saved before the dictionary/rules improved get translated when the leg is opened.
  const legId = leg?.id
  useEffect(() => {
    if (leg) void retranslateLeg(leg)
    // Once per opened leg: retranslating changes the leg itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legId])

  const save = (next: Segment[]) => saveLeg(tripId, from.id, to.id, { segments: next })

  // Flight steps follow their booking/option (times or number typed after "Use my flight").
  useEffect(() => {
    const refreshed = leg && refreshFlightSteps(leg.segments, allFlights)
    if (refreshed) void save(refreshed)
    // Once per opened leg, like the retranslation above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legId])

  // A flight first, leaving from an airport away from the start: the way to the airport is still missing.
  const first = segments[0]
  const needsWayToAirport = first?.mode === 'flight' && !!first.fromCoord && distanceKm(from, first.fromCoord) > 2
  const newStepForm = (atStart: boolean) => (
    <SegmentForm
      currency={currency}
      currencies={currencies}
      defaults={
        atStart
          ? { fromName: from.name, toName: first?.fromName }
          : { fromName: segments.at(-1)?.toName ?? from.name, toName: segments.length === 0 ? undefined : to.name }
      }
      onSave={(segment) => {
        void save(atStart ? [segment, ...segments] : [...segments, segment])
        setEditing(null)
      }}
      onSaveAndDraw={
        hasGoogleKey
          ? async (segment) => {
              const next = atStart ? [segment, ...segments] : [...segments, segment]
              await save(next)
              setEditing(null)
              startDrawing(next, atStart ? 0 : next.length - 1)
            }
          : undefined
      }
      onCancel={() => setEditing(null)}
    />
  )

  // Japan: NAVITIME (Google has no transit there). Elsewhere: Google (User's decision, 2026-10-28).
  const transitBy = inJapan(from) ? 'navitime' : 'google'
  const transitName = transitBy === 'navitime' ? 'NAVITIME' : 'Google'

  async function suggestTransit() {
    setBusy('transit')
    setError('')
    try {
      const askDate = suggestionDate(date)
      // "Leave at 09:00" is 09:00 where the place is.
      const at = new Date(`${askDate}T${timing.time}:00${utcOffsetAt(from, askDate, countries)}`)
      const request = { origin: from, destination: to, departureTime: at, arrivalTime: timing.kind === 'arrive' ? at : undefined }
      const result =
        transitBy === 'navitime'
          ? await translateRouteResult(await navitimeProvider.computeTransit(request))
          : await googleProvider.computeTransit({ ...request, region: countries[0]?.toLowerCase() })
      if (result.options.length === 0) throw new RouteProviderError('no-route', `${transitName} found no route.`)
      await saveLeg(tripId, from.id, to.id, {
        segments: toSegments(result.options[0].segments, from, to),
        source: transitBy,
        fetchedAt: result.fetchedAt,
        alternatives: result.options,
        alternativesDate: askDate,
      })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function suggestStreet(mode: 'walk' | 'car') {
    setBusy(mode)
    setError('')
    try {
      const segment = await (mode === 'walk' ? computeWalkingRoute : computeDrivingRoute)(from, to)
      await saveLeg(tripId, from.id, to.id, {
        segments: toSegments([segment], from, to),
        source: 'google',
        fetchedAt: new Date().toISOString(),
      })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  /**
   * Draw starting where the previous segment ends (or at the place) and ending
   * where the next one begins, when it's drawn. The last segment doesn't have
   * to reach the destination (a walk to a bus stop): "End at …" is a button.
   */
  function startDrawing(list: Segment[], index: number) {
    const segment = list[index]
    const previous = list[index - 1]
    const next = list[index + 1]
    const previousEnd = previous?.path.at(-1)
    const origin = previous
      ? previousEnd && { ...previousEnd, label: 'Start where the previous step ends' }
      : { lat: from.lat, lng: from.lng, label: `Start at ${from.name}` }
    // A previous step that ends at the destination was drawn when the end was
    // forced there: starting from it would start at the destination.
    const endsAtDestination = !!previousEnd && distanceKm(previousEnd, to) < 0.03
    onDraw({
      fromPlaceId: from.id,
      toPlaceId: to.id,
      segmentId: segment.id,
      mode: segment.mode,
      color: segment.color,
      start: origin && !endsAtDestination ? { lat: origin.lat, lng: origin.lng } : undefined,
      origin,
      end: next?.path[0],
      destination: next ? undefined : { lat: to.lat, lng: to.lng, name: to.name },
      taps: [],
    })
  }

  function move(index: number, delta: -1 | 1) {
    const next = [...segments]
    ;[next[index], next[index + delta]] = [next[index + delta], next[index]]
    void save(next)
  }

  return (
    <div className="leg-editor">
      {onAddBaseStop && (
        <div className="row wrap base-add-here">
          <button type="button" className="link small" onClick={onAddBaseStop} title="Go back to the hotel between these two places">
            <Icon name="plus" size={14} /> <Icon name="home" size={15} /> Back to base here
          </button>
        </div>
      )}

      <div className="row wrap leg-timing">
        <select
          className="compact small"
          value={timing.kind}
          aria-label="Suggested transit time"
          onChange={(e) => setTiming({ ...timing, kind: e.target.value as Timing['kind'] })}
        >
          <option value="arrive">Arrive by</option>
          <option value="depart">Leave at</option>
        </select>
        <input
          type="time"
          className="compact small"
          value={timing.time}
          aria-label={timing.kind === 'arrive' ? 'Arrive by' : 'Leave at'}
          onChange={(e) => e.target.value && setTiming({ ...timing, time: e.target.value })}
        />
      </div>
      <div className="row wrap leg-suggest">
        {/* Says what the buttons do; on phones it takes the line above them. Car / public transport / walking
            (User, 2026-10-28); in Japan the transit one says it's NAVITIME. */}
        <span className="leg-suggest-label small muted">Get a suggested route:</span>
        {hasGoogleKey && (
          <button type="button" onClick={() => suggestStreet('car')} disabled={busy != null}>
            {busy === 'car' ? (
              'Asking Google…'
            ) : (
              <>
                <Icon name="car" size={16} /> Car
              </>
            )}
          </button>
        )}
        <button type="button" onClick={suggestTransit} disabled={busy != null}>
          {busy === 'transit' ? (
            `Asking ${transitName}…`
          ) : (
            <>
              <Icon name="bus" size={16} /> {transitBy === 'navitime' ? 'Route by NAVITIME' : 'Public transport'}
            </>
          )}
        </button>
        {hasGoogleKey && (
          <button type="button" onClick={() => suggestStreet('walk')} disabled={busy != null}>
            {busy === 'walk' ? (
              'Asking Google…'
            ) : (
              <>
                <Icon name="walk" size={16} /> Walking
              </>
            )}
          </button>
        )}
        <InfoTip label="About suggestions">
          {transitBy === 'navitime'
            ? 'Public transport in Japan comes from NAVITIME: 1 of its 500 free requests per month. Car and walking: 1 Google request each.'
            : 'Each suggestion is 1 Google request (Google has no public transport routes in Japan; NAVITIME does them there).'}
          {segments.length > 0 && ' A suggestion replaces the current steps.'}
        </InfoTip>
        <UseFlight flights={flights} onUse={(f) => save([...segments, ...flightSegments(f)])} />
      </div>
      {error && <p className="error">{error}</p>}

      {leg?.alternatives && leg.alternatives.length > 1 && (
        <Alternatives leg={leg} options={leg.alternatives} from={from} to={to} date={date} />
      )}

      {segments.length > 0 && (
        <RouteTimeline
          segments={segments}
          start={{ name: from.name, icon: endIcon(from) }}
          end={{ name: to.name, icon: endIcon(to) }}
          beforeFirst={
            needsWayToAirport ? (
              editing?.kind === 'new' && editing.first ? (
                newStepForm(true)
              ) : (
                <button type="button" className="leg-add" onClick={() => setEditing({ kind: 'new', first: true })} disabled={editing != null}>
                  <Icon name="plus" size={15} /> Add the way to {first?.fromName}
                </button>
              )
            ) : undefined
          }
          stepForm={(i) =>
            editing?.kind === 'edit' && editing.id === segments[i].id ? (
              <SegmentForm
                segment={segments[i]}
                currency={currency}
                currencies={currencies}
                onSave={(updated) => {
                  void save(segments.map((s) => (s.id === updated.id ? updated : s)))
                  setEditing(null)
                }}
                onSaveAndDraw={
                  hasGoogleKey
                    ? async (updated) => {
                        const next = segments.map((s) => (s.id === updated.id ? updated : s))
                        await save(next)
                        setEditing(null)
                        startDrawing(next, i)
                      }
                    : undefined
                }
                onCancel={() => setEditing(null)}
              />
            ) : null
          }
          // Reading: a quiet pencil and ✕ on each step; "Edit route" adds drawing and moving.
          stepActions={
            editMode
              ? undefined
              : (i) => (
                  <>
                    <button type="button" className="step-action" title="Edit this step" aria-label="Edit this step" onClick={() => setEditing({ kind: 'edit', id: segments[i].id })}>
                      <Icon name="edit" size={14} />
                    </button>
                    <button
                      type="button"
                      className="step-action"
                      title="Remove this step"
                      aria-label="Remove this step"
                      onClick={() => save(segments.filter((s) => s.id !== segments[i].id))}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </>
                )
          }
          stepTools={
            editMode
              ? (i) => (
                  <div className="step-tools">
                    <button type="button" className="step-tool" title="Edit" aria-label="Edit" onClick={() => setEditing({ kind: 'edit', id: segments[i].id })}>
                      <Icon name="edit" size={15} />
                    </button>
                    {hasGoogleKey && (
                      <button
                        type="button"
                        className="step-tool"
                        title={segments[i].path.length > 1 ? 'Redraw on map' : 'Draw on map'}
                        aria-label={segments[i].path.length > 1 ? 'Redraw on map' : 'Draw on map'}
                        onClick={() => startDrawing(segments, i)}
                      >
                        <Icon name="drawMap" size={15} />
                      </button>
                    )}
                    <button type="button" className="step-tool" title="Move up" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                      <Icon name="up" size={15} />
                    </button>
                    <button
                      type="button"
                      className="step-tool"
                      title="Move down"
                      aria-label="Move down"
                      disabled={i === segments.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <Icon name="down" size={15} />
                    </button>
                    <button
                      type="button"
                      className="step-tool remove"
                      title="Remove"
                      aria-label="Remove"
                      onClick={() => save(segments.filter((s) => s.id !== segments[i].id))}
                    >
                      <Icon name="close" size={15} />
                    </button>
                  </div>
                )
              : undefined
          }
        />
      )}

      {editing?.kind === 'new' && !editing.first && newStepForm(false)}

      {/* PC: one line. Phone: "Open in Google Maps … Edit route" above "Add step · Clear route". */}
      <div className="leg-footer">
        <a href={directionsUrl(from, to, segments)} target="_blank" rel="noreferrer" className="leg-footer-maps">
          <Icon name="external" size={14} /> Open in Google Maps
        </a>
        <span className="leg-footer-break" aria-hidden="true" />
        <button type="button" className="link leg-footer-add" onClick={() => setEditing({ kind: 'new' })} disabled={editing != null}>
          <Icon name="plus" size={14} /> Add step
        </button>
        {leg && (
          <button type="button" className="link leg-footer-clear" onClick={() => deleteLeg(leg.id)}>
            <Icon name="close" size={14} /> Clear route
          </button>
        )}
        {segments.length > 0 && (
          <button type="button" className="link leg-edit-toggle" onClick={() => setEditMode(!editMode)} aria-pressed={editMode}>
            {editMode ? (
              <>
                <Icon name="check" size={14} /> Done
              </>
            ) : (
              <>
                <Icon name="edit" size={14} /> Edit route
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

function Alternatives({ leg, options, from, to, date }: { leg: Leg; options: RouteOption[]; from: Place; to: Place; date: string }) {
  return (
    <details className="alternatives">
      <summary>
        Other suggestions ({options.length})
        {leg.alternativesDate && leg.alternativesDate !== date && (
          <span className="muted small"> · times for {formatDay(leg.alternativesDate)}</span>
        )}
      </summary>
      <ul>
        {options.map((option, i) => (
          <li key={i}>
            <span>
              {option.segments.map((s, k) => (
                <Icon key={k} name={MODE_ICON[s.mode]} size={15} />
              ))}{' '}
              {option.departureTime && option.arrivalTime && `· ${formatTime(option.departureTime)}–${formatTime(option.arrivalTime)} `}·{' '}
              {formatDuration(option.durationMinutes)}
              {option.fare && ` · ${formatMoney(option.fare)}`} · {option.transfers ?? 0} transfer(s)
            </span>
            <button type="button" className="link" onClick={() => chooseAlternative(leg, option, from, to)}>
              Use
            </button>
          </li>
        ))}
      </ul>
    </details>
  )
}

/** House for a base stop (the hotel), pin for a place. */
function endIcon(stop: Place): IconName {
  return 'baseStop' in stop && stop.baseStop ? 'home' : 'pin'
}

/** Sum of the segment fares, one value per currency. */
function totalFares(segments: Segment[]): Money[] {
  const totals: Record<string, number> = {}
  for (const fare of segments.map((s) => s.fare)) {
    if (fare) totals[fare.currency] = (totals[fare.currency] ?? 0) + fare.amount
  }
  return Object.entries(totals).map(([currency, amount]) => ({ amount, currency }))
}

function errorMessage(error: unknown): string {
  if (error instanceof RouteProviderError) {
    if (error.kind === 'not-configured') return `${error.message}`
    if (error.kind === 'quota') return 'Monthly request limit reached. You can still add segments manually.'
    return `${error.kind}: ${error.message}`
  }
  return error instanceof Error ? error.message : String(error)
}
