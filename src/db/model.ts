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
  /** Free notes for the whole trip (tips, flight time simulations…). */
  notes?: string
  /** Rough budget guesses, compared with what is already booked/spent. */
  estimates?: Estimate[]
  /** Reminders and shopping list. */
  checklist?: ChecklistItem[]
}

export interface Estimate {
  id: string
  label: string
  category: ExpenseCategory
  amount: Money
}

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
  /** "YYYY-MM-DD", optional. */
  due?: string
}

/**
 * Days spent in one city (inclusive), e.g. Osaka 30 Mar – 1 Apr. A day in
 * two stays is a travel day ("Osaka → Okinawa").
 */
export interface Stay {
  id: string
  tripId: string
  city: string
  startDate: string
  endDate: string
  /** Reference point for distances (a station, the hotel…). */
  base?: { name: string; lat: number; lng: number }
}

export type OptionKind = 'hotel' | 'restaurant' | 'place' | 'shop' | 'flight'
export type OptionStatus = 'idea' | 'favorite' | 'chosen' | 'discarded'

/** Something being considered (hotel, restaurant, place…), to compare and pick. */
export interface TripOption {
  id: string
  tripId: string
  kind: OptionKind
  status: OptionStatus
  name: string
  city?: string
  /** Hotel: per night; restaurant: per person; place: ticket; flight: per ticket. */
  price?: Money
  /** Hotel: total for the stay, when known (overrides price × nights). */
  totalPrice?: Money
  /** Your own rating, 1–5. */
  rating?: number
  /** Type or specialty: "Ramen", "Temple", "Resort"… */
  category?: string
  /** Free text, e.g. "Lunch and dinner". */
  hours?: string
  link?: string
  notes?: string
  lat?: number
  lng?: number
  googlePlaceId?: string
  address?: string
  googleFetchedAt?: string
  flight?: Flight
  /** What was created from this option (a place in a day, a booking). */
  placeId?: string
  expenseId?: string
  createdAt: string
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
  /** Total cost (for a hotel: all nights). */
  amount: Money
  notes?: string
  /** Set for hotel stays (category "lodging"). */
  hotel?: HotelStay
  /** Set for flights (category "transport"). */
  flight?: Flight
}

export interface HotelStay {
  name: string
  /** "YYYY-MM-DD" (optional: the nights can be typed instead). */
  checkIn?: string
  checkOut?: string
  nights: number
  /** Price per night, when the stay was entered that way (same currency as the amount). */
  perNight?: number
}

export interface Flight {
  /** Airport or city, e.g. "GRU" or "São Paulo". */
  from: string
  to: string
  /** "YYYY-MM-DD" and "HH:mm", local time at departure. */
  date?: string
  time?: string
  /** Airline and/or flight number, e.g. "LATAM LA8070". */
  flightNumber?: string
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
