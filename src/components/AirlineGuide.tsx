import { useState } from 'react'
import {
  AIRLINE_GUIDE_UPDATED,
  AIRLINES,
  checkedForFare,
  describeBag,
  describeChecked,
  type AirlineInfo,
} from '../data/airlines'
import { formatDate } from '../dates'

const PREMIUM_LABEL: Record<AirlineInfo['premiumEconomy'], string> = {
  yes: 'Yes',
  no: 'No',
  'some aircraft': 'Some aircraft',
}

/** Compact baggage line for one airline (and fare, when known). */
export function BaggageSummary({ airline, fare }: { airline: AirlineInfo; fare?: string }) {
  const rule = checkedForFare(airline, fare)
  return (
    <div className="baggage-summary small">
      <span className="baggage-title">🧳 {airline.name} — economy baggage</span>
      <span>
        <strong>Personal item:</strong> {describeBag(airline.personalItem)}
      </span>
      <span>
        <strong>Carry-on:</strong> {describeBag(airline.carryOn)}
        {airline.carryOn.note && <span className="muted"> ({airline.carryOn.note})</span>}
      </span>
      {airline.cabinNote && <span className="muted">{airline.cabinNote}</span>}
      <span>
        <strong>Checked:</strong>{' '}
        {rule
          ? `${describeChecked(rule)} (${rule.fare})`
          : airline.checked.map((r) => `${r.fare}: ${describeChecked(r)}`).join(' · ')}
        {rule?.note && <span className="muted"> — {rule.note}</span>}
      </span>
      {airline.toConfirm.length > 0 && <span className="warning">Confirm: {airline.toConfirm.join('; ')}</span>}
    </div>
  )
}

/**
 * Side-by-side airline comparison: baggage (sizes and weights), premium
 * economy and legroom. `highlight` = airlines used in the trip's options.
 */
export function AirlineGuideTable({ highlight }: { highlight: string[] }) {
  const [scope, setScope] = useState<AirlineInfo['scope']>('international')
  const [onlyMine, setOnlyMine] = useState(highlight.length > 0)
  const airlines = AIRLINES.filter((a) => a.scope === scope && (!onlyMine || highlight.includes(a.name)))

  return (
    <section className="card airline-guide">
      <header className="row between wrap">
        <h2>🧳 Airline guide</h2>
        <div className="row wrap">
          <div className="segmented" role="radiogroup" aria-label="Flights">
            <button type="button" role="radio" aria-checked={scope === 'international'} className={scope === 'international' ? 'active' : ''} onClick={() => setScope('international')}>
              Brazil → Japan
            </button>
            <button type="button" role="radio" aria-checked={scope === 'japan-domestic'} className={scope === 'japan-domestic' ? 'active' : ''} onClick={() => setScope('japan-domestic')}>
              Inside Japan
            </button>
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
    </section>
  )
}
