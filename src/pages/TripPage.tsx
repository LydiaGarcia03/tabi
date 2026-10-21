import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { dayBudget, expensesBudget, mergeBudgets } from '../budget'
import { MoneyTotals } from '../components/BudgetView'
import { Checklist } from '../components/Checklist'
import { DayCard } from '../components/DayCard'
import { ExportCard } from '../components/ExportCard'
import { Icon } from '../components/Icon'
import { StaysEditor } from '../components/StaysEditor'
import { TripLayout } from '../components/TripLayout'
import { formatDate } from '../dates'
import { db } from '../db/db'
import { legKey } from '../db/legs'
import type { Trip } from '../db/model'
import { cityLabel } from '../db/stays'
import { deleteTrip, orderPlaces, updateTrip } from '../db/trips'
import { useRefreshStalePlaces } from '../places/refresh'
import { journeysOn } from '../planning/journeys'
import { href, navigate } from '../router'
import { useDraft } from '../useDraft'

export function TripPage({ tripId }: { tripId: string }) {
  // `null` = not found; `undefined` = still loading.
  const trip = useLiveQuery(async () => (await db.trips.get(tripId)) ?? null, [tripId])
  const days = useLiveQuery(() => db.days.where('tripId').equals(tripId).sortBy('date'), [tripId])
  const places = useLiveQuery(() => db.places.where('tripId').equals(tripId).toArray(), [tripId])
  const legs = useLiveQuery(() => db.legs.where('tripId').equals(tripId).toArray(), [tripId])
  const expenses = useLiveQuery(() => db.expenses.where('tripId').equals(tripId).toArray(), [tripId])
  const stays = useLiveQuery(() => db.stays.where('tripId').equals(tripId).toArray(), [tripId])
  useRefreshStalePlaces(places)

  const overview = useMemo(() => {
    if (!days || !places || !legs || !expenses) return null
    const legMap = new Map(legs.map((l) => [legKey(l.fromPlaceId, l.toPlaceId), l]))
    const byDay = new Map(
      days.map((day) => {
        const dayPlaces = places.filter((p) => p.dayId === day.id)
        const ordered = orderPlaces(day, dayPlaces)
        const travelMinutes = ordered
          .slice(1)
          .flatMap((p, i) => legMap.get(legKey(ordered[i].id, p.id))?.segments ?? [])
          .reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0)
        const budget = dayBudget(day, dayPlaces, legMap, expenses.filter((e) => e.dayId === day.id))
        return [day.id, { places: ordered, travelMinutes, budget }]
      }),
    )
    const tripWide = expenses.filter((e) => !e.dayId)
    const total = mergeBudgets([...[...byDay.values()].map((d) => d.budget), expensesBudget(tripWide)])
    return { byDay, total }
  }, [days, places, legs, expenses])

  if (trip === undefined || days === undefined || !overview || !stays) return null
  if (!trip) return <NotFound />

  return (
    <TripLayout trip={trip} active="itinerary">
      <TripHeader key={trip.id} trip={trip} dayCount={days.length} />

      <div className="overview-grid">
        <section className="section">
          <h2 className="section-title">Itinerary</h2>
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
                    budget={info.budget}
                  />
                </li>
              )
            })}
          </ol>
        </section>

        <div className="overview-side">
          <StaysEditor trip={trip} stays={stays} expenses={expenses?.filter((e) => !e.dayId) ?? []} />

          <a className="card budget-link" href={href({ page: 'budget', tripId: trip.id })}>
            <span className="row between">
              <strong>Trip budget</strong>
              <Icon name="forward" size={16} />
            </span>
            <MoneyTotals totals={overview.total.total} trip={trip} />
            <span className="muted small">Transport, hotels, estimates vs. booked</span>
          </a>

          <Checklist trip={trip} />
          <TripNotes key={trip.id} trip={trip} />
          <ExportCard tripId={trip.id} />

          <details className="card disclosure">
            <summary>Trip settings</summary>
            <TripSettings key={trip.id} trip={trip} />
            <DeleteTrip trip={trip} />
          </details>
        </div>
      </div>
    </TripLayout>
  )
}

function TripHeader({ trip, dayCount }: { trip: Trip; dayCount: number }) {
  const [name, setName] = useDraft(trip.name, (value) => updateTrip(trip.id, { name: value.trim() || trip.name }))
  return (
    <header className="hero">
      <input className="hero-title" value={name} onChange={(e) => setName(e.target.value)} aria-label="Trip name" />
      <p className="hero-meta">
        <Icon name="calendar" size={16} /> {formatDate(trip.startDate)} – {formatDate(trip.endDate)} · {dayCount}{' '}
        {dayCount === 1 ? 'day' : 'days'}
      </p>
    </header>
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
  const [rate, setRate] = useDraft(trip.exchangeRate > 0 ? String(trip.exchangeRate) : '', (value) => {
    const number = Number(value.replace(',', '.'))
    if (Number.isFinite(number) && number >= 0) void updateTrip(trip.id, { exchangeRate: number })
  })
  const [base, setBase] = useDraft(trip.baseCurrency, (value) => saveCurrency(trip.id, 'baseCurrency', value))
  const [display, setDisplay] = useDraft(trip.displayCurrency, (value) => saveCurrency(trip.id, 'displayCurrency', value))

  return (
    <div className="settings-grid">
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
      <div className="field-row">
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
          <input inputMode="decimal" placeholder="e.g. 0.037" value={rate} onChange={(e) => setRate(e.target.value)} />
        </label>
      </div>
    </div>
  )
}

/** Saves a currency code once it looks valid (three letters, e.g. "JPY"). */
function saveCurrency(tripId: string, field: 'baseCurrency' | 'displayCurrency', value: string) {
  const code = value.trim().toUpperCase()
  if (/^[A-Z]{3}$/.test(code)) void updateTrip(tripId, { [field]: code })
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
