import { Fragment, type CSSProperties, type ReactNode } from 'react'
import { MODE_ICON, MODE_LABEL, formatDistance, formatDuration, formatMoney, formatTime, segmentColor, stopsMade } from '../format'
import { lineSignName, signName, translateExit } from '../i18n/japaneseNames'
import type { IconName } from '../iconPaths'
import type { RouteSegment } from '../routing/types'
import { Icon } from './Icon'

interface End {
  name: string
  icon: IconName
}

/**
 * A leg as a timeline, like Google Maps: a row per station (time, English
 * name, station number, the Japanese name under it as on the signs, exit)
 * and between them each ride (line badge, train type, where it's bound for,
 * stops) or walk.
 */
export function RouteTimeline<T extends RouteSegment & { id: string; notes?: string }>({
  segments,
  start,
  end,
  stepTools,
  stepActions,
  stepForm,
  beforeFirst,
}: {
  segments: T[]
  start: End
  end: End
  /**
   * The way still missing between the start and the first step (a flight
   * leaving from an airport far away): shown before the first step's station.
   */
  beforeFirst?: ReactNode
  /** Shown under each step (edit buttons). */
  stepTools?: (index: number) => ReactNode
  /** Small buttons at the top right of each step (edit, remove). */
  stepActions?: (index: number) => ReactNode
  /** Replaces a step while it's being edited. */
  stepForm?: (index: number) => ReactNode | null
}) {
  return (
    <ol className="route-timeline">
      <StationRow time={beforeFirst ? undefined : segments[0]?.departureTime} name={start.name} icon={start.icon} terminal />
      {beforeFirst && (
        <>
          <li className="route-step walk">
            <span />
            <span className="route-bar" aria-hidden="true" />
            <div className="route-step-body">{beforeFirst}</div>
          </li>
          <StationRow time={segments[0].departureTime} name={segments[0].fromName ?? '?'} />
        </>
      )}
      {segments.map((segment, i) => {
        const next = segments[i + 1]
        const form = stepForm?.(i)
        return (
          <Fragment key={segment.id}>
            {form ? (
              <li className="route-step-form">{form}</li>
            ) : (
              <StepRow segment={segment} tools={stepTools?.(i)} actions={stepActions?.(i)} />
            )}
            {next ? (
              <Transfer prev={segment} next={next} />
            ) : (
              <StationRow time={segment.arrivalTime} name={end.name} icon={end.icon} terminal />
            )}
          </Fragment>
        )
      })}
    </ol>
  )
}

/** The station between two steps: where one ends and the next begins. */
function Transfer({ prev, next }: { prev: RouteSegment; next: RouteSegment }) {
  const rideNext = next.mode !== 'walk'
  const ridePrev = prev.mode !== 'walk'
  const name = next.fromName ?? prev.toName ?? '?'
  const japanese = next.fromName ? next.originalNames?.from : prev.originalNames?.to
  // The station number of the line you board, else of the one you got off.
  const coded = rideNext && next.fromCode ? next : ridePrev && prev.toCode ? prev : undefined
  const enter = rideNext ? (next.fromExit ?? (ridePrev ? undefined : prev.toExit)) : undefined
  const leave = ridePrev ? (prev.toExit ?? (rideNext ? undefined : next.fromExit)) : undefined
  return (
    <StationRow
      time={rideNext ? next.departureTime : (prev.arrivalTime ?? next.departureTime)}
      name={name}
      japanese={japanese}
      code={coded && { text: (coded === next ? next.fromCode : prev.toCode)!, color: segmentColor(coded) }}
      details={[
        // Train to train with no walk between: the row shows the departure, so say when you arrive.
        ridePrev &&
          rideNext &&
          prev.arrivalTime &&
          `Arrive ${formatTime(prev.arrivalTime)}${prev.toCode && prev.toCode !== next.fromCode ? ` (${prev.toCode})` : ''}, change trains`,
        leave && <ExitText key="leave" verb="Leave by" exit={leave} />,
        ridePrev && prev.toPlatform && `Arrives on platform ${prev.toPlatform}`,
        enter && <ExitText key="enter" verb="Enter by" exit={enter} />,
        rideNext && next.fromPlatform && `Platform ${next.fromPlatform}`,
      ]}
    />
  )
}

function StationRow({
  time,
  name,
  japanese,
  icon,
  code,
  details = [],
  terminal,
}: {
  time?: string
  name: string
  japanese?: string
  icon?: IconName
  code?: { text: string; color: string }
  details?: ReactNode[]
  terminal?: boolean
}) {
  const shown = details.filter(Boolean)
  return (
    <li className={`route-station${terminal ? ' terminal' : ''}`}>
      <span className="route-time">{time ? formatTime(time) : ''}</span>
      <span className="route-dot" aria-hidden="true" />
      <div className="route-station-text">
        {/* Phones: the time goes before the name, so every line starts where the rides do. */}
        {time && <span className="route-time-inline">{formatTime(time)}</span>}
        <span className="route-station-name">
          {icon && <Icon name={icon} size={16} />} {name}
        </span>
        {code && (
          <span className="station-code" style={{ color: code.color }}>
            {code.text}
          </span>
        )}
        {japanese && signName(japanese) !== name && (
          <div className="ja" lang="ja">
            {signName(japanese)}
          </div>
        )}
        {shown.map((detail, i) => (
          <div key={i} className="small muted">
            {detail}
          </div>
        ))}
      </div>
    </li>
  )
}

function StepRow({ segment, tools, actions }: { segment: RouteSegment & { notes?: string }; tools?: ReactNode; actions?: ReactNode }) {
  const color = segmentColor(segment)
  const walk = segment.mode === 'walk'
  return (
    <li className={`route-step${walk ? ' walk' : ''}`} style={{ '--line': color } as CSSProperties}>
      <span />
      <span className="route-bar" aria-hidden="true" />
      <div className={`route-step-body${actions ? ' with-actions' : ''}`}>
        {actions && <span className="route-step-actions">{actions}</span>}
        {walk ? <WalkText segment={segment} /> : <RideText segment={segment} color={color} />}
        {segment.notes?.trim() && <div className="small segment-notes">{segment.notes}</div>}
        {tools}
      </div>
    </li>
  )
}

function WalkText({ segment }: { segment: RouteSegment }) {
  const transfer = segment.fromName != null && segment.fromName === segment.toName
  return (
    <div className="route-walk small muted">
      <Icon name="walk" size={16} /> {transfer ? 'Change lines' : 'Walk'}
      {segment.durationMinutes != null && ` ${formatDuration(segment.durationMinutes)}`}
      {segment.distanceMeters ? ` · ${formatDistance(segment.distanceMeters)}` : ''}
    </div>
  )
}

function RideText({ segment, color }: { segment: RouteSegment; color: string }) {
  const original = segment.originalNames
  const stops = stopsMade(segment)
  const facts = [
    stops && `${stops.length + 1} stop${stops.length === 0 ? '' : 's'}`,
    segment.durationMinutes != null && formatDuration(segment.durationMinutes),
    segment.distanceMeters && !stops ? formatDistance(segment.distanceMeters) : undefined,
    segment.fare && formatMoney(segment.fare),
    segment.booking &&
      (segment.booking.kind === 'booking'
        ? `In the itinerary${segment.booking.price ? ` · ${formatMoney(segment.booking.price)} in the trip's transport` : ''}`
        : `From your options${segment.booking.price ? ` · ${formatMoney(segment.booking.price)}, not in the itinerary yet` : ' · not in the itinerary yet'}`),
    segment.carHint && `Best car: ${segment.carHint.replace(/^Cars? /, '').replace(/ of the train$/, '').toLowerCase()}`,
  ].filter(Boolean)
  return (
    <>
      <div>
        <span className="line-badge" style={{ background: color, color: textOn(color) }}>
          <Icon name={MODE_ICON[segment.mode]} size={15} /> {segment.lineName || MODE_LABEL[segment.mode]}
        </span>
        {original?.line && (
          <span className="ja" lang="ja">
            {' '}
            {lineSignName(original.line)}
          </span>
        )}
      </div>
      {(segment.service || segment.headsign) && (
        <div className="small">
          {segment.service && <strong>{segment.service}</strong>}
          {original?.service && (
            <span className="ja" lang="ja">
              {' '}
              {original.service}
            </span>
          )}
          {segment.service && segment.headsign && ' · '}
          {segment.headsign && (
            <>
              for <strong>{segment.headsign}</strong>
              {original?.headsign && (
                <span className="ja" lang="ja">
                  {' '}
                  {signName(original.headsign)}
                </span>
              )}
            </>
          )}
        </div>
      )}
      {facts.length > 0 && <div className="small muted">{facts.join(' · ')}</div>}
      {segment.intermediateStops && segment.intermediateStops.length > 0 && (
        <details className="route-stations small">
          <summary className="muted">
            Stations on the way
            {stops && stops.length < segment.intermediateStops.length
              ? ` (${stops.length} stop${stops.length === 1 ? '' : 's'}, passes ${segment.intermediateStops.length - stops.length})`
              : ` (${segment.intermediateStops.length})`}
          </summary>
          <ol>
            {segment.intermediateStops.map((stop, i) => {
              const passes = !stops?.includes(stop)
              return (
                <li key={i} className={passes ? 'muted' : undefined}>
                  {stop.time && <span className="muted">{formatTime(stop.time)} </span>}
                  {stop.name}
                  {stop.original && (
                    <span className="ja" lang="ja">
                      {' '}
                      {signName(stop.original)}
                    </span>
                  )}
                  {passes && ' (passes)'}
                </li>
              )
            })}
          </ol>
        </details>
      )}
    </>
  )
}

function ExitText({ verb, exit }: { verb: string; exit: string }) {
  const english = translateExit(exit)
  return (
    <>
      {verb} {english}
      {english !== exit && (
        <span className="ja" lang="ja">
          {' '}
          {exit}
        </span>
      )}
    </>
  )
}

/** Black or white text, whichever reads better on a line color. */
export function textOn(color: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1]
  if (!hex) return '#fff'
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return 0.299 * r + 0.587 * g + 0.114 * b > 165 ? '#111' : '#fff'
}
