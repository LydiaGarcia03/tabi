import { CATEGORIES, CATEGORY_LABEL, inDisplayCurrency, totalsList, type Budget, type Totals } from '../budget'
import type { Trip } from '../db/model'
import { formatMoney } from '../format'

/**
 * "¥12,300 ≈ R$ 430.50", or "—" when there is nothing. `resultOnly` shows just
 * the converted sum ("≈ R$ 430.50"), for totals with many currencies.
 */
export function MoneyTotals({ totals, trip, resultOnly }: { totals: Totals; trip: Trip; resultOnly?: boolean }) {
  const list = totalsList(totals, trip)
  if (list.length === 0) return <span className="muted">—</span>
  const converted = inDisplayCurrency(totals, trip)
  const showConversion = converted && list.some((m) => m.currency !== trip.displayCurrency)
  if (resultOnly && converted) {
    // "≈" when part of it was converted with the trip's rate.
    const sum = formatMoney({ amount: converted.amount, currency: trip.displayCurrency })
    return (
      <span>
        {showConversion ? `≈ ${sum}` : sum}
        {converted.unconverted.length > 0 && ` + ${converted.unconverted.map(formatMoney).join(' + ')}`}
      </span>
    )
  }
  return (
    <span>
      {list.map(formatMoney).join(' + ')}
      {showConversion && (
        <span className="muted">
          {' '}
          ≈ {formatMoney({ amount: converted.amount, currency: trip.displayCurrency })}
          {converted.unconverted.length > 0 && ` (+ ${converted.unconverted.map(formatMoney).join(' + ')})`}
        </span>
      )}
    </span>
  )
}

/** Total plus one row per category that has costs. */
export function BudgetBreakdown({ budget, trip, title }: { budget: Budget; trip: Trip; title: string }) {
  const categories = CATEGORIES.filter((c) => budget.byCategory[c])
  return (
    <div className="budget">
      <div className="budget-total">
        <strong>{title}</strong>
        <MoneyTotals totals={budget.total} trip={trip} resultOnly />
      </div>
      {categories.length > 0 && (
        <ul className="budget-categories">
          {categories.map((c) => (
            <li key={c}>
              <span>{CATEGORY_LABEL[c]}</span>
              <MoneyTotals totals={budget.byCategory[c]!} trip={trip} />
            </li>
          ))}
        </ul>
      )}
      {!(trip.exchangeRate > 0) && (
        <p className="muted small">
          Set the exchange rate (Trip settings, on the itinerary page) to see totals in {trip.displayCurrency}.
        </p>
      )}
    </div>
  )
}
