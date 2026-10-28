import { useState, type FormEvent } from 'react'
import {
  CATEGORIES,
  CATEGORY_ICON,
  CATEGORY_LABEL,
  displayAmount,
  itemAmount,
  sumItems,
  type CategoryMoney,
  type MoneyItem,
  type TripMoney,
} from '../budget'
import type { Estimate, Expense, ExpenseCategory, Trip } from '../db/model'
import { updateTrip } from '../db/trips'
import { formatMoney } from '../format'
import { href } from '../router'
import { useDraft } from '../useDraft'
import { ExpenseList } from './ExpenseList'
import { CategorySelect } from './CategorySelect'
import { Icon } from './Icon'
import { Sheet } from './Sheet'
import { currencyChoices } from '../money/currencies'

// The Budget page (User's model and picks from mocks, 2026-10-27): what needs booking is paid before the trip;
// everything else is an estimate (the itinerary + additional estimates); during the trip, estimated vs spent.
// Nothing about money really spent is shown before the trip's first day (`started`).

const useMoney = (trip: Trip) => (amount: number) => formatMoney({ amount, currency: trip.displayCurrency })

const compact = (amount: number, currency: string) =>
  new Intl.NumberFormat('en', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(amount)

const categoryColor = (category: ExpenseCategory) => `var(--cat-${category})`

const share = (amount: number, of: number) => `${of > 0 ? Math.max(0, Math.min(100, (amount / of) * 100)) : 0}%`

/**
 * "Trip money" (1A): what was set aside for the trip, then what goes out of it — booked (paid), still to book,
 * estimated (before the trip) or spent + estimated still to spend (during it) — ending in "Left over" or "Missing".
 */
export function TripMoneyCard({
  trip,
  money,
  categories,
  started,
}: {
  trip: Trip
  money: TripMoney
  categories: CategoryMoney[] | null
  started: boolean
}) {
  const [editing, setEditing] = useState(false)
  const show = useMoney(trip)
  const reserve = trip.savedMoney ? displayAmount({ [trip.savedMoney.currency]: trip.savedMoney.amount }, trip) : null
  const paid = sumItems(money.bookAhead.filter((i) => i.booked), trip)
  const toBook = sumItems(money.bookAhead.filter((i) => !i.booked), trip)

  const head = (
    <div className="money-head">
      <p className="trip-money-kicker">
        <Icon name="wallet" size={16} /> Trip money
      </p>
      {trip.savedMoney && !editing && (
        <button type="button" className="link" onClick={() => setEditing(true)}>
          Edit
        </button>
      )}
    </div>
  )

  if (!categories || paid == null || toBook == null) {
    return (
      <section className="card trip-money">
        {head}
        <p className="muted small">Set the rate of each currency (Trip settings, on the itinerary page) to add up amounts in {trip.displayCurrency}.</p>
        {editing || !trip.savedMoney ? <SavedEdit trip={trip} onDone={() => setEditing(false)} /> : <p className="money-reserve">{formatMoney(trip.savedMoney)}</p>}
      </section>
    )
  }

  const estimated = categories.reduce((sum, c) => sum + c.estimate, 0)
  const spent = categories.reduce((sum, c) => sum + c.spent, 0)
  const estimatedLeft = categories.reduce((sum, c) => sum + Math.max(0, c.estimate - c.spent), 0)
  const needed = paid + toBook + (started ? spent + estimatedLeft : estimated)
  const left = reserve == null ? null : reserve - needed
  const full = Math.max(reserve ?? 0, needed)

  return (
    <section className="card trip-money">
      {head}
      {editing || !trip.savedMoney ? (
        <SavedEdit trip={trip} onDone={() => setEditing(false)} />
      ) : (
        <>
          <p className="muted small money-reserve-label">Set aside for the trip</p>
          <p className="money-reserve">{reserve != null ? show(reserve) : formatMoney(trip.savedMoney)}</p>
        </>
      )}
      {full > 0 && (
        <span className="money-bar" aria-hidden="true">
          <span className="paid" style={{ width: share(paid, full) }} />
          <span className="unbooked" style={{ width: share(toBook, full) }} />
          {started && <span className="spent" style={{ width: share(spent, full) }} />}
          <span className="estimated" style={{ width: share(started ? estimatedLeft : estimated, full) }} />
          {left != null && left > 0 && <span className="free" style={{ width: share(left, full) }} />}
          {left != null && left < 0 && <span className="missing" style={{ width: share(-left, full) }} />}
        </span>
      )}
      <ul className="money-lines">
        <MoneyLine swatch="paid" label={started ? 'Booked (paid before)' : 'Booked (paid)'} amount={-paid} show={show} />
        {(toBook > 0 || !started) && <MoneyLine swatch="unbooked" label="Still to book" amount={-toBook} show={show} />}
        {started && <MoneyLine swatch="spent" label="Spent on the trip" amount={-spent} show={show} />}
        <MoneyLine swatch="estimated" label={started ? 'Estimated, still to spend' : 'Estimated'} amount={-(started ? estimatedLeft : estimated)} show={show} />
        <li className="money-result">
          {left == null ? (
            <>
              <span>Needed for the trip</span>
              <strong>{show(needed)}</strong>
            </>
          ) : left >= 0 ? (
            <>
              <span className="ok-text">
                <Icon name="check" size={16} /> Left over
              </span>
              <strong className="ok-text">{show(left)}</strong>
            </>
          ) : (
            <>
              <span className="money-alert">
                <Icon name="warning" size={16} /> Missing
              </span>
              <strong className="money-alert">{show(-left)}</strong>
            </>
          )}
        </li>
      </ul>
    </section>
  )
}

function MoneyLine({ swatch, label, amount, show }: { swatch: string; label: string; amount: number; show: (n: number) => string }) {
  return (
    <li>
      <span>
        <i className={`money-swatch ${swatch}`} aria-hidden="true" /> {label}
      </span>
      <span className="num">{amount ? `−${show(-amount)}` : show(0)}</span>
    </li>
  )
}

/** How much was set aside for the trip (everything put aside, including what already paid the bookings). */
function SavedEdit({ trip, onDone }: { trip: Trip; onDone: () => void }) {
  const [currency, setCurrency] = useState(trip.savedMoney?.currency ?? trip.displayCurrency)
  const [amount, setAmount] = useDraft(trip.savedMoney ? String(trip.savedMoney.amount) : '', (text) => {
    const value = Number(text.replace(',', '.'))
    if (text.trim() === '') void updateTrip(trip.id, { savedMoney: undefined })
    else if (Number.isFinite(value) && value >= 0) void updateTrip(trip.id, { savedMoney: { amount: value, currency } })
  })
  const currencies = [...new Set([trip.displayCurrency, ...currencyChoices(trip, currency)])]

  return (
    <div className="saved-edit">
      <label className="field-label" htmlFor="saved-money">
        Set aside for the trip <span className="muted">(including what you already paid)</span>
      </label>
      <div className="savings-input">
        <input
          id="saved-money"
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
        />
        <select
          aria-label="Currency"
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
        {trip.savedMoney && (
          <button type="button" onClick={onDone}>
            Done
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * "Book before the trip" (2B): the checklist's items with their prices — how many are booked, paid vs still to
 * book, the ones left (with their category's icon), and the paid ones behind "Show the N paid".
 */
export function BookAheadCard({ trip, items }: { trip: Trip; items: MoneyItem[] }) {
  const [showPaid, setShowPaid] = useState(false)
  const show = useMoney(trip)
  const booked = items.filter((i) => i.booked)
  const left = items.filter((i) => !i.booked)
  const paid = sumItems(booked, trip)
  const toBook = sumItems(left, trip)
  const amount = (item: MoneyItem) => {
    const value = itemAmount(item, trip)
    return !item.amount ? '—' : value != null ? show(value) : formatMoney(item.amount)
  }
  const row = (item: MoneyItem) => (
    <li key={item.id} className={item.booked ? 'paid' : undefined}>
      <span className="money-item-name">
        <Icon name={item.icon} size={16} />
        <span>{item.name}</span>
      </span>
      <span className={`num${item.booked ? ' ok-text' : ''}`}>
        {amount(item)}
        {item.booked && <Icon name="check" size={14} />}
      </span>
    </li>
  )

  return (
    <section className="card book-ahead">
      <div className="money-head">
        <p className="trip-money-kicker">
          <Icon name="calendar" size={16} /> Book before the trip
        </p>
        <a className="link small" href={href({ page: 'trip', tripId: trip.id })}>
          Checklist <Icon name="forward" size={14} />
        </a>
      </div>
      {items.length === 0 ? (
        <p className="muted small">Hotels, flights and tickets that need booking show up here once they're in the itinerary.</p>
      ) : (
        <>
          <div className="book-ahead-count small">
            <span className="muted">
              {booked.length} of {items.length} booked
            </span>
            {paid != null && toBook != null && <span className="num">{show(paid + toBook)}</span>}
          </div>
          <span className={`progress${left.length === 0 ? ' done' : ''}`} aria-hidden="true">
            <span style={{ width: share(booked.length, items.length) }} />
          </span>
          {paid != null && toBook != null && (
            <div className="book-ahead-count small">
              <span className="ok-text num">{show(paid)} paid</span>
              <span className="num">{show(toBook)} to book</span>
            </div>
          )}
          <ul className="money-items">
            {left.map(row)}
            {booked.length > 0 && (
              <li>
                <button type="button" className="link-quiet" aria-expanded={showPaid} onClick={() => setShowPaid(!showPaid)}>
                  <Icon name={showPaid ? 'down' : 'forward'} size={14} />{' '}
                  {left.length === 0 ? `All ${booked.length} booked` : `${showPaid ? 'Hide' : 'Show'} the ${booked.length} paid`}
                </button>
              </li>
            )}
            {showPaid && booked.map(row)}
          </ul>
        </>
      )}
    </section>
  )
}

/** How a category's itinerary items read in a chip: "9 restaurants", "fares on 5 days", "2 in the itinerary". */
function itinerarySummary(category: ExpenseCategory, items: MoneyItem[]): string {
  const n = items.length
  if (category === 'transport' && items.every((i) => i.name === 'Fares')) {
    const days = new Set(items.map((i) => i.day)).size
    return `fares on ${days} ${days === 1 ? 'day' : 'days'}`
  }
  const noun = { food: 'restaurant', shopping: 'shop', activities: 'place' }[category as string]
  return noun ? `${n} ${noun}${n === 1 ? '' : 's'}` : `${n} in the itinerary`
}

const dayText = (item: { day?: number }) => (item.day ? `Day ${item.day}` : 'Trip')

/**
 * "Estimates" (3C) before the trip, "Estimated vs spent" (5A) from its first day: one row per category; its name
 * opens the category's sheet, the chevron unfolds a small table of what is in it (or of what was spent).
 */
export function EstimatesCard({ trip, categories, started }: { trip: Trip; categories: CategoryMoney[] | null; started: boolean }) {
  const [open, setOpen] = useState<ExpenseCategory | null>(null)
  const [sheet, setSheet] = useState<ExpenseCategory | 'new' | null>(null)
  const show = useMoney(trip)
  const total = (categories ?? []).reduce((sum, c) => sum + c.estimate, 0)
  const amount = (item: { amount?: { amount: number; currency: string } }) => {
    const value = itemAmount(item, trip)
    return value != null ? show(value) : formatMoney(item.amount)
  }

  return (
    <section className="card estimates-card">
      <div className="money-head">
        <h2 className="trip-money-kicker">
          {/* Thinner than the bold title would make it: thick, the slice merged with the pie. */}
          <Icon name="pie" size={16} weight={1.8} /> {started ? 'Estimated vs spent' : 'Estimates'}
        </h2>
        {!started && categories && <strong className="num">{show(total)}</strong>}
      </div>
      {!categories ? (
        <p className="muted small">Set the rate of each currency (Trip settings) to add up amounts in different currencies.</p>
      ) : (
        <>
          {!started && (
            <p className="muted small">From your itinerary, plus additional estimates. Tap a name to change it, the arrow to see what's in it.</p>
          )}
          <ul className="estimate-cats">
            {categories.map((c) => {
              const over = c.spent > c.estimate
              const unfolded = open === c.category
              return (
                <li key={c.category} className="estimate-cat" style={{ ['--cat' as string]: categoryColor(c.category) }}>
                  <div className="estimate-cat-head">
                    <button type="button" className="estimate-cat-name" onClick={() => setSheet(c.category)}>
                      <Icon name={CATEGORY_ICON[c.category]} size={17} /> {CATEGORY_LABEL[c.category]}
                    </button>
                    <span className="estimate-cat-total num">
                      {started ? (
                        <>
                          <strong>{show(c.spent)}</strong> <span className="muted">of {show(c.estimate)}</span>
                        </>
                      ) : (
                        <strong>{show(c.estimate)}</strong>
                      )}
                      <button
                        type="button"
                        className={`ghost icon-button estimate-chevron${unfolded ? ' open' : ''}`}
                        aria-expanded={unfolded}
                        aria-label={`What's in ${CATEGORY_LABEL[c.category]}`}
                        onClick={() => setOpen(unfolded ? null : c.category)}
                      >
                        <Icon name={unfolded ? 'down' : 'forward'} size={16} />
                      </button>
                    </span>
                  </div>
                  {started ? (
                    <>
                      <span className="estimate-bar" aria-hidden="true">
                        <span className="fill" style={{ width: share(Math.min(c.spent, c.estimate), Math.max(c.spent, c.estimate)) }} />
                        {over && <span className="over" style={{ width: share(c.spent - c.estimate, c.spent) }} />}
                      </span>
                      <div className="estimate-cat-status small">
                        <span className="muted">{c.estimate > 0 ? `${Math.round((c.spent / c.estimate) * 100)}% spent` : 'Not estimated'}</span>
                        {over ? (
                          <span className="money-alert">
                            <Icon name="warning" size={14} /> {show(c.spent - c.estimate)} over
                          </span>
                        ) : (
                          <span className="ok-text">{show(c.estimate - c.spent)} left</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="estimate-bar" aria-hidden="true">
                        <span className="fill" style={{ width: share(c.itinerary, c.estimate) }} />
                        <span className="extra" style={{ width: share(c.extra, c.estimate) }} />
                      </span>
                      <div className="estimate-chips">
                        {c.items.length > 0 && (
                          <span className="estimate-chip">
                            <Icon name="calendar" size={12} /> {itinerarySummary(c.category, c.items)} · {compact(c.itinerary, trip.displayCurrency)}
                          </span>
                        )}
                        {c.additional.map((e) => (
                          <span key={e.id} className="estimate-chip additional">
                            {e.label} · {compact(itemAmount(e, trip) ?? e.amount.amount, trip.displayCurrency)}
                          </span>
                        ))}
                        <button
                          type="button"
                          className="estimate-chip add"
                          aria-label={`Add an estimate to ${CATEGORY_LABEL[c.category]}`}
                          onClick={() => setSheet(c.category)}
                        >
                          <Icon name="plus" size={12} />
                        </button>
                      </div>
                    </>
                  )}
                  {unfolded && (
                    <table className="estimate-table">
                      <thead>
                        <tr>
                          <th>{started ? 'Spent' : CATEGORY_LABEL[c.category]}</th>
                          <th>Day</th>
                          <th className="num">{started ? 'Amount' : 'Estimate'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {started
                          ? c.spentItems.map((item) => (
                              <tr key={item.id}>
                                <td>{item.name}</td>
                                <td className="muted">{dayText(item)}</td>
                                <td className="num">{amount(item)}</td>
                              </tr>
                            ))
                          : [
                              ...c.items.map((item) => (
                                <tr key={item.id}>
                                  <td>{item.name}</td>
                                  <td className="muted">{dayText(item)}</td>
                                  <td className="num">{amount(item)}</td>
                                </tr>
                              )),
                              ...c.additional.map((e) => (
                                <tr key={e.id} className="additional">
                                  <td>
                                    {e.label} <span className="muted small">· additional</span>
                                  </td>
                                  <td className="muted">—</td>
                                  <td className="num">{amount(e)}</td>
                                </tr>
                              )),
                            ]}
                        {started && c.spentItems.length === 0 && (
                          <tr>
                            <td colSpan={3} className="muted">
                              Nothing spent yet: log it on the days.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </li>
              )
            })}
          </ul>
          {categories.length === 0 && <p className="muted small">Prices on the places of your days and their routes add up here.</p>}
          <button type="button" className="link estimate-add" onClick={() => setSheet('new')}>
            <Icon name="plus" size={14} /> Add an estimate
          </button>
        </>
      )}
      {sheet && (
        <EstimateSheet
          trip={trip}
          category={sheet === 'new' ? undefined : sheet}
          categories={categories}
          onClose={() => setSheet(null)}
        />
      )}
    </section>
  )
}

interface ItemDraft {
  id: string
  label: string
  amount: string
  currency: string
}

/**
 * A category's estimate (4A): its total, what comes from the itinerary (read-only: changed on the places
 * themselves) and the additional estimates ("Action figures", "Suica"…; the name is optional) as name · amount ·
 * remove. Nothing is saved until Save. Without a given category ("Add an estimate") it starts with a picker.
 */
function EstimateSheet({
  trip,
  category: fixed,
  categories,
  onClose,
}: {
  trip: Trip
  category?: ExpenseCategory
  categories: CategoryMoney[] | null
  onClose: () => void
}) {
  const all = trip.estimates ?? []
  const newItem = (): ItemDraft => ({ id: crypto.randomUUID(), label: '', amount: '', currency: trip.displayCurrency })
  const draftsOf = (category: ExpenseCategory): ItemDraft[] => {
    const own = all
      .filter((e) => e.category === category)
      .map((e) => ({ id: e.id, label: e.label, amount: String(e.amount.amount), currency: e.amount.currency }))
    return own.length ? own : [newItem()]
  }
  const [category, setCategory] = useState<ExpenseCategory>(
    () => fixed ?? CATEGORIES.find((c) => !categories?.some((m) => m.category === c)) ?? 'other',
  )
  const [items, setItems] = useState(() => draftsOf(category))
  const show = useMoney(trip)
  const currencies = [...new Set([trip.displayCurrency, ...currencyChoices(trip)])]
  const current = categories?.find((c) => c.category === category)
  const fromItinerary = current?.items ?? []

  const typed = items.filter((item) => item.amount.trim() !== '')
  const valid = typed.every((item) => Number.isFinite(Number(item.amount)) && Number(item.amount) >= 0)
  const extra = valid ? sumItems(typed.map((i) => ({ amount: { amount: Number(i.amount), currency: i.currency } })), trip) : null
  const total = extra != null && current ? current.itinerary + extra : extra

  const change = (id: string, patch: Partial<ItemDraft>) => setItems(items.map((item) => (item.id === id ? { ...item, ...patch } : item)))

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    const kept: Estimate[] = typed.map((item) => ({
      id: item.id,
      label: item.label.trim() || CATEGORY_LABEL[category],
      category,
      amount: { amount: Number(item.amount), currency: item.currency },
    }))
    void updateTrip(trip.id, { estimates: [...all.filter((x) => x.category !== category), ...kept] }).then(onClose)
  }

  return (
    <Sheet title={fixed ? CATEGORY_LABEL[fixed] : 'New estimate'} onClose={onClose}>
      <form className="estimate-sheet" onSubmit={submit}>
        {!fixed && (
          <div className="category-field">
            <label className="field-label" htmlFor="estimate-category">
              Category
            </label>
            <CategorySelect
              id="estimate-category"
              value={category}
              onChange={(next) => {
                setCategory(next)
                setItems(draftsOf(next))
              }}
            />
          </div>
        )}
        <div>
          <p className="estimate-sheet-total">{total != null ? show(total) : '—'}</p>
          <p className="muted small">estimated for the trip</p>
        </div>
        <div className="estimate-sheet-cols">
          <div>
            <p className="estimate-items-title">From the itinerary · {current ? show(current.itinerary) : show(0)}</p>
            {fromItinerary.length ? (
              <>
                <ul className="money-items">
                  {fromItinerary.map((item) => (
                    <li key={item.id}>
                      <span className="money-item-name">
                        <span>{item.name}</span>
                        <span className="muted small">{dayText(item)}</span>
                      </span>
                      <span className="num muted">{formatMoney(item.amount)}</span>
                    </li>
                  ))}
                </ul>
                <p className="muted small">Change these on the places themselves.</p>
              </>
            ) : (
              <p className="muted small">Nothing of it in the itinerary yet.</p>
            )}
          </div>
          <div className="estimate-additional">
            <p className="estimate-items-title">Additional estimates{extra != null ? ` · ${show(extra)}` : ''}</p>
            {items.map((item) => (
              <div key={item.id} className="estimate-item">
                <input
                  aria-label="What"
                  placeholder="What"
                  value={item.label}
                  onChange={(e) => change(item.id, { label: e.target.value })}
                />
                <span className="estimate-amount">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    aria-label="Amount"
                    placeholder="0"
                    value={item.amount}
                    onChange={(e) => change(item.id, { amount: e.target.value })}
                  />
                  {currencies.length > 1 ? (
                    <button
                      type="button"
                      className="estimate-currency"
                      title="Change the currency"
                      onClick={() => change(item.id, { currency: currencies[(currencies.indexOf(item.currency) + 1) % currencies.length] })}
                    >
                      {item.currency}
                    </button>
                  ) : (
                    <span className="estimate-currency">{item.currency}</span>
                  )}
                </span>
                <button type="button" className="ghost icon-button" aria-label="Remove" onClick={() => setItems(items.filter((x) => x.id !== item.id))}>
                  <Icon name="trash" size={18} />
                </button>
              </div>
            ))}
            <button type="button" className="link estimate-add" onClick={() => setItems([...items, newItem()])}>
              <Icon name="plus" size={14} /> Add
            </button>
          </div>
        </div>
        <div className="row sheet-actions">
          <button type="submit" className="primary" disabled={!valid}>
            Save
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  )
}

/**
 * The trip-wide costs (hotels, transport between cities, others), as a row like the cards around it (a bare link
 * looked lost on the PC); a tap opens them in a sheet to add or edit.
 */
export function TripCostsLink({ trip, expenses }: { trip: Trip; expenses: Expense[] }) {
  const [open, setOpen] = useState(false)
  const n = expenses.length
  return (
    <>
      <button type="button" className="card trip-costs-link" onClick={() => setOpen(true)}>
        <Icon name="home" size={18} />
        <span className="trip-costs-text">
          <strong>Hotels, transport &amp; other trip costs</strong>
          <span className="muted small">{n ? `${n} ${n === 1 ? 'cost' : 'costs'} · add or edit` : 'Add hotels, flights and other costs'}</span>
        </span>
        <Icon name="forward" size={16} />
      </button>
      {open && (
        <Sheet title="Hotels, transport & other trip costs" onClose={() => setOpen(false)}>
          <div className="trip-costs-sheet">
            <p className="muted small">
              Costs not tied to one day. Hotels and flights (and transport marked "Booking needed") are booked before the trip; the
              rest counts as an estimate.
            </p>
            <ExpenseList trip={trip} expenses={expenses} />
          </div>
        </Sheet>
      )}
    </>
  )
}
