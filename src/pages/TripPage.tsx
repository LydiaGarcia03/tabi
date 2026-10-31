import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { dayMoney, expensesBudget, itemsBudget, travelersOf, tripStarted } from '../budget'
import { MoneyTotals } from '../components/BudgetView'
import { Checklist, type PlaceToBook } from '../components/Checklist'
import { CountriesMoney } from '../components/CountriesMoney'
import { DayCard } from '../components/DayCard'
import { ExportCard } from '../components/ExportCard'
import { Icon, type IconName } from '../components/Icon'
import { StaysEditor } from '../components/StaysEditor'
import { TripLayout } from '../components/TripLayout'
import { formatDate } from '../dates'
import { dayRoute } from '../db/baseStops'
import { db } from '../db/db'
import { dayWalking, legKey } from '../db/legs'
import type { Trip } from '../db/model'
import { cityLabel } from '../db/stays'
import { deleteTrip, orderPlaces, updateTrip } from '../db/trips'
import { useRefreshStalePlaces } from '../places/refresh'
import { expenseNeedsBooking, journeysOn } from '../planning/journeys'
import { href, navigate } from '../router'
import { useDraft } from '../useDraft'
import { useOnline } from '../useOnline'
import { DaysTitle } from '../components/DaysTitle'
import { useTripHolidays } from '../holidays/holidays'
type OverviewView = 'days' | 'cities' | 'checklist' | 'more'

/** Phones: the itinerary page's tabs (User's choice A from a mock, 2026-10-27). */
const VIEWS: { id: OverviewView; label: string; icon: IconName }[] = [
  { id: 'days', label: 'Days', icon: 'calendar' },
  { id: 'cities', label: 'Cities', icon: 'pin' },
  { id: 'checklist', label: 'Checklist', icon: 'check' },
  { id: 'more', label: 'More', icon: 'more' },
]

export function TripPage({ tripId }: { tripId: string }) {
  const [view, setView] = useState<OverviewView>('days')
  // `null` = not found; `undefined` = still loading.
  const trip = useLiveQuery(async () => (await db.trips.get(tripId)) ?? null, [tripId])
  const days = useLiveQuery(() => db.days.where('tripId').equals(tripId).sortBy('date'), [tripId])
  const places = useLiveQuery(() => db.places.where('tripId').equals(tripId).toArray(), [tripId])
  const legs = useLiveQuery(() => db.legs.where('tripId').equals(tripId).toArray(), [tripId])
  const expenses = useLiveQuery(() => db.expenses.where('tripId').equals(tripId).toArray(), [tripId])
  const stays = useLiveQuery(() => db.stays.where('tripId').equals(tripId).toArray(), [tripId])
  const options = useLiveQuery(() => db.options.where('tripId').equals(tripId).toArray(), [tripId])
  useRefreshStalePlaces(places)
  const online = useOnline()
  // TripLayout computes them too, for its sidebar (the country files are fetched once, shared).
  const holidays = useTripHolidays(trip, days, places, stays, online)
  const travelers = trip ? travelersOf(trip) : 1

  const overview = useMemo(() => {
    if (!days || !places || !legs || !expenses) return null
    const legMap = new Map(legs.map((l) => [legKey(l.fromPlaceId, l.toPlaceId), l]))
    const byDay = new Map(
      days.map((day) => {
        const dayPlaces = places.filter((p) => p.dayId === day.id)
        const ordered = orderPlaces(day, dayPlaces)
        const route = dayRoute(day, ordered)
        const travelMinutes = route
          .slice(1)
          .flatMap((p, i) => legMap.get(legKey(route[i].id, p.id))?.segments ?? [])
          .reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0)
        const money = dayMoney(day, 0, dayPlaces, legMap, travelers)
        const estimate = itemsBudget(money.itinerary)
        const spent = expensesBudget(expenses.filter((e) => e.dayId === day.id))
        return [day.id, { places: ordered, travelMinutes, walking: dayWalking(route, legMap), estimate, spent, money }]
      }),
    )
    // Needed for the trip: what is booked ahead + the itinerary's estimates + the additional estimates.
    const total = itemsBudget([
      ...[...byDay.values()].flatMap((d) => [...d.money.bookAhead, ...d.money.itinerary]),
      ...expenses.filter((e) => !e.dayId),
      ...(trip?.estimates ?? []),
    ])
    // Phones: the Checklist tab shows how many things are still to book.
    const toBookCount =
      [...byDay.values()].flatMap((d) => d.money.bookAhead).filter((i) => !i.booked).length +
      expenses.filter((e) => !e.dayId && expenseNeedsBooking(e) && !e.booked).length
    return { byDay, total, toBookCount }
  }, [days, places, legs, expenses, travelers, trip?.estimates])

  if (trip === undefined || days === undefined || !overview || !stays) return null
  if (!trip) return <NotFound />
  const { toBookCount } = overview

  return (
    <TripLayout trip={trip} active="itinerary">
      <TripHeader key={trip.id} trip={trip} dayCount={days.length} />

      {/* Phones only: the days and the rest of the plan as a segmented control (User's choice B1 from a mock: unlike the
          bottom bar, which changes page); no title, the top bar has the trip's name and dates. */}
      <div className="overview-tabs overview-switch" role="tablist" aria-label="View">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" role="tab" aria-selected={view === v.id} className={view === v.id ? 'active' : ''} onClick={() => setView(v.id)}>
            <Icon name={v.icon} size={15} weight={v.icon === 'more' ? 3.4 : undefined} />
            <span className="overview-tab-label">
              {v.label}
              {v.id === 'checklist' && toBookCount > 0 && (
                <span className="overview-tab-count" aria-label={`${toBookCount} to book`}>
                  {toBookCount}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      <div className={`overview-grid show-${view}`}>
        <section className="section overview-days">
          <DaysTitle holidays={holidays} />
          <ol className="day-cards">
            {days.map((day, i) => {
              const info = overview.byDay.get(day.id)!
              return (
                <li key={day.id}>
                  <DayCard
                    trip={trip}
                    day={day}
                    number={i + 1}
                    city={cityLabel(stays, day.date)}
                    journeys={journeysOn(expenses ?? [], day.date).map((e) => e.journey!)}
                    places={info.places}
                    travelMinutes={info.travelMinutes}
                    walking={info.walking}
                    estimate={info.estimate}
                    spent={tripStarted(trip) ? info.spent : undefined}
                    holiday={holidays?.byDay.has(day.id)}
                  />
                </li>
              )
            })}
          </ol>
        </section>

        <div className="overview-side">
          <div className="overview-part" data-tab="cities">
          <StaysEditor
            trip={trip}
            stays={stays}
            expenses={expenses?.filter((e) => !e.dayId) ?? []}
            options={options ?? []}
            days={days ?? []}
            legs={legs ?? []}
          />
          </div>

          {/* Not on phones: there the bottom bar has Budget. */}
          <a className="card budget-link" href={href({ page: 'budget', tripId: trip.id })}>
            <span className="row between">
              <strong>Trip budget</strong>
              <Icon name="forward" size={16} />
            </span>
            <MoneyTotals totals={overview.total.total} trip={trip} />
            <span className="muted small">Needed for the trip: booked ahead + estimated</span>
          </a>

          <div className="overview-part" data-tab="checklist">
          <Checklist
            trip={trip}
            toBook={days.flatMap((day) =>
              overview.byDay
                .get(day.id)!
                .places.filter((place): place is PlaceToBook['place'] => place.bookAhead != null)
                .map((place) => ({ place, day })),
            )}
            expenses={expenses?.filter((e) => !e.dayId) ?? []}
          />
          </div>
          <div className="overview-part" data-tab="more">
          <TripNotes key={trip.id} trip={trip} />
          <ExportCard tripId={trip.id} />

          <details className="card disclosure">
            <summary>Trip settings</summary>
            <TripSettings key={trip.id} trip={trip} />
            <DeleteTrip trip={trip} />
          </details>
          </div>
        </div>
      </div>
    </TripLayout>
  )
}

function TripHeader({ trip, dayCount }: { trip: Trip; dayCount: number }) {
  const [name, setName] = useDraft(trip.name, (value) => updateTrip(trip.id, { name: value.trim() || trip.name }))
  return (
    <header className="hero trip-hero">
      <input className="hero-title" value={name} onChange={(e) => setName(e.target.value)} aria-label="Trip name" />
      <p className="hero-meta">
        <Icon name="calendar" size={16} /> {formatDate(trip.startDate)} – {formatDate(trip.endDate)} · {dayCount}{' '}
        {dayCount === 1 ? 'day' : 'days'}
      </p>
    </header>
  )
}

function TripName({ trip }: { trip: Trip }) {
  const [name, setName] = useDraft(trip.name, (value) => updateTrip(trip.id, { name: value.trim() || trip.name }))
  return (
    <label>
      Name
      <input value={name} onChange={(e) => setName(e.target.value)} />
    </label>
  )
}

function TripNotes({ trip }: { trip: Trip }) {
  const [notes, setNotes] = useDraft(trip.notes ?? '', (value) => updateTrip(trip.id, { notes: value || undefined }))
  return (
    <section className="card">
      <h2>Notes</h2>
      <textarea
        rows={5}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Tips, flight time simulations, best area to stay…"
        aria-label="Trip notes"
      />
    </section>
  )
}

function TripSettings({ trip }: { trip: Trip }) {
  const [travelers, setTravelers] = useDraft(trip.travelers != null ? String(trip.travelers) : '', (value) => {
    const number = Number(value)
    if (value.trim() === '') void updateTrip(trip.id, { travelers: undefined })
    else if (Number.isInteger(number) && number >= 1) void updateTrip(trip.id, { travelers: number })
  })

  return (
    <div className="settings-grid">
      {/* Phones show no title to edit, so the name is here too. */}
      <TripName trip={trip} />
      <div className="field-row">
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
      <label>
        Travelers
        <input
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          placeholder="1"
          value={travelers}
          onChange={(e) => setTravelers(e.target.value)}
        />
      </label>
      <p className="muted small">
        Tickets, meals and fares are per person: the budget counts them for everyone, unless a place says fewer people go.
      </p>
      <CountriesMoney trip={trip} />
    </div>
  )
}

function DeleteTrip({ trip }: { trip: Trip }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="danger-zone">
      {confirming ? (
        <>
          <p>Delete “{trip.name}” with all its days, places, routes, options and expenses? This cannot be undone.</p>
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
        <button type="button" className="danger-outline" onClick={() => setConfirming(true)}>
          Delete trip…
        </button>
      )}
    </div>
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
