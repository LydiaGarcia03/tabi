import { inDisplayCurrency, totalsList, type Totals } from '../budget'
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
