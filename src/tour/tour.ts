// The app tour (computers): opened by the help button, and by itself the first time the app is opened. It shows the
// app on the example trip, chapter by chapter (User, 2026-11-02: say where each thing is done — editing the trip,
// exporting, the settings, what choosing an option does), with the rest of the page darkened.

import { useSyncExternalStore } from 'react'
import type { IconName } from '../iconPaths'
import type { Route } from '../router'
import type { ExampleTrip } from './exampleTrip'

const SEEN_KEY = 'tabi.tourSeen'

export interface TourStep {
  /** The part of the app it belongs to, shown above the title. */
  chapter: string
  title: string
  /** The explanation (before the points, when there are some). */
  text?: string
  /** One line each: a name in bold (or a button's icon) and what it is. */
  points?: [string | { icon: IconName; label: string }, string][]
  /** A line after the points. */
  after?: string
  /** The page the step is on. */
  route: (example: ExampleTrip) => Route
  /** What it highlights (the first match of each selector, all together); not found = the card alone in the middle. */
  target: string | string[]
}

const trips = (): Route => ({ page: 'trips' })
const trip = (e: ExampleTrip): Route => ({ page: 'trip', tripId: e.tripId })
const day = (e: ExampleTrip): Route => ({ page: 'day', tripId: e.tripId, dayId: e.dayId })
const options = (e: ExampleTrip): Route => ({ page: 'options', tripId: e.tripId })
const budget = (e: ExampleTrip): Route => ({ page: 'budget', tripId: e.tripId })
const logbook = (e: ExampleTrip): Route => ({ page: 'logbook', tripId: e.tripId })

export const TOUR_STEPS: TourStep[] = [
  // The app
  {
    chapter: 'The app',
    title: 'Your trips',
    text: 'Every trip is a card here. New trip asks for a name, dates, how many people go and the countries; all of it can be changed later. The example trip is one of the cards.',
    route: trips,
    target: ['.page-trips .page-title', '.page-trips .trip-cards'],
  },
  {
    chapter: 'The app',
    title: 'Import a backup',
    text: 'Open a trip’s backup file here to add that trip to this device: one exported on another device, or a copy you saved.',
    route: trips,
    target: '.page-trips details.disclosure',
  },
  {
    chapter: 'The app',
    title: 'App settings',
    text: 'The button at the top right:',
    points: [
      ['Appearance', 'light or dark theme.'],
      ['Account & sync', 'sign in with Google to have the same trips on your phone and computer.'],
      ['Install the app', 'to use it offline.'],
      ['Transit suggestions', 'your NAVITIME key, for train routes in Japan.'],
    ],
    route: trips,
    target: '.app-bar a[aria-label="Settings"]',
  },

  // The trip
  {
    chapter: 'The trip',
    title: 'The trip’s sections',
    points: [
      ['Itinerary', 'the days, the cities and what to book.'],
      ['Logbook', 'your guide during the trip.'],
      ['Options', 'hotels, restaurants, places and transport you’re still deciding on.'],
      ['Budget', 'what it all costs.'],
    ],
    after: 'Below them, every day with its city.',
    route: trip,
    target: '.trip-sidebar',
  },
  {
    chapter: 'The trip',
    title: 'Name and dates',
    text: 'Click the name to rename the trip. Dates, travelers, countries and currencies are changed in Trip settings, at the end of this page.',
    route: trip,
    target: '.trip-hero',
  },
  {
    chapter: 'The trip',
    title: 'One card per day',
    text: 'Each day shows its city, its places, the time spent getting around and what it should cost. Click a day to plan it.',
    route: trip,
    target: '.overview-days',
  },
  {
    chapter: 'The trip',
    title: 'Cities and hotels',
    text: 'Add each city with its dates: the days get their city from here. The pencil edits a city and its base (your hotel, or a station), used for distances and the way back at night. Between two cities, + Transport says how you’ll go.',
    route: trip,
    target: '.overview-part[data-tab="cities"] > .card',
  },
  {
    chapter: 'The trip',
    title: 'What to book',
    text: 'Made from the itinerary: hotels, flights, the shinkansen, and tickets or tables marked as needing booking. Tick one once it’s booked for real. Your own reminders go at the end.',
    route: trip,
    target: '.checklist-card',
  },
  {
    chapter: 'The trip',
    title: 'Trip settings',
    text: 'Open it to change:',
    points: [
      ['The trip', 'name, dates and how many people go.'],
      ['Countries & money', 'the countries, “my money” (where totals are shown) and the exchange rates.'],
    ],
    after: 'Deleting the trip is here too.',
    route: trip,
    target: '.overview-part[data-tab="more"] > details:not(.export-card)',
  },
  {
    chapter: 'The trip',
    title: 'Export & backup',
    text: 'Export to Organic Maps (KML or GPX) to have your places and routes on an offline map on your phone. The backup file is a copy of the whole trip, to keep or to open on another device.',
    route: trip,
    target: '.export-card',
  },

  // A day
  {
    chapter: 'A day',
    title: 'The day, in order',
    text: 'Click a place to edit it: arrival time, how long you stay, opening hours, cost, “ticket needed”, notes. Drag the handle on the right to change the order; Optimize order suggests the best one.',
    route: day,
    target: '.day-list-column .timeline',
  },
  {
    chapter: 'A day',
    title: 'Getting from one place to the next',
    text: 'Between two places, the exact way: walk to the station, take the Ginza Line, walk to the park. Click it to see every step, edit them or draw them on the map, or get a suggested route (NAVITIME in Japan, Google elsewhere).',
    route: day,
    target: '.leg-item:not(.empty)',
  },
  {
    chapter: 'A day',
    title: 'Adding places',
    text: 'Three ways:',
    points: [
      ['Search', 'a name on Google, or paste coordinates.'],
      ['The map', 'click a spot, or a shop or sight on it.'],
      ['Choose from my options', 'the restaurants and places you’ve already compared.'],
    ],
    route: day,
    target: '.add-place',
  },
  {
    chapter: 'A day',
    title: 'The map',
    text: 'Places are numbered in order and each step is drawn in its line’s color. Offline map shows a map downloaded for the trip, for when there’s no internet.',
    route: day,
    target: '.day-map-column',
  },
  {
    chapter: 'A day',
    title: 'Share, print, next day',
    text: 'Share sends the day as text (ready for WhatsApp, with Google Maps links); print gives it on paper. The arrows go to the day before and after.',
    route: day,
    target: '.day-hero-actions',
  },

  // Options
  {
    chapter: 'Options',
    title: 'Ideas to compare',
    text: 'Everything you’re considering, by kind (hotels, restaurants, places, shops, transport) and by city. Add option saves one with its price, rating, location, photos and notes. Nothing here is in the itinerary yet.',
    route: options,
    target: ['.page-options .hero', '.options-toolbar'],
  },
  {
    chapter: 'Options',
    title: 'The score',
    text: 'The options of a group are compared: price, distance (from your hotel) and your rating make a score from 0 to 100. “How the score works”, at the end of the page, changes what counts most.',
    route: options,
    target: '.option-group',
  },
  {
    chapter: 'Options',
    title: 'Favorite, choose, discard',
    points: [
      [{ icon: 'star', label: 'Favorite' }, 'a favorite.'],
      [{ icon: 'check', label: 'Choose' }, 'into the itinerary. A hotel or transport asks for dates and price, and goes into the trip and the budget; a restaurant or place goes into a day.'],
      [{ icon: 'close', label: 'Discard' }, 'discarded.'],
    ],
    after: 'Putting something in the itinerary doesn’t mean it’s booked. When you really book it, tick “Booked” on it.',
    route: options,
    target: '.option-row.status-chosen .option-actions',
  },

  // Money
  {
    chapter: 'Money',
    title: 'Trip money',
    text: 'What you’ve set aside, what is booked (paid), still to book and estimated, and whether money is left over or missing. Everything in your money.',
    route: budget,
    target: '.trip-money',
  },
  {
    chapter: 'Money',
    title: 'Estimates',
    text: 'Per category: the prices in the itinerary plus your own estimates (souvenirs, the Suica…). Click a category to add one. Once the trip starts, what you spend each day is compared with them.',
    route: budget,
    target: '.estimates-card',
  },

  // During the trip
  {
    chapter: 'During the trip',
    title: 'The Logbook',
    text: 'On the trip, pick the day and tap Follow: it uses your location to show where you are, what’s next and how to get there, even offline. Swipe a place to the right once you’ve visited it.',
    route: logbook,
    target: ['.logbook-bar', '.logbook-day'],
  },
]

export type TourState =
  | { phase: 'closed' }
  | { phase: 'intro'; starting?: boolean }
  | { phase: 'steps'; step: number; example: ExampleTrip }
  | { phase: 'end'; example: ExampleTrip }

let state: TourState = { phase: 'closed' }
const listeners = new Set<() => void>()

export function setTour(next: TourState): void {
  state = next
  if (next.phase !== 'closed') markSeen()
  listeners.forEach((l) => l())
}

export function useTour(): TourState {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    () => state,
  )
}

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    // Storage blocked: don't open it by itself on every visit.
    return true
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    // Not remembered.
  }
}

// "Create my trip" at the end of the tour opens the Trips page with the new trip form.
let newTripRequested = false

export function requestNewTrip(): void {
  newTripRequested = true
}

/** Whether the new trip form was asked for (once). */
export function takeNewTripRequest(): boolean {
  const asked = newTripRequested
  newTripRequested = false
  return asked
}
