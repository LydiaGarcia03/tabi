import { Fragment, type ReactNode } from 'react'
import { addDays, formatDay } from '../dates'
import type { Journey, JourneyLeg } from '../db/model'
import {
  formatDuration,
  journeyCarriers,
  journeyConnections,
  LONG_LAYOVER_MINUTES,
  TIGHT_CONNECTION_MINUTES,
  mergeLeg,
  totalMinutes,
  type Connection,
} from '../planning/journeys'

/** True when a leg has times, numbers or aircraft (shown only in the detailed editor). */
export function legsHaveDetails(journey: Journey): boolean {
  return (journey.legs ?? []).some((l) => l.departTime || l.arriveTime || l.minutes != null || l.number || l.aircraft)
}

/**
 * The fields opened by "+ Extra info", set apart on a tinted box with a title
 * so it's clear what was opened. Bookings (always open) show them plainly.
 */
export function ExtraInfo({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return <>{children}</>
  return (
    <div className="journey-extra">
      <span className="journey-extra-title">Extra info</span>
      {children}
    </div>
  )
}

/**
 * Editor for a journey with connections. Without `detailed`, only the
 * airlines and the connection cities (a rough sketch, to compare baggage
 * rules); `detailed` adds times, flight numbers and aircraft, and the layovers
 * (in an "Extra info" box when `boxed`).
 */
export function JourneyLegsEditor({
  journey,
  onChange,
  detailed,
  toggles,
  boxed = false,
}: {
  journey: Journey
  onChange: (journey: Journey) => void
  detailed: boolean
  /** "− Connections / ± Extra info", shown with the route. */
  toggles: ReactNode
  boxed?: boolean
}) {
  const legs = journey.legs ?? []
  const isFlight = journey.mode === 'flight'
  const noun = isFlight ? 'Flight' : 'Leg'
  const connections = journeyConnections(journey)
  const total = totalMinutes(journey)
  const carriers = journeyCarriers(journey)

  const setLeg = (i: number, changes: Partial<JourneyLeg>) =>
    onChange({ ...journey, legs: legs.map((leg, j) => (j === i ? { ...leg, ...changes } : leg)) })
  /** A connection city is both where one leg lands and where the next leaves: keep them in step. */
  const setPlace = (i: number, end: 'from' | 'to', value: string) => {
    const j = end === 'to' ? i + 1 : i - 1
    const other = end === 'to' ? 'from' : 'to'
    const old = legs[i][end]
    onChange({
      ...journey,
      legs: legs.map((leg, k) => {
        if (k === i) return { ...leg, [end]: value }
        if (k === j && (!leg[other] || leg[other] === old)) return { ...leg, [other]: value }
        return leg
      }),
    })
  }
  const removeLeg = (i: number) => {
    const rest = legs.filter((_, j) => j !== i)
    onChange(rest.length === 1 ? mergeLeg(journey, rest[0]) : { ...journey, legs: rest })
  }
  const addLeg = () => {
    const last = legs[legs.length - 1]
    // The new leg leaves from where the last one arrived; the old destination moves to the new leg.
    onChange({
      ...journey,
      legs: [...legs.slice(0, -1), { ...last, to: '' }, { from: '', to: last.to, carrier: last.carrier, departDay: last.arriveDay }],
    })
  }

  const mainAirline = carriers.length > 1 && (
    <label>
      Main airline (its checked baggage usually applies on one ticket)
      <select
        value={journey.carrier && carriers.includes(journey.carrier) ? journey.carrier : ''}
        onChange={(e) => onChange({ ...journey, carrier: e.target.value || undefined })}
      >
        <option value="">Best guess{detailed ? ' (the one you fly longest)' : ''}</option>
        {carriers.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
    </label>
  )

  if (!detailed) {
    return (
      <div className="journey-legs">
        <ol className="journey-route">
          <li>
            <input
              value={legs[0]?.from ?? ''}
              onChange={(e) => setLeg(0, { from: e.target.value })}
              placeholder={isFlight ? 'From: Navegantes (NVT)' : 'From'}
              aria-label="From"
            />
          </li>
          {legs.map((leg, i) => (
            <li key={i} className="journey-route-leg">
              <span aria-hidden="true">{isFlight ? '✈️' : '➜'}</span>
              <input
                value={leg.carrier ?? ''}
                list={isFlight ? 'airline-names' : undefined}
                onChange={(e) => setLeg(i, { carrier: e.target.value })}
                placeholder={isFlight ? 'Airline' : 'Operator'}
                aria-label={`${noun} ${i + 1} ${isFlight ? 'airline' : 'operator'}`}
              />
              <span aria-hidden="true">→</span>
              <input
                value={leg.to}
                onChange={(e) => setPlace(i, 'to', e.target.value)}
                placeholder={i < legs.length - 1 ? 'Connection (optional)' : isFlight ? 'To: Osaka (KIX)' : 'To'}
                aria-label={i < legs.length - 1 ? `Connection ${i + 1}` : 'To'}
              />
              <button type="button" className="icon-button" onClick={() => removeLeg(i)} aria-label={`Remove ${noun.toLowerCase()} ${i + 1}`}>
                ✕
              </button>
            </li>
          ))}
        </ol>
        <button type="button" onClick={addLeg}>
          + Add a {noun.toLowerCase()}
        </button>
        {toggles}
        {mainAirline}
      </div>
    )
  }

  return (
    <div className="journey-legs">
      {toggles}
      <ol className="journey-leg-list">
        {legs.map((leg, i) => (
          <li key={i}>
            {i > 0 && <ConnectionInfo connection={connections[i - 1]} />}
            <fieldset className="journey-leg">
              <legend>
                {noun} {i + 1}
              </legend>
              <div className="field-row">
                <label>
                  From
                  <input value={leg.from} onChange={(e) => setPlace(i, 'from', e.target.value)} placeholder={isFlight ? 'São Paulo (GRU)' : 'Shin-Osaka'} />
                </label>
                <label>
                  To
                  <input value={leg.to} onChange={(e) => setPlace(i, 'to', e.target.value)} placeholder={isFlight ? 'Doha (DOH)' : 'Tokyo'} />
                </label>
              </div>
              <label>
                {isFlight ? 'Airline' : 'Operator'}
                <input value={leg.carrier ?? ''} list={isFlight ? 'airline-names' : undefined} onChange={(e) => setLeg(i, { carrier: e.target.value })} />
              </label>
              <ExtraInfo show={boxed}>
                <div className="field-row time-fields">
                  <TimeAndDay
                    label="Departs"
                    date={journey.date}
                    time={leg.departTime}
                    day={leg.departDay}
                    onChange={(departTime, departDay) => setLeg(i, { departTime, departDay })}
                  />
                  <TimeAndDay
                    label="Arrives"
                    date={journey.date}
                    time={leg.arriveTime}
                    day={leg.arriveDay}
                    onChange={(arriveTime, arriveDay) => setLeg(i, { arriveTime, arriveDay })}
                  />
                  <DurationInput label={isFlight ? 'Flight time' : 'Travel time'} minutes={leg.minutes} onChange={(minutes) => setLeg(i, { minutes })} />
                </div>
                <div className="field-row">
                  <label>
                    {isFlight ? 'Flight number' : 'Number'}
                    <input value={leg.number ?? ''} onChange={(e) => setLeg(i, { number: e.target.value })} placeholder={isFlight ? 'QR 774' : ''} />
                  </label>
                  {isFlight && (
                    <label>
                      Aircraft
                      <input value={leg.aircraft ?? ''} onChange={(e) => setLeg(i, { aircraft: e.target.value })} placeholder="Airbus A350" />
                    </label>
                  )}
                </div>
              </ExtraInfo>
              <button type="button" className="link danger-outline" onClick={() => removeLeg(i)}>
                Remove {noun.toLowerCase()} {i + 1}
              </button>
            </fieldset>
          </li>
        ))}
      </ol>
      <button type="button" onClick={addLeg}>
        + Add a {noun.toLowerCase()}
      </button>

      <p className="small journey-total">
        <strong>{legs.length - 1 === 1 ? '1 connection' : `${legs.length - 1} connections`}</strong>
        {total != null
          ? ` · total ${formatDuration(total)} door to door (flights + layovers)`
          : ' · fill in every time and flight time to get the total'}
      </p>

      {mainAirline}
    </div>
  )
}

/**
 * Each flight and layover, like Google Flights shows them, folded under a
 * one-line summary ("2 connections · 18 h layovers ⚠️").
 */
export function JourneyItinerary({ journey, timesOnly = false }: { journey: Journey; timesOnly?: boolean }) {
  const legs = journey.legs ?? []
  if (legs.length < 2) return null
  // A rough sketch (airlines only): one line, "NVT ✈ Gol → GRU ✈ Qatar Airways → DOH…".
  if (!legs.some((l) => l.departTime || l.arriveTime || l.minutes != null)) {
    // Where the route is already shown (RouteChain), only the timed details are added.
    if (timesOnly) return null
    return (
      <span className="small journey-chain">
        {legs[0].from}
        {legs.map((l, i) => ` ✈ ${l.carrier ?? '?'} → ${l.to || (i < legs.length - 1 ? '…' : '?')}`).join('')}
      </span>
    )
  }
  const connections = journeyConnections(journey)
  const layover = connections.every((c) => c.minutes != null && c.minutes >= 0)
    ? connections.reduce((sum, c) => sum + c.minutes!, 0)
    : undefined
  const warn = connections.some(
    (c) => c.changesAirport || (c.minutes != null && (c.minutes < TIGHT_CONNECTION_MINUTES || c.minutes >= LONG_LAYOVER_MINUTES)),
  )
  const day = (d?: number) => (d ? <sup>+{d}</sup> : null)
  return (
    <details className="journey-itinerary">
      <summary className="small">
        {connections.length === 1 ? '1 connection' : `${connections.length} connections`}
        {layover != null && ` · ${formatDuration(layover)} of layovers`}
        {warn && ' ⚠️'}
      </summary>
      <ol>
        {legs.map((leg, i) => (
          <li key={i}>
            {i > 0 && <ConnectionInfo connection={connections[i - 1]} />}
            <div className="journey-itinerary-leg small">
              <span>
                <strong>
                  {leg.departTime ?? '?'}
                  {day(leg.departDay)}
                </strong>{' '}
                {leg.from} →{' '}
                <strong>
                  {leg.arriveTime ?? '?'}
                  {day(leg.arriveDay)}
                </strong>{' '}
                {leg.to}
              </span>
              <span className="muted">
                {[leg.carrier, leg.number, leg.aircraft, leg.minutes != null && formatDuration(leg.minutes)].filter(Boolean).join(' · ')}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </details>
  )
}

/** "NVT" from "Navegantes (NVT)"; otherwise the name as typed. */
const shortPlace = (name: string) => /\(([A-Z0-9]{3,4})\)/.exec(name)?.[1] ?? name.trim()

/** The route as a chain, each carrier between the places it flies: NVT Gol → GRU Qatar → DOH Qatar → KIX. */
export function RouteChain({ journey }: { journey: Journey }) {
  const legs = journey.legs?.length ? journey.legs : [{ from: journey.from, to: journey.to, carrier: journey.carrier }]
  return (
    <span className="route-chain">
      <b>{shortPlace(legs[0].from) || '?'}</b>
      {legs.map((leg, i) => (
        <Fragment key={i}>
          {' '}
          <span className="route-chain-step">
            {leg.carrier && <span className="muted">{leg.carrier}</span>}
            <span aria-hidden="true">→</span>
            <b>{shortPlace(leg.to) || '?'}</b>
          </span>
        </Fragment>
      ))}
    </span>
  )
}

/**
 * Short facts about a journey as chips: date, stops, connections to watch
 * (long, tight, change of airport) and class.
 */
export function journeyChips(journey: Journey): { text: string; warn?: boolean }[] {
  const legs = journey.legs ?? []
  const stops = legs.length - 1
  const city = (name: string) => name.replace(/\s*\(.*?\)\s*/g, '').trim() || name
  const chips: { text: string; warn?: boolean }[] = []
  if (journey.date) chips.push({ text: formatDay(journey.date) + (journey.time ? ` ${journey.time}` : '') })
  if (stops > 0) chips.push({ text: stops === 1 ? '1 stop' : `${stops} stops` })
  else if (journey.stops) chips.push({ text: journey.stops })
  for (const c of journeyConnections(journey)) {
    if (c.changesAirport) chips.push({ text: `⚠ change of airport in ${city(c.at)}`, warn: true })
    else if (c.minutes != null && c.minutes >= LONG_LAYOVER_MINUTES) chips.push({ text: `⚠ ${formatDuration(c.minutes)} in ${city(c.at)}`, warn: true })
    else if (c.minutes != null && c.minutes >= 0 && c.minutes < TIGHT_CONNECTION_MINUTES) chips.push({ text: `⚠ tight in ${city(c.at)}`, warn: true })
  }
  if (journey.cabin) chips.push({ text: journey.cabin })
  return chips
}

/** The time on the ground between two legs, with what to watch out for. */
export function ConnectionInfo({ connection }: { connection: Connection }) {
  const { minutes, at, changesAirport } = connection
  const warnings = [
    changesAirport && 'Change of airport: you must cross the city between them, with your bags',
    minutes != null && minutes < 0 && 'The next flight leaves before this one lands: check the times and days',
    minutes != null && minutes >= 0 && minutes < TIGHT_CONNECTION_MINUTES && 'Tight connection',
    minutes != null && minutes >= LONG_LAYOVER_MINUTES && 'Long layover',
  ].filter((w): w is string => !!w)
  return (
    <div className={`journey-connection${warnings.length ? ' warn' : ''}`}>
      <span>
        ⏱ {minutes != null && minutes >= 0 ? `${formatDuration(minutes)} layover` : 'Layover'}
        {at && ` in ${at}`}
      </span>
      {warnings.map((w) => (
        <span key={w} className="warning small">
          ⚠️ {w}
        </span>
      ))}
    </div>
  )
}

function TimeAndDay({
  label,
  date,
  time,
  day,
  onChange,
}: {
  label: string
  date?: string
  time?: string
  day?: number
  onChange: (time: string | undefined, day: number | undefined) => void
}) {
  return (
    <label>
      {label}
      <span className="row time-and-day">
        <input type="time" value={time ?? ''} onChange={(e) => onChange(e.target.value || undefined, day)} />
        <select value={day ?? 0} onChange={(e) => onChange(time, Number(e.target.value) || undefined)} aria-label={`${label} day`}>
          {[0, 1, 2].map((d) => (
            <option key={d} value={d}>
              {d === 0 ? 'same day' : `+${d}`}
              {date ? ` (${formatDay(addDays(date, d))})` : ''}
            </option>
          ))}
        </select>
      </span>
    </label>
  )
}

function DurationInput({ label, minutes, onChange }: { label: string; minutes?: number; onChange: (minutes: number | undefined) => void }) {
  const h = minutes == null ? '' : String(Math.floor(minutes / 60))
  const m = minutes == null ? '' : String(minutes % 60)
  const update = (hours: string, mins: string) =>
    onChange(hours === '' && mins === '' ? undefined : (Number(hours) || 0) * 60 + (Number(mins) || 0))
  return (
    <label>
      {label}
      <span className="row time-and-day">
        <input type="number" min="0" inputMode="numeric" value={h} onChange={(e) => update(e.target.value, m)} aria-label={`${label} hours`} placeholder="h" />
        <input type="number" min="0" max="59" inputMode="numeric" value={m} onChange={(e) => update(h, e.target.value)} aria-label={`${label} minutes`} placeholder="min" />
      </span>
    </label>
  )
}
