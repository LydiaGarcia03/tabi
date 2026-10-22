import { useState } from 'react'
import { displayAmount, estimatesTotal, type Budget } from '../budget'
import type { Trip } from '../db/model'
import { updateTrip } from '../db/trips'
import { formatMoney } from '../format'
import { useDraft } from '../useDraft'
import { Icon } from './Icon'

/**
 * How much money is already set aside for the trip, next to what it should
 * cost: the estimates when there are any, else what is already in the plan.
 */
export function SavingsCard({ trip, actual }: { trip: Trip; actual: Budget }) {
  const [currency, setCurrency] = useState(trip.savedMoney?.currency ?? trip.displayCurrency)
  const [amount, setAmount] = useDraft(trip.savedMoney ? String(trip.savedMoney.amount) : '', (text) => {
    const value = Number(text.replace(',', '.'))
    if (text.trim() === '') void updateTrip(trip.id, { savedMoney: undefined })
    else if (Number.isFinite(value) && value >= 0) void updateTrip(trip.id, { savedMoney: { amount: value, currency } })
  })
  const currencies = [...new Set([trip.displayCurrency, trip.baseCurrency, currency])]

  const saved = trip.savedMoney ? displayAmount({ [trip.savedMoney.currency]: trip.savedMoney.amount }, trip) : null
  const estimated = (trip.estimates ?? []).length > 0 ? estimatesTotal(trip) : null
  const planned = displayAmount(actual.total, trip)
  const target = estimated || planned || null
  const targetLabel = estimated ? 'the estimated cost' : 'what is in the plan so far'
  const money = (value: number) => formatMoney({ amount: value, currency: trip.displayCurrency })

  return (
    <section className="card savings-card">
      <h2>Money set aside</h2>
      <div className="field-row">
        <label>
          Saved for this trip so far
          <input type="number" min="0" step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </label>
        <label>
          Currency
          <select
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value)
              if (trip.savedMoney) void updateTrip(trip.id, { savedMoney: { ...trip.savedMoney, currency: e.target.value } })
            }}
          >
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      {saved != null && target != null && target > 0 && (
        <div className="savings-progress">
          <span className={`progress${saved >= target ? ' done' : ''}`}>
            <span style={{ width: `${Math.min(100, (saved / target) * 100)}%` }} />
          </span>
          <p className="small">
            <strong>{Math.round((saved / target) * 100)}%</strong> of {targetLabel} ({money(target)}).{' '}
            {saved >= target ? (
              <span className="ok-text">
                <Icon name="done" size={16} /> Fully covered
              </span>
            ) : (
              `Still missing ${money(target - saved)}.`
            )}
          </p>
        </div>
      )}
      {trip.savedMoney && saved == null && (
        <p className="muted small">Set the exchange rate (Trip settings) to compare it with the trip's costs.</p>
      )}
      {saved != null && target == null && (
        <p className="muted small">Add estimates below (or bookings) to see how much is still missing.</p>
      )}
    </section>
  )
}
