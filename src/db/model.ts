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
  /** Money already set aside for the trip (updated by hand). */
  savedMoney?: Money
  /** How many people are going (default 1): per-person prices are multiplied by it. */
  travelers?: number
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
  base?: StayBase
  /** How the city is visited (default "stay"). */
  kind?: StayKind
}

/**
 * - `stay`: you sleep there (hotel nights).
 * - `day-trip`: there and back the same day, sleeping in the city you're staying in (Kyoto from Osaka).
 * - `stopover`: visited on the way to the next city, without sleeping there.
 */
export type StayKind = 'stay' | 'day-trip' | 'stopover'

export interface StayBase {
  name: string
  lat: number
  lng: number
  /** What it is (older bases have none). */
  kind?: 'hotel' | 'station' | 'other'
  /** The hotel option it was picked from, if any. */
  optionId?: string
}

export type OptionKind = 'hotel' | 'restaurant' | 'place' | 'shop' | 'transport'
export type OptionStatus = 'idea' | 'favorite' | 'chosen' | 'discarded'

/** One fare of a transport option: "Classic", "+1 × 23 kg", R$ 5.640 seen on 2026-10-21. */
export interface OptionFare {
  /** Optional when there is only one. */
  name?: string
  bags?: string
  price?: Money
  /** "YYYY-MM-DD": when the price was seen (prices change from day to day). */
  seenOn?: string
}

/** Something being considered (hotel, restaurant, place…), to compare and pick. */
export interface TripOption {
  id: string
  tripId: string
  kind: OptionKind
  status: OptionStatus
  name: string
  city?: string
  /** Hotel: per night; restaurant: per person; place: ticket; transport: per ticket. */
  price?: Money
  /** Restaurants, places, shops: the price is for the whole group, not per person. Copied to the place. */
  priceForGroup?: boolean
  /** Restaurants, places, shops: how many people go (default: the trip's travelers). Copied to the place. */
  people?: number
  /** Hotel: total for the stay, when known (overrides price × nights). */
  totalPrice?: Money
  /** Your own rating, 1–5. */
  rating?: number
  /** Type or specialty: "Ramen", "Temple", "Resort"… */
  category?: string
  /** Free text, e.g. "Lunch and dinner" (before `openingHours`; kept while it has text). */
  hours?: string
  /** Restaurants, places, shops: copied to the place when added to a day. */
  openingHours?: OpeningHours
  /** Restaurants: a reservation is needed; places: a ticket must be bought ahead. Copied to the place. */
  bookAhead?: BookAhead
  link?: string
  notes?: string
  lat?: number
  lng?: number
  googlePlaceId?: string
  address?: string
  googleFetchedAt?: string
  /** For transport options: mode, route, airline, fare… */
  journey?: Journey
  /**
   * Transport options: the ways to buy it (Light, Classic…), each with its
   * price and the day it was seen. The chosen one (`fareIndex`) is copied to
   * `price` and `journey.fare`, so the comparison, budget and bookings use it.
   */
  fares?: OptionFare[]
  fareIndex?: number
  /** What was created from this option (a place in a day, a booking). */
  placeId?: string
  expenseId?: string
  createdAt: string
}

/** A photo of an option (hotel room, menu, view…), uploaded by the user and resized on the device. */
export interface OptionPhoto {
  id: string
  tripId: string
  optionId: string
  /** Position among the option's photos (0 first). */
  order: number
  /** JPEG image. */
  image: Blob
}

/** A vector tile of the offline map, "z/x/y" (shared by every trip that covers it). */
export interface MapTile {
  key: string
  data: ArrayBuffer
}

/** Offline map styles, fonts and icons: "style/liberty", "font/Noto Sans Regular/0-255", "sprite/ofm@2x.png"… */
export interface MapAsset {
  key: string
  data: ArrayBuffer | string
}

/** What was downloaded for a trip's offline map. */
export interface MapArea {
  tripId: string
  /** Keys of its tiles ("z/x/y"). */
  tiles: string[]
  bytes: number
  downloadedAt: string
  /** Most detailed zoom level downloaded around the places (the map zooms further by enlarging it). */
  detailZoom: number
}

export interface Day {
  id: string
  tripId: string
  date: string
  title: string
  /** Place ids in visiting order. */
  placeIds: string[]
  /** Going back to the city's base between places (or leaving from it), added by the user. */
  baseStops?: BaseStop[]
}

/**
 * "Back to base" between a day's places ("From base" when it comes first): a
 * stop with no details, only the way there (its legs use its id like a place's).
 */
export interface BaseStop {
  id: string
  /**
   * How many of the day's places come before it (0 = start of the day), so it
   * keeps its place in the day when places are reordered. "end" stays after
   * the last place when places are added.
   */
  slot: number | 'end'
  /** The stay whose base it is; `base` is a copy, kept in sync when that base changes. */
  stayId: string
  base: StayBase
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
  /** Entry fee, ticket, average meal… per person unless `costForGroup`. */
  cost?: Money
  /** The cost is for the whole group (a private tour…), not per person. */
  costForGroup?: boolean
  /** How many people go to this place (default: the trip's travelers). */
  people?: number
  /** What it is (default "place"); decides the budget category of its cost. */
  kind?: PlaceKind
  /** Opening hours, entered by the user. Absent = unknown (treated as always open). */
  openingHours?: OpeningHours
  /** How long the visit takes, in minutes. */
  visitMinutes?: number
  /** Something to arrange before going (a reservation, a ticket): listed in the trip's checklist. */
  bookAhead?: BookAhead
  /** The reservation is made / the ticket bought (ticked in the checklist). */
  booked?: boolean
}

/** A place of a day: a sight, a restaurant, a shop (like the options it can come from) or anything else. */
export type PlaceKind = 'place' | 'restaurant' | 'shop' | 'other'

/** `either` = ticked on a place of a day, where it isn't known which one (options say). */
export type BookAhead = 'reservation' | 'ticket' | 'either'

/** "HH:mm" local times. A close at or before the open time ends after midnight ("00:00" = midnight). */
export interface TimeRange {
  open: string
  close: string
}

export interface OpeningHours {
  /**
   * Index 0 = Sunday … 6 = Saturday: that day's opening times in order
   * (several when it closes in between, e.g. 11:00–13:00 and 18:00–22:00);
   * null = closed that day.
   */
  days: (TimeRange[] | null)[]
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
  /** Set for a trip between cities: flight, shinkansen… (category "transport"). */
  journey?: Journey
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

export type JourneyMode = 'flight' | 'shinkansen' | 'train' | 'bus' | 'ferry' | 'car'

/** Getting from one city to another (or from home): a flight, a shinkansen… */
export interface Journey {
  mode: JourneyMode
  /** City or airport/station, e.g. "Navegantes (NVT)" or "Shin-Osaka". */
  from: string
  to: string
  /** "YYYY-MM-DD" and "HH:mm", local time at departure. */
  date?: string
  time?: string
  /** Airline or operator. Airline names that match the airline guide show its baggage rules. */
  carrier?: string
  /** Flight or train number: "EK262", "Nozomi 21". */
  number?: string
  /** Cabin or car class: "Economy", "Premium economy", "Green Car"… */
  cabin?: string
  /** Fare family ("Saver", "Classic", "Light"): decides the checked baggage. */
  fare?: string
  /** Door-to-door time of the whole trip, connections included. */
  durationHours?: number
  /** Connections, e.g. "via Dubai". */
  stops?: string
  /**
   * Each flight (or train) of a trip with connections, in order. When set,
   * from/to/time/number/stops/durationHours are derived from them (see
   * withLegSummary) and carrier is the main airline (its baggage rules apply).
   */
  legs?: JourneyLeg[]
}

/** One flight of a journey with connections, as shown by Google Flights. */
export interface JourneyLeg {
  /** Airport, ideally with its code: "São Paulo (GRU)". */
  from: string
  to: string
  /** "HH:mm" local times. */
  departTime?: string
  arriveTime?: string
  /** Days after the journey's date (Google's "+1", "+2"). */
  departDay?: number
  arriveDay?: number
  /** Time on board in minutes (local times can't give it: time zones differ). */
  minutes?: number
  carrier?: string
  number?: string
  /** "Airbus A350" */
  aircraft?: string
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
