import { useMemo, useState } from 'react'
import { AIRPORTS, airportLabel, airportsFor, BRAZIL_FEEDER_HUBS, FLIGHT_NETWORK_UPDATED, LONG_HAUL_ROUTES } from '../data/flightNetwork'
import { formatDate } from '../dates'
import type { Trip } from '../db/model'
import { addOption } from '../db/options'
import { formatHours } from '../planning/journeys'
import { googleFlightsUrl, planFlights, planJourney, type FlightPlan, type Priority } from '../planning/flightPlanner'
import { loadJson, saveJson } from '../settings'
import { BaggageBreakdown } from './AirlineGuide'
import { Icon } from './Icon'

interface Saved {
  from: string
  to: string
  date: string
  airlines: string[]
  connections: string[]
  checkedBags: number
  priority: Priority
}

const LONG_HAUL = Object.keys(LONG_HAUL_ROUTES)
const FEEDERS = Object.keys(BRAZIL_FEEDER_HUBS)
const HUBS = AIRPORTS.filter((a) => a.country === 'other')

const PRIORITIES: [Priority, string][] = [
  ['balanced', 'Best overall'],
  ['baggage', 'Alike baggage'],
  ['fastest', 'Fastest'],
  ['comfort', 'Comfort'],
]

const SHOWN = 8

/**
 * Builds and ranks flight itineraries from where you leave to where you go,
 * with the airlines and connections you accept. No prices or schedules (no
 * free flight API exists): each plan links to Google Flights to check them,
 * and can be saved as a transport option to compare with its price.
 */
export function FlightPlanner({ trip, onSaved }: { trip: Trip; onSaved: () => void }) {
  const storageKey = `tabi.flightPlanner.${trip.id}`
  const [state, setState] = useState<Saved>(
    () =>
      loadJson<Saved>(storageKey) ?? {
        from: 'Navegantes (NVT)',
        to: '',
        date: trip.startDate,
        airlines: [...LONG_HAUL, ...FEEDERS],
        connections: [],
        checkedBags: 1,
        priority: 'balanced',
      },
  )
  const [showAll, setShowAll] = useState(false)
  const [saved, setSaved] = useState<string[]>([])
  const update = (changes: Partial<Saved>) => {
    const next = { ...state, ...changes }
    setState(next)
    saveJson(storageKey, next)
  }
  const toggle = (list: string[], item: string) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item])

  const from = airportsFor(state.from)
  const to = airportsFor(state.to)
  const plans = useMemo(
    () =>
      from.length && to.length
        ? planFlights({ from, to, airlines: state.airlines, connections: state.connections, checkedBags: state.checkedBags }, state.priority)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [from.join(), to.join(), state.airlines, state.connections, state.checkedBags, state.priority],
  )

  async function save(plan: FlightPlan) {
    const journey = planJourney(plan, state.date || undefined)
    const airlines = [...new Set(plan.segments.map((s) => s.airline))]
    await addOption({
      tripId: trip.id,
      kind: 'transport',
      status: 'idea',
      name: `${airlines.join(' + ')} · ${journey.from} → ${journey.to}`,
      journey,
      notes: 'From the flight planner: check the price and times on Google Flights, then fill them in here.',
      link: googleFlightsUrl(plan, state.date || undefined),
    })
    setSaved([...saved, plan.key])
  }

  return (
    <div className="flight-planner">
      <p className="muted small">
        Tell where you leave from and where you go, the airlines and connections you accept. The planner builds the possible
        itineraries and ranks them by baggage, time, connections and comfort. Prices and schedules aren't available to the app:
        each plan opens the search on Google Flights.
      </p>

      <datalist id="planner-airports">
        {AIRPORTS.map((a) => (
          <option key={a.code} value={airportLabel(a.code)} />
        ))}
      </datalist>
      <div className="field-row">
        <label>
          From
          <input value={state.from} list="planner-airports" onChange={(e) => update({ from: e.target.value })} placeholder="Navegantes (NVT)" />
          {state.from && from.length === 0 && <span className="warning small">Airport not known: pick one from the list</span>}
        </label>
        <label>
          To
          <input value={state.to} list="planner-airports" onChange={(e) => update({ to: e.target.value })} placeholder="Osaka (KIX)" />
          {state.to && to.length === 0 && <span className="warning small">Airport not known: pick one from the list</span>}
        </label>
      </div>
      <label>
        Date (for the Google Flights search)
        <input type="date" value={state.date} onChange={(e) => update({ date: e.target.value })} />
      </label>

      <div className="field">
        <span className="field-label">Airlines you accept</span>
        <div className="chip-picker" role="group" aria-label="Airlines you accept">
          {[...LONG_HAUL, ...FEEDERS].map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={state.airlines.includes(name)}
              className={state.airlines.includes(name) ? 'active' : ''}
              onClick={() => update({ airlines: toggle(state.airlines, name) })}
            >
              {name}
            </button>
          ))}
        </div>
        <span className="muted small">LATAM, GOL and Azul are the flight inside Brazil to the airport where the long flight leaves.</span>
      </div>

      <div className="field">
        <span className="field-label">Connections abroad you accept (optional)</span>
        <div className="chip-picker" role="group" aria-label="Connections you accept">
          {HUBS.map((a) => (
            <button
              key={a.code}
              type="button"
              aria-pressed={state.connections.includes(a.code)}
              className={state.connections.includes(a.code) ? 'active' : ''}
              onClick={() => update({ connections: toggle(state.connections, a.code) })}
            >
              {a.city} ({a.code})
            </button>
          ))}
        </div>
        <span className="muted small">{state.connections.length === 0 ? 'None picked: any of them.' : 'Only these (connections in Brazil are always allowed).'}</span>
      </div>

      <div className="field-row">
        <div className="field">
          <span className="field-label">Checked bags you need</span>
          <div className="segmented" role="radiogroup" aria-label="Checked bags you need">
            {[0, 1, 2].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={state.checkedBags === n} className={state.checkedBags === n ? 'active' : ''} onClick={() => update({ checkedBags: n })}>
                {n === 0 ? 'None' : n}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">What matters most</span>
          <div className="segmented" role="radiogroup" aria-label="What matters most">
            {PRIORITIES.map(([value, label]) => (
              <button key={value} type="button" role="radio" aria-checked={state.priority === value} className={state.priority === value ? 'active' : ''} onClick={() => update({ priority: value })}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <h3 className="planner-results-title">
        {from.length && to.length ? `${plans.length} possible ${plans.length === 1 ? 'itinerary' : 'itineraries'}` : 'Itineraries'}
      </h3>
      {from.length > 0 && to.length > 0 && plans.length === 0 && (
        <p className="muted small">No itinerary with these airlines and connections. Accept more airlines or connections.</p>
      )}
      <ol className="plan-list">
        {plans.slice(0, showAll ? undefined : SHOWN).map((plan, i) => (
          <PlanCard
            key={plan.key}
            plan={plan}
            rank={i + 1}
            checkedBags={state.checkedBags}
            date={state.date}
            saved={saved.includes(plan.key)}
            onSave={() => void save(plan)}
          />
        ))}
      </ol>
      {plans.length > SHOWN && !showAll && (
        <button type="button" className="link" onClick={() => setShowAll(true)}>
          Show all {plans.length}
        </button>
      )}
      {saved.length > 0 && (
        <p className="small">
          {saved.length} saved to your transport options.{' '}
          <button type="button" className="link" onClick={onSaved}>
            See them
          </button>
        </p>
      )}
      <p className="muted small">
        Routes researched on {formatDate(FLIGHT_NETWORK_UPDATED)}; times are estimates (distance + connections). Always confirm on
        Google Flights.
      </p>
    </div>
  )
}

function PlanCard({
  plan,
  rank,
  checkedBags,
  date,
  saved,
  onSave,
}: {
  plan: FlightPlan
  rank: number
  checkedBags: number
  date: string
  saved: boolean
  onSave: () => void
}) {
  const via = plan.segments.slice(1).map((s) => airportLabel(s.from))
  const longHaul = plan.segments.find((s) => !BRAZIL_FEEDER_HUBS[s.airline])?.airline
  return (
    <li className="card plan-card">
      <div className="plan-top">
        <span className="plan-rank">#{rank}</span>
        <span className="score">
          <span className="score-bar">
            <span style={{ width: `${plan.score}%` }} />
          </span>
          <strong>{plan.score}</strong>
        </span>
      </div>

      <ol className="plan-route" aria-label="Flights">
        {plan.segments.map((s, i) => (
          <li key={i}>
            <span className="plan-airport">{s.from}</span>
            <span className="plan-flight">
              {s.airline}
              {s.alternatives?.length ? <span className="muted"> (or {s.alternatives.join(', ')})</span> : null}{' '}
              <span className="muted">~{formatHours(Math.round(s.hours * 4) / 4)}</span>
            </span>
            {i === plan.segments.length - 1 && <span className="plan-airport">{s.to}</span>}
          </li>
        ))}
      </ol>

      <p className="small plan-facts">
        <strong>~{formatHours(Math.round(plan.hours * 2) / 2)}</strong> total ·{' '}
        {plan.connections === 0 ? 'direct' : `${plan.connections} ${plan.connections === 1 ? 'connection' : 'connections'} (${via.join(', ')})`}
        {plan.separateTickets && (
          <span className="warning"> · long flights on different airline groups: maybe separate tickets (bags not checked through, missed-connection risk)</span>
        )}
        {plan.segments.some((s) => BRAZIL_FEEDER_HUBS[s.airline]) && (
          <span className="muted"> · check the flight inside Brazil is on the same ticket, so bags go straight to Japan</span>
        )}
      </p>

      <div className="plan-scores small">
        {(
          [
            ['baggage', 'Baggage'],
            ['time', 'Time'],
            ['connections', 'Connections'],
            ['comfort', 'Comfort'],
          ] as const
        ).map(([key, label]) => (
          <span key={key}>
            {label} <strong>{Math.round(plan.scores[key] * 100)}</strong>
          </span>
        ))}
      </div>

      <BaggageBreakdown carriers={plan.segments.map((s) => s.airline)} main={longHaul} checkedBags={checkedBags} />

      <div className="row wrap">
        <a className="button" href={googleFlightsUrl(plan, date || undefined)} target="_blank" rel="noreferrer">
          <Icon name="external" size={16} /> Check price on Google Flights
        </a>
        <button type="button" className={saved ? '' : 'primary'} disabled={saved} onClick={onSave}>
          {saved ? (
            <>
              <Icon name="check" size={16} /> Saved
            </>
          ) : (
            'Save as option'
          )}
        </button>
      </div>
    </li>
  )
}
