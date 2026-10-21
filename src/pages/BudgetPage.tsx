import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { dayBudget, expensesBudget, mergeBudgets } from '../budget'
import { BudgetBreakdown } from '../components/BudgetView'
import { EstimatesCard } from '../components/EstimatesCard'
import { ExpenseList } from '../components/ExpenseList'
import { TripLayout } from '../components/TripLayout'
import { db } from '../db/db'
import { legKey } from '../db/legs'
import { NotFound } from './TripPage'

/** Everything about money: totals, estimates vs. booked, flights, hotels and other trip-wide costs. */
export function BudgetPage({ tripId }: { tripId: string }) {
  const trip = useLiveQuery(async () => (await db.trips.get(tripId)) ?? null, [tripId])
  const days = useLiveQuery(() => db.days.where('tripId').equals(tripId).toArray(), [tripId])
  const places = useLiveQuery(() => db.places.where('tripId').equals(tripId).toArray(), [tripId])
  const legs = useLiveQuery(() => db.legs.where('tripId').equals(tripId).toArray(), [tripId])
  const expenses = useLiveQuery(() => db.expenses.where('tripId').equals(tripId).toArray(), [tripId])

  const budget = useMemo(() => {
    if (!days || !places || !legs || !expenses) return null
    const legMap = new Map(legs.map((l) => [legKey(l.fromPlaceId, l.toPlaceId), l]))
    const perDay = days.map((day) =>
      dayBudget(
        day,
        places.filter((p) => p.dayId === day.id),
        legMap,
        expenses.filter((e) => e.dayId === day.id),
      ),
    )
    return mergeBudgets([...perDay, expensesBudget(expenses.filter((e) => !e.dayId))])
  }, [days, places, legs, expenses])

  if (trip === undefined || !budget || !expenses) return null
  if (!trip) return <NotFound />

  return (
    <TripLayout trip={trip} active="budget">
      <header className="hero">
        <p className="hero-kicker">{trip.name}</p>
        <h1>Budget</h1>
      </header>
      <div className="budget-grid">
        <div className="section">
          <section className="card">
            <BudgetBreakdown budget={budget} trip={trip} title="Trip budget" />
          </section>
          <section className="card">
            <h2>Flights, hotels &amp; trip-wide costs</h2>
            <p className="muted small">Costs not tied to one day. Day costs (tickets, fares, meals) are on each day.</p>
            <ExpenseList trip={trip} expenses={expenses.filter((e) => !e.dayId)} />
          </section>
        </div>
        <EstimatesCard trip={trip} actual={budget} />
      </div>
    </TripLayout>
  )
}
