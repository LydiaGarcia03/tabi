import { today } from '../dates'
import type { OptionFare } from '../db/model'
import { isStale } from '../planning/fares'

interface Props {
  fares: OptionFare[]
  /** The fare used for the price. */
  index: number
  currency: string
  /** Fare names to suggest (from the airline guide). */
  suggestions: string[]
  onChange: (fares: OptionFare[], index: number) => void
}

/**
 * A transport option's fares as a small table: fare, bags, price and the day
 * the price was seen (set to today when the price is typed). With several,
 * the marked one is used for the comparison and the budget.
 */
export function FaresEditor({ fares, index, currency, suggestions, onChange }: Props) {
  const rows = fares.length ? fares : [{}]
  const several = rows.length > 1

  const set = (i: number, change: Partial<OptionFare>) => onChange(rows.map((f, j) => (j === i ? { ...f, ...change } : f)), index)
  const setPrice = (i: number, text: string) => {
    const amount = Number(text)
    const price = text.trim() !== '' && Number.isFinite(amount) && amount >= 0 ? { amount, currency } : undefined
    set(i, { price, seenOn: price ? today() : rows[i].seenOn })
  }
  const remove = (i: number) => {
    const rest = rows.filter((_, j) => j !== i)
    onChange(rest, i < index ? index - 1 : i === index ? 0 : index)
  }

  return (
    <div className="field fares-editor">
      <span className="field-label">{several ? 'Fares (the marked one counts)' : 'Price'}</span>
      <div className="fares-head" aria-hidden="true">
        {several && <span />}
        <span>Fare</span>
        <span>Bags</span>
        <span>Price ({currency})</span>
        <span>Seen on</span>
        {several && <span />}
      </div>
      <ol className={`fares-rows${several ? ' several' : ''}`}>
        {rows.map((fare, i) => {
          const label = fare.name || `fare ${i + 1}`
          return (
            <li key={i} className="fare-row">
              {several && (
                <input
                  type="radio"
                  name="chosen-fare"
                  checked={i === index}
                  onChange={() => onChange(rows, i)}
                  aria-label={`Use ${label} for the price`}
                />
              )}
              <input
                value={fare.name ?? ''}
                list="fare-names"
                onChange={(e) => set(i, { name: e.target.value })}
                placeholder={several ? 'Light, Classic…' : 'Fare (optional)'}
                aria-label={`Fare ${i + 1} name`}
              />
              <input
                value={fare.bags ?? ''}
                onChange={(e) => set(i, { bags: e.target.value })}
                placeholder="+1 × 23 kg"
                aria-label={`${label} bags`}
              />
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={fare.price?.amount ?? ''}
                onChange={(e) => setPrice(i, e.target.value)}
                aria-label={`${label} price (${currency})`}
              />
              <input
                type="date"
                className={isStale(fare.seenOn) ? 'stale' : ''}
                value={fare.seenOn ?? ''}
                max={today()}
                onChange={(e) => set(i, { seenOn: e.target.value || undefined })}
                aria-label={`${label} price seen on`}
                title="When you saw this price"
              />
              {several && (
                <button type="button" className="ghost icon-button" onClick={() => remove(i)} aria-label={`Remove ${label}`}>
                  ✕
                </button>
              )}
            </li>
          )
        })}
      </ol>
      <datalist id="fare-names">
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <button type="button" className="link toggle-link" onClick={() => onChange([...rows, {}], index)}>
        <span>+ Add a fare</span>
        <span className="muted small">another fare of the same flights (bags, price)</span>
      </button>
    </div>
  )
}
