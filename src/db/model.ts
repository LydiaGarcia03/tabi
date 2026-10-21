// Trip data stored on the device (IndexedDB). Dates are local calendar dates
// as "YYYY-MM-DD" strings; timestamps are ISO 8601.

import type { Money, RouteOption, RouteSegment } from '../routing/types'

export interface Trip {
  id: string
  name: string
  startDate: string
  endDate: string
  /** Currency prices are entered in (e.g. JPY). */
  baseCurrency: string
  /** Currency totals are also shown in (e.g. BRL). */
  displayCurrency: string
  /** 1 baseCurrency = exchangeRate displayCurrency. Entered manually. */
  exchangeRate: number
  createdAt: string
  updatedAt: string
}

export interface Day {
  id: string
  tripId: string
  date: string
  title: string
  /** Place ids in visiting order. */
  placeIds: string[]
}

export interface Place {
  id: string
  tripId: string
  dayId: string
  name: string
  lat: number
  lng: number
  /** Google place_id, when the place came from Google (may be stored indefinitely). */
  googlePlaceId?: string
  address?: string
  /** When the Google-provided details (address, coordinates) were last fetched. */
  googleFetchedAt?: string
  /** Free text (markdown): history, tickets, opening hours, tips. */
  notes: string
  /** "HH:mm", local time at the destination. */
  plannedTime?: string
  /** Entry fee, ticket… (counted as "activities" in the budget). */
  cost?: Money
  /** Opening hours, entered by the user. Absent = unknown (treated as always open). */
  openingHours?: OpeningHours
  /** How long the visit takes, in minutes. */
  visitMinutes?: number
}

/** "HH:mm" local times. A close at or before the open time ends after midnight ("00:00" = midnight). */
export interface TimeRange {
  open: string
  close: string
}

export interface OpeningHours {
  /** Index 0 = Sunday … 6 = Saturday; null = closed that day. */
  days: (TimeRange | null)[]
  /** Entered day by day (otherwise the same hours every open day). */
  perDay?: boolean
  /** Free text, e.g. "last entry 16:30", "closed on holidays". */
  note?: string
}

export type ExpenseCategory = 'lodging' | 'transport' | 'food' | 'activities' | 'shopping' | 'other'

/** A cost not tied to a place or segment: hotel, rail pass, meals, souvenirs… */
export interface Expense {
  id: string
  tripId: string
  /** Day it belongs to; absent for trip-wide costs (hotel, insurance, passes). */
  dayId?: string
  category: ExpenseCategory
  description: string
  amount: Money
  notes?: string
}

/** One step of a leg, e.g. "walk 400 m" or "Ginza Line from Kanda to Asakusa". */
export interface Segment extends RouteSegment {
  id: string
  notes?: string
}

/**
 * How to get from one place to the next. Stored per (from, to) pair, so a
 * leg survives reordering: if the two places become consecutive again, it
 * shows up again.
 */
export interface Leg {
  id: string
  tripId: string
  fromPlaceId: string
  toPlaceId: string
  segments: Segment[]
  /** Where the current segments came from. */
  source: 'manual' | 'google' | 'navitime'
  fetchedAt?: string
  /** Last route suggestions, kept so choosing another one costs no request. */
  alternatives?: RouteOption[]
  /** Date the suggestions were computed for (may differ from the trip day). */
  alternativesDate?: string
}
