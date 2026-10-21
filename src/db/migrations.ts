// Conversions of data saved by older versions, shared by the database
// upgrade and by the backup import (old backup files).

import type { Expense, Journey, TripOption } from './model'

/** Before journeys, only flights existed: { from, to, date, time, flightNumber }. */
interface LegacyFlight {
  from: string
  to: string
  date?: string
  time?: string
  flightNumber?: string
}

type LegacyExpense = Expense & { flight?: LegacyFlight }
type LegacyOption = Omit<TripOption, 'kind'> & { kind: TripOption['kind'] | 'flight'; flight?: LegacyFlight }

function flightToJourney(flight: LegacyFlight, carrier?: string): Journey {
  return {
    mode: 'flight',
    from: flight.from,
    to: flight.to,
    date: flight.date,
    time: flight.time,
    number: flight.flightNumber,
    carrier,
  }
}

/** Expense with a `flight` → expense with a `journey`. Changes the object in place. */
export function upgradeExpense(expense: LegacyExpense): Expense {
  if (expense.flight) {
    expense.journey = flightToJourney(expense.flight)
    delete expense.flight
  }
  return expense
}

/** "flight" options become "transport" options (the airline was kept in `category`). */
export function upgradeOption(option: LegacyOption): TripOption {
  if (option.kind === 'flight') {
    option.kind = 'transport'
    option.journey = flightToJourney(option.flight ?? { from: '', to: '' }, option.category)
    delete option.category
    delete option.flight
  }
  return option as TripOption
}
