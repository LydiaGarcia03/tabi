import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { dayBudget, expensesBudget, mergeBudgets } from '../budget'
import { BudgetBreakdown, MoneyTotals } from '../components/BudgetView'
import { ExpenseList } from '../components/ExpenseList'
import { formatDay } from '../dates'
import { db } from '../db/db'
import { legKey } from '../db/legs'
import type { Trip } from '../db/model'
import { deleteTrip, updateTrip } from '../db/trips'
import { href, navigate } from '../router'
import { useDraft } from '../useDraft'

export function TripPage({ tripId }: { tripId: string }) {
  // `null` = not found; `undefined` = still loading.
  const trip = useLiveQuery(async () => (await db.trips.get(tripId)) ?? null, [tripId])
  const days = useLiveQuery(() => db.days.where('tripId').equals(tripId).sortBy('date'), [tripId])
  const places = useLiveQuery(() => db.places.where('tripId').equals(tripId).toArray(), [tripId])
  const legs = useLiveQuery(() => db.legs.where('tripId').equals(tripId).toArray(), [tripId])
  const expenses = useLiveQuery(() => db.expenses.where('tripId').equals(tripId).toArray(), [tripId])

  const budgets = useMemo(() => {
    if (!days || !places || !legs || !expenses) return null
    const legMap = new Map(legs.map((l) => [legKey(l.fromPlaceId, l.toPlaceId), l]))
    const byDay = new Map(
      days.map((day) => [
        day.id,
        dayBudget(
          day,
          places.filter((p) => p.dayId === day.id),
          legMap,
          expenses.filter((e) => e.dayId === day.id),
        ),
      ]),
    )
    const tripWide = expenses.filter((e) => !e.dayId)
    return { byDay, tripWide, total: mergeBudgets([...byDay.values(), expensesBudget(tripWide)]) }
  }, [days, places, legs, expenses])

  if (trip === undefined || days === undefined || !budgets) return null
  if (!trip) return <NotFound />

  return (
    <>
      <p>
        <a href={href({ page: 'trips' })}>← All trips</a>
      </p>
      <TripDetails key={trip.id} trip={trip} />
      <section className="card">
        <h2>Days</h2>
        <ul className="link-list">
          {days.map((day, i) => {
            const outside = day.date < trip.startDate || day.date > trip.endDate
            return (
              <li key={day.id}>
                <a href={href({ page: 'day', tripId, dayId: day.id })}>
                  <strong>
                    Day {i + 1} · {formatDay(day.date)}
                  </strong>
                  <span className="muted small">
                    {day.title || 'No title'} · {day.placeIds.length} place(s)
                    {outside && ' · outside trip dates'}
                  </span>
                  {Object.keys(budgets.byDay.get(day.id)?.total ?? {}).length > 0 && (
                    <span className="small">
                      <MoneyTotals totals={budgets.byDay.get(day.id)!.total} trip={trip} />
                    </span>
                  )}
                </a>
              </li>
            )
          })}
        </ul>
      </section>
      <section className="card">
        <h2>Budget</h2>
        <CurrencySettings key={trip.id} trip={trip} />
        <BudgetBreakdown budget={budgets.total} trip={trip} title="Trip total" />
        <h3>Trip-wide expenses</h3>
        <p className="muted small">Costs not tied to one day: hotel, rail pass, insurance…</p>
        <ExpenseList trip={trip} expenses={budgets.tripWide} />
      </section>
      <DeleteTrip trip={trip} />
    </>
  )
}

function CurrencySettings({ trip }: { trip: Trip }) {
  const [rate, setRate] = useDraft(trip.exchangeRate > 0 ? String(trip.exchangeRate) : '', (value) => {
    const number = Number(value.replace(',', '.'))
    if (Number.isFinite(number) && number >= 0) void updateTrip(trip.id, { exchangeRate: number })
  })
  const [base, setBase] = useDraft(trip.baseCurrency, (value) => saveCurrency(trip.id, 'baseCurrency', value))
  const [display, setDisplay] = useDraft(trip.displayCurrency, (value) => saveCurrency(trip.id, 'displayCurrency', value))

  return (
    <div className="row wrap currency-settings">
      <label>
        Trip currency
        <input value={base} maxLength={3} onChange={(e) => setBase(e.target.value.toUpperCase())} />
      </label>
      <label>
        Show totals in
        <input value={display} maxLength={3} onChange={(e) => setDisplay(e.target.value.toUpperCase())} />
      </label>
      <label>
        1 {trip.baseCurrency} = ? {trip.displayCurrency}
        <input
          inputMode="decimal"
          placeholder="e.g. 0.037"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
        />
      </label>
    </div>
  )
}

/** Saves a currency code once it looks valid (three letters, e.g. "JPY"). */
function saveCurrency(tripId: string, field: 'baseCurrency' | 'displayCurrency', value: string) {
  const code = value.trim().toUpperCase()
  if (/^[A-Z]{3}$/.test(code)) void updateTrip(tripId, { [field]: code })
}

function TripDetails({ trip }: { trip: Trip }) {
  const [name, setName] = useDraft(trip.name, (value) => updateTrip(trip.id, { name: value.trim() || trip.name }))

  return (
    <section className="card">
      <label>
        Trip name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="row wrap">
        <label>
          Start
          <input
            type="date"
            value={trip.startDate}
            max={trip.endDate}
            onChange={(e) => e.target.value && updateTrip(trip.id, { startDate: e.target.value })}
          />
        </label>
        <label>
          End
          <input
            type="date"
            value={trip.endDate}
            min={trip.startDate}
            onChange={(e) => e.target.value && updateTrip(trip.id, { endDate: e.target.value })}
          />
        </label>
      </div>
      <p className="muted small">Changing dates adds the new days. Days outside the dates are removed only if empty.</p>
    </section>
  )
}

function DeleteTrip({ trip }: { trip: Trip }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <section className="card">
      {confirming ? (
        <>
          <p>Delete “{trip.name}” with all its days, places, routes and expenses? This cannot be undone.</p>
          <div className="row">
            <button
              type="button"
              className="danger"
              onClick={async () => {
                await deleteTrip(trip.id)
                navigate({ page: 'trips' })
              }}
            >
              Delete trip
            </button>
            <button type="button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <button type="button" onClick={() => setConfirming(true)}>
          Delete trip…
        </button>
      )}
    </section>
  )
}

export function NotFound() {
  return (
    <section className="card">
      <p>Not found. It may have been deleted.</p>
      <a href={href({ page: 'trips' })}>← All trips</a>
    </section>
  )
}
