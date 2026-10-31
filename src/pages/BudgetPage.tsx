import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { categoryMoney, travelersOf, tripMoney, tripStarted } from '../budget'
import { TripLayout } from '../components/TripLayout'
import { BookAheadCard, EstimatesCard, TripCostsLink, TripMoneyCard } from '../components/TripMoney'
import { db } from '../db/db'
import { legKey } from '../db/legs'
import { dayRides, icCardFares, otherCompanies, passCoverage } from '../planning/railPasses'
import { RailPassesCard } from '../components/RailPasses'
import { NotFound } from './TripPage'

/**
 * Everything about money (User's model, 2026-10-27): what was set aside and what goes out of it; what needs
 * booking before the trip; everything else as estimates (the itinerary + additional estimates), compared with
 * what is really spent once the trip has started. Phones: one column; wide screens: the money on the left
 * (sticky), the estimates on the right.
 */
export function BudgetPage({ tripId }: { tripId: string }) {
  const trip = useLiveQuery(async () => (await db.trips.get(tripId)) ?? null, [tripId])
  const days = useLiveQuery(() => db.days.where('tripId').equals(tripId).toArray(), [tripId])
  const places = useLiveQuery(() => db.places.where('tripId').equals(tripId).toArray(), [tripId])
  const legs = useLiveQuery(() => db.legs.where('tripId').equals(tripId).toArray(), [tripId])
  const expenses = useLiveQuery(() => db.expenses.where('tripId').equals(tripId).toArray(), [tripId])

  const money = useMemo(() => {
    if (!trip || !days || !places || !legs || !expenses) return null
    const all = tripMoney(days, places, legs, expenses, travelersOf(trip), trip.railPasses)
    // Rail passes: each one against the fares of the days' rides.
    const rides = dayRides(days, places, new Map(legs.map((l) => [legKey(l.fromPlaceId, l.toPlaceId), l])))
    const coverage = passCoverage(trip.railPasses, rides)
    return {
      all,
      categories: categoryMoney(all, trip),
      passes: coverage.reports,
      companies: otherCompanies(rides),
      icCard: icCardFares(rides, coverage.covered),
    }
  }, [trip, days, places, legs, expenses])

  if (trip === undefined) return null
  if (!trip) return <NotFound />
  if (!money || !expenses) return null

  const started = tripStarted(trip)
  const estimates = <EstimatesCard trip={trip} categories={money.categories} started={started} />
  const bookAhead = <BookAheadCard trip={trip} items={money.all.bookAhead} />

  return (
    <TripLayout trip={trip} active="budget">
      {/* Phones: no title (the bottom bar says where you are), like Options. */}
      <header className="hero budget-hero">
        <p className="hero-kicker trip-kicker">{trip.name}</p>
        <h1>Budget</h1>
      </header>
      <div className={`budget-grid${started ? ' started' : ''}`}>
        <div className="section budget-money">
          <TripMoneyCard trip={trip} money={money.all} categories={money.categories} started={started} />
          {bookAhead}
          {/* Only for trips to Japan (User). */}
          {trip.countries?.includes('JP') && days && <RailPassesCard trip={trip} days={days} reports={money.passes} companies={money.companies} icCard={money.icCard} />}
          <TripCostsLink trip={trip} expenses={expenses.filter((e) => !e.dayId)} />
        </div>
        <div className="section budget-estimates">{estimates}</div>
      </div>
    </TripLayout>
  )
}
