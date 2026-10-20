// Trip data stored on the device (IndexedDB). Dates are local calendar dates
// as "YYYY-MM-DD" strings; timestamps are ISO 8601.

import type { RouteOption, RouteSegment } from '../routing/types'

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
