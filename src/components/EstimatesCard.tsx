import { useState, type FormEvent } from 'react'
import { CATEGORIES, CATEGORY_LABEL, displayAmount, type Budget, type Totals } from '../budget'
import type { Estimate, ExpenseCategory, Trip } from '../db/model'
import { updateTrip } from '../db/trips'
import { formatMoney } from '../format'

interface Props {
  trip: Trip
  /** What is already booked or spent (the trip budget). */
  actual: Budget
}

/**
 * Rough guesses ("estimates") per category, compared with what is already
 * booked or spent, in the display currency.
 */
export function EstimatesCard({ trip, actual }: Props) {
  const estimates = trip.estimates ?? []
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const save = (next: Estimate[]) => updateTrip(trip.id, { estimates: next })

  const rows = CATEGORIES.map((category) => {
    const own = estimates.filter((e) => e.category === category)
    const totals: Totals = {}
    own.forEach((e) => (totals[e.amount.currency] = (totals[e.amount.currency] ?? 0) + e.amount.amount))
    return {
      category,
      estimate: own.length ? displayAmount(totals, trip) : 0,
      actual: actual.byCategory[category] ? displayAmount(actual.byCategory[category]!, trip) : 0,
    }
  }).filter((r) => r.estimate !== 0 || r.actual !== 0)

  const sum = (key: 'estimate' | 'actual') =>
    rows.some((r) => r[key] == null) ? null : rows.reduce((total, r) => total + (r[key] ?? 0), 0)
  const money = (amount: number | null) => (amount == null ? '—' : formatMoney({ amount, currency: trip.displayCurrency }))

  return (
    <section className="card">
      <h2>Estimated vs. booked</h2>
      <p className="muted small">
        Your rough guesses (“conta de padeiro”) next to what is already in the plan: bookings, expenses, place costs and
        fares. In {trip.displayCurrency}.
      </p>

      {rows.length > 0 && (
        <table className="compare-table estimates-table">
          <thead>
            <tr>
              <th>Category</th>
              <th className="num">Estimated</th>
              <th className="num">Booked</th>
              <th className="bar-cell" aria-label="Progress" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.category}>
                <td>{CATEGORY_LABEL[r.category]}</td>
                <td className="num">{money(r.estimate)}</td>
                <td className="num">{money(r.actual)}</td>
                <td className="bar-cell">
                  <ProgressBar estimate={r.estimate} actual={r.actual} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>Total</th>
              <th className="num">{money(sum('estimate'))}</th>
              <th className="num">{money(sum('actual'))}</th>
              <th className="bar-cell">
                <ProgressBar estimate={sum('estimate')} actual={sum('actual')} />
              </th>
            </tr>
          </tfoot>
        </table>
      )}
      {rows.some((r) => r.estimate == null || r.actual == null) && (
        <p className="muted small">Set the exchange rate (Trip settings) to compare amounts in different currencies.</p>
      )}

      <h3>Estimates</h3>
      <ul className="expense-list">
        {estimates.map((estimate) =>
          editing === estimate.id ? (
            <li key={estimate.id}>
              <EstimateForm
                trip={trip}
                estimate={estimate}
                onSave={(e) => save(estimates.map((x) => (x.id === e.id ? e : x))).then(() => setEditing(null))}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={estimate.id} className="expense-row">
              <span className="expense-main">
                <span>{estimate.label}</span>
                <span className="muted small">{CATEGORY_LABEL[estimate.category]}</span>
              </span>
              <span className="row">
                <strong>{formatMoney(estimate.amount)}</strong>
                <button type="button" className="link" onClick={() => setEditing(estimate.id)}>
                  Edit
                </button>
                <button type="button" className="link" onClick={() => save(estimates.filter((x) => x.id !== estimate.id))}>
                  Remove
                </button>
              </span>
            </li>
          ),
        )}
      </ul>
      {editing === 'new' ? (
        <EstimateForm
          trip={trip}
          onSave={(e) => save([...estimates, e]).then(() => setEditing(null))}
          onCancel={() => setEditing(null)}
        />
      ) : (
        editing === null && (
          <div className="row">
            <button type="button" onClick={() => setEditing('new')}>
              + Add estimate
            </button>
          </div>
        )
      )}
    </section>
  )
}

function ProgressBar({ estimate, actual }: { estimate: number | null; actual: number | null }) {
  if (!estimate || actual == null) return null
  const ratio = actual / estimate
  return (
    <span className={`progress${ratio > 1 ? ' over' : ''}`} title={`${Math.round(ratio * 100)}% of the estimate`}>
      <span style={{ width: `${Math.min(100, ratio * 100)}%` }} />
    </span>
  )
}

function EstimateForm({
  trip,
  estimate,
  onSave,
  onCancel,
}: {
  trip: Trip
  estimate?: Estimate
  onSave: (estimate: Estimate) => void
  onCancel: () => void
}) {
  const [label, setLabel] = useState(estimate?.label ?? '')
  const [category, setCategory] = useState<ExpenseCategory>(estimate?.category ?? 'food')
  const [amount, setAmount] = useState(estimate ? String(estimate.amount.amount) : '')
  const [currency, setCurrency] = useState(estimate?.amount.currency ?? trip.displayCurrency)
  const value = Number(amount)
  const valid = label.trim() !== '' && amount.trim() !== '' && Number.isFinite(value) && value >= 0
  const currencies = [...new Set([trip.displayCurrency, trip.baseCurrency, currency])]

  function submit(e: FormEvent) {
    e.preventDefault()
    if (valid) onSave({ id: estimate?.id ?? crypto.randomUUID(), label: label.trim(), category, amount: { amount: value, currency } })
  }

  return (
    <form className="expense-form" onSubmit={submit}>
      <div className="field-row">
        <label>
          What
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Food in Tokyo" autoFocus />
        </label>
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field-row">
        <label>
          Amount
          <input type="number" min="0" step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          Currency
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="row">
        <button type="submit" className="primary" disabled={!valid}>
          Save estimate
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
