// A day as plain text, for sharing in a chat app (User's pick from a mock, 2026-10-31): the title, a summary
// (tickets, meals, fares, spending), when you leave and come back, one line per place, and the route on Google
// Maps. *bold* and _italic_ are WhatsApp's formatting; other apps show the marks as they are.

import { displayAmount, placeCost, totalsList, type Totals } from '../budget'
import { formatDay } from '../dates'
import { dayRoute, type RouteStop } from '../db/baseStops'
import { legKey, legTimes } from '../db/legs'
import type { Day, Leg, Place, Trip } from '../db/model'
import { formatMoney, formatTime } from '../format'
import { directionsStopsUrl } from '../googleMapsLinks'

/** Google Maps directions take an origin, a destination and at most 9 stops in between. */
const STOPS_PER_LINK = 11

export function dayText(
  day: Day,
  number: number,
  places: Place[],
  legs: Map<string, Leg>,
  trip: Trip,
  travelers: number,
  city: string,
  /** Rides paid by a rail pass in use: their fares aren't paid on the day. */
  covered?: Map<string, string>,
): string {
  const blocks: string[][] = [[`*Day ${number} · ${formatDay(day.date)}${city ? ` · ${city}` : ''}*`, ...(day.title ? [`_${day.title}_`] : [])]]
  const route = dayRoute(day, places)
  if (places.length === 0) {
    blocks.push(['Nothing planned yet.'])
    return join(blocks)
  }

  const summary: string[] = []
  const tickets = places.filter((p) => p.bookAhead && p.kind !== 'restaurant').map((p) => p.name)
  const tables = places.filter((p) => p.bookAhead && p.kind === 'restaurant').map((p) => p.name)
  if (tickets.length) summary.push(`*Tickets:* ${tickets.join(', ')}`)
  if (tables.length) summary.push(`*Reservations:* ${tables.join(', ')}`)
  const meals = places.flatMap((p) => {
    const meal = mealOf(p)
    return meal ? [`${p.name} (${meal})`] : []
  })
  if (meals.length) summary.push(`*Meals:* ${meals.join(' · ')}`)
  const fares = dayFares(route, legs, covered)
  if (fares.length) {
    const suica = trip.countries?.includes('JP') ? ' (load the Suica)' : ''
    summary.push(`*Fares:* ${fares.map(formatMoney).join(' + ')} per person${suica}`)
  }
  const spending = placesSpending(places, trip, travelers)
  if (spending) summary.push(`*Spending:* ≈ ${spending}${travelers > 1 ? ` for ${travelers}` : ''}`)
  if (summary.length) blocks.push(summary)

  // "05:35 leave Meander → back ~21:10", from the ways to and from the hotel.
  const first = route[0]
  const last = route.at(-1)!
  const leave = first.baseStop && route[1] ? legTimes(legs.get(legKey(first.id, route[1].id))?.segments).depart : undefined
  const back =
    last.baseStop && route.length > 1 ? legTimes(legs.get(legKey(route[route.length - 2].id, last.id))?.segments).arrive : undefined
  const ends: string[] = []
  if (first.baseStop) ends.push(`${leave ? `${formatTime(leave)} ` : ''}leave ${first.name}`)
  if (last.baseStop && route.length > 1) {
    const again = first.baseStop && first.name === last.name
    ends.push(`back${again ? '' : ` to ${last.name}`}${back ? ` ~${formatTime(back)}` : ''}`)
  }
  if (ends.length) blocks.push([ends.join(' → ')])

  // "09:20 Gion Maruyamado · café", "11:50 Echigo Soba · lunch", "13:40 Kuramadera · ticket".
  blocks.push(
    route
      .filter((stop) => !stop.baseStop)
      .map((place) => {
        const kind = mealOf(place) ?? (place.kind === 'restaurant' ? placeType(place)?.toLowerCase() : undefined)
        const tags = [kind, bookTag(place)].filter(Boolean)
        return `${place.plannedTime ? `${place.plannedTime} ` : ''}${[place.name, ...tags].join(' · ')}`
      }),
  )

  const links = routeLinks(route)
  if (links.length === 1) blocks.push([`*Route on Google Maps:* ${links[0].url}`])
  else if (links.length > 1) blocks.push(['*Route on Google Maps*', ...links.map((l) => `${l.label}: ${l.url}`)])
  return join(blocks)
}

function join(blocks: string[][]): string {
  return blocks.map((b) => b.join('\n')).join('\n\n')
}

/** The first line of the notes is the option's type ("Ramen", "Café") when the place came from an option. */
function placeType(place: Place): string | undefined {
  return place.notes.trim().split('\n')[0]?.trim() || undefined
}

const NOT_A_MEAL = /caf[eé]|coffee|tea|sweet|dessert|bakery|dango|ice cream|snack|bar\b/i

/** Lunch or dinner by the planned time; cafés and sweets aren't meals. */
function mealOf(place: Place): string | undefined {
  if (place.kind !== 'restaurant' || !place.plannedTime) return undefined
  if (NOT_A_MEAL.test(placeType(place) ?? '') || NOT_A_MEAL.test(place.name)) return undefined
  const [h, m] = place.plannedTime.split(':').map(Number)
  const minutes = h * 60 + m
  if (minutes < 10 * 60 + 30) return 'breakfast'
  if (minutes >= 11 * 60 && minutes < 15 * 60 + 30) return 'lunch'
  if (minutes >= 17 * 60 + 30) return 'dinner'
  return undefined
}

function bookTag(place: Place): string | undefined {
  if (!place.bookAhead) return undefined
  return place.kind === 'restaurant' ? 'reservation' : 'ticket'
}

/** Fares per person of the day's rides (taxis and cars are per car: left out), per currency. */
function dayFares(route: Place[], legs: Map<string, Leg>, covered?: Map<string, string>) {
  const totals: Totals = {}
  route.forEach((stop, i) => {
    const next = route[i + 1]
    if (!next) return
    for (const s of legs.get(legKey(stop.id, next.id))?.segments ?? []) {
      if (!s.fare?.amount || s.mode === 'taxi' || s.mode === 'car' || covered?.has(s.id)) continue
      totals[s.fare.currency] = (totals[s.fare.currency] ?? 0) + s.fare.amount
    }
  })
  return Object.entries(totals).map(([currency, amount]) => ({ amount, currency }))
}

/** What the places cost the group (tickets included), in "my money" when it converts, rounded. */
function placesSpending(places: Place[], trip: Trip, travelers: number): string | undefined {
  const totals: Totals = {}
  for (const place of places) {
    const cost = placeCost(place, travelers)
    if (cost?.amount) totals[cost.currency] = (totals[cost.currency] ?? 0) + cost.amount
  }
  if (Object.keys(totals).length === 0) return undefined
  const amount = displayAmount(totals, trip)
  const round = (m: { amount: number; currency: string }) => formatMoney({ ...m, amount: Math.round(m.amount) }).replace(/\.00$/, '')
  return amount != null ? round({ amount, currency: trip.displayCurrency }) : totalsList(totals, trip).map(round).join(' + ')
}

/**
 * The day's stops in order on Google Maps, split into links of at most 11 stops (each starts where the last
 * ended). A long day's parts are named by when they start ("Morning", "Afternoon", "Evening", from the first
 * planned time after the shared stop); "Part 2" when two would get the same name or there are no times.
 */
function routeLinks(route: RouteStop[]): { url: string; label: string }[] {
  if (route.length < 2) return []
  const parts: RouteStop[][] = []
  for (let start = 0; start < route.length - 1; start += STOPS_PER_LINK - 1) parts.push(route.slice(start, start + STOPS_PER_LINK))
  const periods = parts.map((part, i) => {
    const time = part.slice(i === 0 ? 0 : 1).find((p) => !p.baseStop && p.plannedTime)?.plannedTime
    return time ? period(time) : undefined
  })
  const named = periods.every((p) => p) && new Set(periods).size === periods.length
  return parts.map((part, i) => ({ url: directionsStopsUrl(part), label: named ? periods[i]! : `Part ${i + 1}` }))
}

function period(time: string): string {
  const hour = Number(time.slice(0, 2))
  return hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening'
}

/** Opens the phone's share sheet, or copies the text when sharing isn't available. Returns what happened. */
export async function shareText(title: string, text: string): Promise<'shared' | 'copied' | 'cancelled'> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
    }
  }
  await navigator.clipboard.writeText(text)
  return 'copied'
}
