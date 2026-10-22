import { useState } from 'react'
import {
  AIRLINE_GUIDE_UPDATED,
  AIRLINES,
  describeBag,
  describeChecked,
  type AirlineInfo,
} from '../data/airlines'
import { formatDate } from '../dates'
import { tripBaggage } from '../planning/baggage'
import { Icon } from './Icon'

const PREMIUM_LABEL: Record<AirlineInfo['premiumEconomy'], string> = {
  yes: 'Yes',
  no: 'No',
  'some aircraft': 'Some aircraft',
}

const fareName = (fare: string) => fare.replace(/^Economy /, '')

/**
 * Baggage on a trip of one or more airlines, as three clear rows: what fits
 * every flight (personal item, carry-on) and the checked bags, with the
 * airline that sets each limit. `compact` (lists) leaves out each airline's
 * own rules; `checkedBags` (planner) names the cheapest fare with that many bags.
 */
export function BaggageBreakdown({
  carriers,
  main,
  fare,
  checkedBags,
  compact = false,
}: {
  carriers: string[]
  main?: string
  fare?: string
  checkedBags?: number
  compact?: boolean
}) {
  const bags = tripBaggage(carriers, { main, fare, checkedBags: checkedBags ?? 1 })
  if (bags.airlines.length === 0) {
    return bags.unknown.length ? (
      <p className="muted small">Not in the airline guide: {bags.unknown.join(', ')} (check their baggage rules on their sites).</p>
    ) : null
  }
  const several = bags.airlines.length > 1
  const mainRow = bags.checked.perAirline.find((r) => r.airline.name === bags.checked.main?.name) ?? bags.checked.perAirline[0]
  const limit = (name?: string) => (name ? <span className="muted"> · {name} sets the limit</span> : null)

  return (
    <div className={`bag-box small${compact ? ' compact' : ''}`}>
      {!compact && (
        <div className="bag-head">
          <strong>
            <Icon name="suitcase" size={16} /> Economy baggage{several ? ' that works on every flight' : ` · ${bags.airlines[0].name}`}
          </strong>
          {several && <span className={`tag bag-alike ${bags.similarity >= 0.85 ? 'good' : bags.similarity >= 0.6 ? 'ok' : 'low'}`}>{alikeLabel(bags.similarity)}</span>}
        </div>
      )}
      <dl className="bag-rows">
        <div>
          <dt>
            <Icon name="purse" size={15} /> Personal item
          </dt>
          <dd>
            {bags.personal.fits ? describeBag(bags.personal.fits) : several ? 'none on some flights: one piece only' : 'none (one piece only)'}
            {limit(bags.personal.strictest)}
          </dd>
        </div>
        <div>
          <dt>
            <Icon name="suitcase" size={15} /> Carry-on
          </dt>
          <dd>
            {describeBag(bags.carryOn.fits)}
            {limit(bags.carryOn.strictest)}
          </dd>
        </div>
        <div>
          <dt>
            <Icon name="checked" size={15} /> Checked
          </dt>
          <dd>
            {checkedBags != null ? (
              <CheapestFares bags={bags} />
            ) : mainRow.chosen ? (
              <>
                {describeChecked(mainRow.chosen)} <span className="muted">({mainRow.airline.name} {fareName(mainRow.chosen.fare)})</span>
              </>
            ) : (
              <>
                {several && <span className="muted">{mainRow.airline.name}: </span>}
                {mainRow.airline.checked.map((r) => `${fareName(r.fare)} ${describeChecked(r)}`).join(' · ')}
              </>
            )}
          </dd>
        </div>
      </dl>
      {several && !compact && (
        <p className="muted bag-note">
          On <strong>one ticket</strong> the main airline's checked allowance ({bags.checked.main?.name}) usually covers the whole trip; on
          separate tickets each airline's own rules apply and you check in again.
        </p>
      )}
      {bags.unknown.length > 0 && <p className="warning">Not in the guide: {bags.unknown.join(', ')}: check their rules too.</p>}
      {!compact && (
        <details className="bag-details">
          <summary>{several ? 'What each airline allows' : 'Details and what to confirm'}</summary>
          <AirlineRules airlines={bags.airlines} />
        </details>
      )}
    </div>
  )
}

function alikeLabel(similarity: number): string {
  return similarity >= 0.85 ? 'Rules alike' : similarity >= 0.6 ? 'Rules differ a bit' : 'Rules differ'
}

/** For each airline, the cheapest fare that includes the bags you need. */
function CheapestFares({ bags }: { bags: ReturnType<typeof tripBaggage> }) {
  if (bags.checked.needed === 0) return <>not needed</>
  return (
    <span className="bag-fares">
      {bags.checked.perAirline.map(({ airline, cheapestWithBags }) => (
        <span key={airline.name}>
          {airline.name}:{' '}
          {cheapestWithBags ? (
            <>
              {fareName(cheapestWithBags.fare)} <span className="muted">({describeChecked(cheapestWithBags)})</span>
            </>
          ) : (
            <span className="warning">no fare includes {bags.checked.needed}</span>
          )}
        </span>
      ))}
    </span>
  )
}

/** Each airline's own rules side by side: personal item, carry-on, checked by fare, comfort, what to confirm. */
function AirlineRules({ airlines }: { airlines: AirlineInfo[] }) {
  return (
    <div className="airline-rules">
      {airlines.map((a) => (
        <section key={a.name}>
          <h4>
            {a.name} <span className="muted">{[a.alliance, a.type === 'low-cost' ? 'low-cost' : ''].filter(Boolean).join(' · ')}</span>
          </h4>
          <dl className="bag-rows">
            <div>
              <dt>Personal item</dt>
              <dd>
                {describeBag(a.personalItem)}
                {a.personalItem?.note && <span className="muted"> ({a.personalItem.note})</span>}
              </dd>
            </div>
            <div>
              <dt>Carry-on</dt>
              <dd>
                {describeBag(a.carryOn)}
                {a.carryOn.note && <span className="muted"> ({a.carryOn.note})</span>}
                {a.cabinNote && <span className="muted"> {a.cabinNote}</span>}
              </dd>
            </div>
            <div>
              <dt>Checked</dt>
              <dd>
                {a.checked.map((r) => (
                  <span key={r.fare} className="bag-fare">
                    {fareName(r.fare)}: <strong>{describeChecked(r)}</strong>
                    {r.note && <span className={/confirm/i.test(r.note) ? 'warning' : 'muted'}> ({r.note})</span>}
                  </span>
                ))}
                {a.checkedMax && <span className="muted">Max per bag: {describeBag(a.checkedMax)}</span>}
              </dd>
            </div>
            <div>
              <dt>Comfort</dt>
              <dd>
                Legroom {a.legroom?.economy ?? 'not published'} · Premium economy: {PREMIUM_LABEL[a.premiumEconomy].toLowerCase()}
              </dd>
            </div>
          </dl>
          {a.toConfirm.length > 0 && <p className="warning">Confirm: {a.toConfirm.join('; ')}</p>}
        </section>
      ))}
    </div>
  )
}

const SCOPES: [AirlineInfo['scope'], string][] = [
  ['international', 'Brazil → Japan'],
  ['brazil', 'Inside Brazil'],
  ['japan-domestic', 'Inside Japan'],
]

/**
 * Side-by-side airline comparison: baggage (sizes and weights), premium
 * economy and legroom. `highlight` = airlines used in the trip's options.
 */
export function AirlineGuideTable({ highlight }: { highlight: string[] }) {
  const [scope, setScope] = useState<AirlineInfo['scope']>('international')
  const [onlyMine, setOnlyMine] = useState(highlight.length > 0)
  const airlines = AIRLINES.filter((a) => a.scope === scope && (!onlyMine || highlight.includes(a.name)))

  return (
    // Folded by default: it is reference material, opened when needed.
    <details className="card disclosure airline-guide">
      <summary>
        <span>
          <Icon name="suitcase" size={16} /> Airline guide
          <span className="muted small airline-guide-sub">Baggage, premium economy and legroom by airline</span>
        </span>
      </summary>
      <header className="row between wrap">
        <div className="row wrap">
          <div className="segmented" role="radiogroup" aria-label="Flights">
            {SCOPES.map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={scope === id} className={scope === id ? 'active' : ''} onClick={() => setScope(id)}>
                {label}
              </button>
            ))}
          </div>
          {highlight.length > 0 && (
            <label className="check">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
              Only airlines in my options
            </label>
          )}
        </div>
      </header>
      <p className="muted small">
        Economy rules for flights starting in Brazil, researched on the airlines' own pages on {formatDate(AIRLINE_GUIDE_UPDATED)}.
        Rules change and depend on the fare: always confirm on the ticket before buying. Red = sources disagreed or didn't say.
      </p>

      {airlines.length === 0 ? (
        <p className="muted small">None of your options' airlines are in the guide for these flights.</p>
      ) : (
        <div className="table-scroll">
          <table className="compare-table airline-table">
            <thead>
              <tr>
                <th>Airline</th>
                <th>Personal item</th>
                <th>Carry-on</th>
                <th>Checked (by fare)</th>
                <th>Premium economy</th>
                <th>Legroom</th>
              </tr>
            </thead>
            <tbody>
              {airlines.map((a) => (
                <tr key={a.name} className={highlight.includes(a.name) ? 'mine' : ''}>
                  <td data-label="Airline">
                    <strong>{a.name}</strong>
                    <span className="muted small airline-meta">
                      {[a.hub, a.alliance, a.type === 'low-cost' ? 'low-cost' : ''].filter(Boolean).join(' · ')}
                    </span>
                  </td>
                  <td data-label="Personal item">
                    {describeBag(a.personalItem)}
                    {a.personalItem?.note && a.personalItem.cm && <span className="muted small"> ({a.personalItem.note})</span>}
                  </td>
                  <td data-label="Carry-on">
                    {describeBag(a.carryOn)}
                    {a.carryOn.note && a.carryOn.cm && <span className="muted small"> ({a.carryOn.note})</span>}
                    {a.cabinNote && <span className="muted small airline-meta">{a.cabinNote}</span>}
                  </td>
                  <td data-label="Checked">
                    <ul className="fare-list">
                      {a.checked.map((r) => (
                        <li key={r.fare}>
                          <span>{r.fare}:</span> <strong>{describeChecked(r)}</strong>
                          {r.note && <span className={`small ${/confirm/i.test(r.note) ? 'warning' : 'muted'}`}> ({r.note})</span>}
                        </li>
                      ))}
                    </ul>
                    {a.checkedMax && (
                      <span className="muted small">
                        Max per bag: {[a.checkedMax.kg && `${a.checkedMax.kg} kg`, a.checkedMax.linearCm && `${a.checkedMax.linearCm} cm total`].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </td>
                  <td data-label="Premium economy">{PREMIUM_LABEL[a.premiumEconomy]}</td>
                  <td data-label="Legroom">
                    {a.legroom?.economy || a.legroom?.premiumEconomy ? (
                      <>
                        {a.legroom.economy && <span className="airline-meta">Economy: {a.legroom.economy}</span>}
                        {a.legroom.premiumEconomy && <span className="airline-meta">Premium: {a.legroom.premiumEconomy}</span>}
                      </>
                    ) : (
                      <span className="muted small">not published</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="airline-details">
        <summary className="small">Notes, what to confirm and sources</summary>
        {airlines.map((a) => (
          <div key={a.name} className="airline-sources small">
            <strong>{a.name}</strong>
            {a.notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
            {a.toConfirm.length > 0 && <p className="warning">Confirm: {a.toConfirm.join('; ')}</p>}
            <p>
              {a.sources.map((s, i) => (
                <a key={s} href={s} target="_blank" rel="noreferrer">
                  Source {i + 1}
                </a>
              ))}
            </p>
          </div>
        ))}
      </details>
    </details>
  )
}
