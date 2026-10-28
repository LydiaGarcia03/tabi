import { useState, type FormEvent } from 'react'
import { CATEGORIES, CATEGORY_ICON, CATEGORY_LABEL, displayAmount, expensesBudget, totalsList, type Budget, type Totals } from '../budget'
import { addExpense, deleteExpense, updateExpense } from '../db/expenses'
import type { Expense, ExpenseCategory, Trip } from '../db/model'
import { formatMoney } from '../format'
import { currencyChoices } from '../money/currencies'
import { Icon } from './Icon'

const LAST_CATEGORY = 'tabi.spentCategory'

function lastCategory(): ExpenseCategory {
  try {
    const saved = localStorage.getItem(LAST_CATEGORY) as ExpenseCategory | null
    return saved && CATEGORIES.includes(saved) ? saved : 'food'
  } catch {
    return 'food'
  }
}

/**
 * "Money for the day" (User's picks from mocks, 2026-10-27). Before the trip (6A): the day's estimate per
 * category (its places and routes; what is booked ahead is on the Budget page) and a line saying what comes
 * here during the trip. From the trip's first day (6C): spent / estimated per category, a one-line entry to log
 * what was spent (7C: amount, category + what, add) and the day's entries, folded. Entries are the day's expenses.
 */
export function DayMoney({
  trip,
  dayId,
  estimate,
  expenses,
  started,
}: {
  trip: Trip
  dayId: string
  estimate: Budget
  expenses: Expense[]
  started: boolean
}) {
  const spent = expensesBudget(expenses)
  const show = (totals: Totals | undefined) => {
    if (!totals || Object.keys(totals).length === 0) return formatMoney({ amount: 0, currency: trip.displayCurrency })
    const value = displayAmount(totals, trip)
    return value != null ? formatMoney({ amount: value, currency: trip.displayCurrency }) : totalsList(totals, trip).map(formatMoney).join(' + ')
  }
  const categories = CATEGORIES.filter((c) => estimate.byCategory[c] || (started && spent.byCategory[c]))

  return (
    <section className="card day-money">
      <div className="money-head">
        <h2 className="trip-money-kicker">
          <Icon name="wallet" size={16} /> Money for the day
        </h2>
        {started ? <span className="muted small">spent / estimated</span> : <strong className="num">≈ {show(estimate.total)}</strong>}
      </div>
      {categories.length > 0 ? (
        <ul className="day-money-cats">
          {categories.map((c) => {
            const est = displayAmount(estimate.byCategory[c] ?? {}, trip)
            const out = displayAmount(spent.byCategory[c] ?? {}, trip)
            const full = Math.max(est ?? 0, out ?? 0)
            return (
              <li key={c} style={{ ['--cat' as string]: `var(--cat-${c})` }}>
                <Icon name={CATEGORY_ICON[c]} size={16} />
                <span className="name">{CATEGORY_LABEL[c]}</span>
                {started ? (
                  <span className="estimate-bar" aria-hidden="true">
                    <span
                      className={out != null && est != null && out > est ? 'over' : 'fill'}
                      style={{ width: `${full > 0 && out != null ? Math.min(100, (out / full) * 100) : 0}%` }}
                    />
                  </span>
                ) : (
                  <span />
                )}
                <span className="value">
                  {started && `${show(spent.byCategory[c])} / `}
                  {estimate.byCategory[c] ? show(estimate.byCategory[c]) : '—'}
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        !started && <p className="muted small">No prices on this day's places or routes yet.</p>
      )}
      {started ? (
        <SpentToday trip={trip} dayId={dayId} expenses={expenses} total={show(spent.total)} />
      ) : (
        <p className="day-money-info">
          <Icon name="info" size={16} />
          <span>During the trip, log here what you spend each day; it's compared with this estimate.</span>
        </p>
      )}
    </section>
  )
}

/** The quick entry (7C) and the day's entries (folded): a tap on one loads it in the entry to change it. */
function SpentToday({ trip, dayId, expenses, total }: { trip: Trip; dayId: string; expenses: Expense[]; total: string }) {
  const [editing, setEditing] = useState<Expense | null>(null)
  const [amount, setAmount] = useState('')
  const [what, setWhat] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>(lastCategory)
  const [picking, setPicking] = useState(false)
  const [open, setOpen] = useState(false)
  const value = Number(amount.replace(',', '.'))
  const valid = amount.trim() !== '' && Number.isFinite(value) && value > 0
  // Amounts typed on the trip start in its main currency (yen); a tap on the code switches (yen, dollars…).
  const [chosenCurrency, setChosenCurrency] = useState(trip.baseCurrency)
  const currency = editing?.amount.currency ?? chosenCurrency
  const currencies = currencyChoices(trip, currency)
  const switchCurrency = () => {
    const next = currencies[(currencies.indexOf(currency) + 1) % currencies.length]
    if (editing) setEditing({ ...editing, amount: { ...editing.amount, currency: next } })
    else setChosenCurrency(next)
  }

  const pick = (next: ExpenseCategory) => {
    setCategory(next)
    setPicking(false)
    try {
      localStorage.setItem(LAST_CATEGORY, next)
    } catch {
      // Private mode: the choice just isn't remembered.
    }
  }

  const reset = () => {
    setEditing(null)
    setAmount('')
    setWhat('')
    setPicking(false)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    const values = { category, description: what.trim() || CATEGORY_LABEL[category], amount: { amount: value, currency } }
    if (editing) await updateExpense(editing.id, values)
    else await addExpense({ ...values, tripId: trip.id, dayId })
    reset()
  }

  const edit = (expense: Expense) => {
    setEditing(expense)
    setAmount(String(expense.amount.amount))
    setWhat(expense.description === CATEGORY_LABEL[expense.category] ? '' : expense.description)
    setCategory(expense.category)
  }

  return (
    <>
      <form className="spent-entry" onSubmit={submit} style={{ ['--cat' as string]: `var(--cat-${category})` }}>
        <span className="estimate-amount">
          <input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            aria-label={`Amount in ${currency}`}
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {currencies.length > 1 ? (
            <button type="button" className="estimate-currency" title="Change the currency" onClick={switchCurrency}>
              {currency}
            </button>
          ) : (
            <span className="estimate-currency">{currency}</span>
          )}
        </span>
        <span className="spent-what">
          <button
            type="button"
            className="ghost icon-button spent-category"
            aria-label={`Category: ${CATEGORY_LABEL[category]}. Change`}
            aria-expanded={picking}
            title={CATEGORY_LABEL[category]}
            onClick={() => setPicking(!picking)}
          >
            <Icon name={CATEGORY_ICON[category]} size={18} />
          </button>
          <input aria-label="What" placeholder="What for?" value={what} onChange={(e) => setWhat(e.target.value)} />
        </span>
        <button type="submit" className="primary icon-button" disabled={!valid} aria-label={editing ? 'Save' : 'Add'}>
          <Icon name={editing ? 'check' : 'plus'} size={18} />
        </button>
      </form>
      {picking && (
        <div className="spent-categories" role="group" aria-label="Category">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" aria-pressed={c === category} onClick={() => pick(c)}>
              <Icon name={CATEGORY_ICON[c]} size={14} /> {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      )}
      {editing && (
        <button type="button" className="link-quiet" onClick={reset}>
          <Icon name="close" size={14} /> Cancel the change
        </button>
      )}
      {expenses.length > 0 && (
        <ul className="money-items spent-list">
          <li>
            <button type="button" className="link-quiet" aria-expanded={open} onClick={() => setOpen(!open)}>
              <Icon name={open ? 'down' : 'forward'} size={14} /> {expenses.length} {expenses.length === 1 ? 'entry' : 'entries'} today
            </button>
            <span className="num muted small">{total}</span>
          </li>
          {open &&
            expenses.map((expense) => (
              <li key={expense.id}>
                <button type="button" className="link-quiet money-item-name" onClick={() => edit(expense)}>
                  <Icon name={CATEGORY_ICON[expense.category]} size={16} />
                  <span>{expense.description}</span>
                </button>
                <span className="num">
                  {formatMoney(expense.amount)}
                  <button type="button" className="ghost icon-button remove" aria-label={`Remove ${expense.description}`} onClick={() => deleteExpense(expense.id)}>
                    <Icon name="close" size={16} />
                  </button>
                </span>
              </li>
            ))}
        </ul>
      )}
    </>
  )
}
