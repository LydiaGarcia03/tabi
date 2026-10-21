import type { Expense, Journey, JourneyMode } from '../db/model'
import type { Stay } from '../db/model'

export const JOURNEY_MODES: JourneyMode[] = ['flight', 'shinkansen', 'train', 'bus', 'ferry', 'car']

export const JOURNEY_ICON: Record<JourneyMode, string> = {
  flight: '✈️',
  shinkansen: '🚅',
  train: '🚆',
  bus: '🚌',
  ferry: '⛴️',
  car: '🚗',
}

export const JOURNEY_LABEL: Record<JourneyMode, string> = {
  flight: 'Flight',
  shinkansen: 'Shinkansen',
  train: 'Train',
  bus: 'Bus',
  ferry: 'Ferry',
  car: 'Car',
}

/** Suggestions for the class field. */
export const CABIN_HINTS: Record<JourneyMode, string[]> = {
  flight: ['Economy', 'Premium economy', 'Business'],
  shinkansen: ['Ordinary (reserved)', 'Ordinary (non-reserved)', 'Green Car', 'Gran Class'],
  train: ['Reserved', 'Non-reserved', 'Green Car'],
  bus: ['Standard', 'Premium'],
  ferry: ['Second class', 'First class'],
  car: [],
}

/** Trims text fields and drops empty ones. */
export function cleanJourney(journey: Journey): Journey {
  const text = (s: string | undefined) => s?.trim() || undefined
  return {
    ...journey,
    from: journey.from.trim(),
    to: journey.to.trim(),
    carrier: text(journey.carrier),
    number: text(journey.number),
    cabin: text(journey.cabin),
    fare: text(journey.fare),
    stops: text(journey.stops),
  }
}

/** "✈️ Navegantes → Osaka" */
export function journeyTitle(journey: Journey): string {
  return `${JOURNEY_ICON[journey.mode]} ${journey.from} → ${journey.to}`
}

export function journeyDetails(journey: Journey): string[] {
  return [
    [journey.carrier, journey.number].filter(Boolean).join(' '),
    journey.cabin,
    journey.fare && `${journey.fare} fare`,
    journey.stops,
    journey.durationHours != null ? `${formatHours(journey.durationHours)}` : '',
  ].filter((s): s is string => !!s)
}

export function formatHours(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return m ? `${h} h ${m} min` : `${h} h`
}

/** Same city name, ignoring case, spaces and airport codes in parentheses. */
function sameCity(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').trim()
  return norm(a).includes(norm(b)) || norm(b).includes(norm(a))
}

/**
 * Booked journeys on a route. A missing end matches anything that isn't one
 * of the trip's cities (e.g. arriving from home).
 */
export function journeysOnRoute(expenses: Expense[], stays: Stay[], from?: string, to?: string): Expense[] {
  const isTripCity = (name: string) => stays.some((s) => sameCity(name, s.city))
  const matches = (name: string, city: string | undefined) => (city ? sameCity(name, city) : !isTripCity(name))
  return expenses.filter((e) => e.journey && matches(e.journey.from, from) && matches(e.journey.to, to))
}

/** Booked journeys leaving on a given date. */
export function journeysOn(expenses: Expense[], date: string): Expense[] {
  return expenses.filter((e) => e.journey?.date === date)
}
