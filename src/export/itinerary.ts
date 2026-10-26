// The trip as an ordered itinerary with plain-text descriptions, shared by
// the KML and GPX exports.

import { describePlaceCost, travelersOf } from '../budget'
import { formatDay } from '../dates'
import { dayRoute } from '../db/baseStops'
import { legKey } from '../db/legs'
import type { Day, Place, Segment } from '../db/model'
import type { TripData } from '../db/tripData'
import { orderPlaces } from '../db/trips'
import { MODE_COLOR, MODE_LABEL, segmentColor, formatDistance, formatDuration, formatMoney, formatTime, rideFacts } from '../format'
import { translateExit } from '../i18n/japaneseNames'
import { describeWindow, weekdayOf, windowFor } from '../planning/hours'
import { BOOK_AHEAD_LABEL, BOOKED_LABEL } from '../planning/optionKinds'

export interface ItineraryPoint {
  name: string
  description: string
  lat: number
  lng: number
}

export interface ItineraryLine {
  name: string
  description: string
  /** CSS hex color, "#rrggbb". */
  color: string
  path: { lat: number; lng: number }[]
}

export interface Itinerary {
  points: ItineraryPoint[]
  lines: ItineraryLine[]
}

/** Builds the itinerary of the given days (all days when `dayIds` is absent). */
export function buildItinerary(data: TripData, dayIds?: string[]): Itinerary {
  const legs = new Map(data.legs.map((l) => [legKey(l.fromPlaceId, l.toPlaceId), l]))
  const days = data.days.filter((d) => !dayIds || dayIds.includes(d.id))
  const points: ItineraryPoint[] = []
  const lines: ItineraryLine[] = []

  for (const day of days) {
    const dayNumber = data.days.indexOf(day) + 1
    // With several days, names start with the day so they sort and read well.
    const prefix = days.length > 1 ? `D${dayNumber} ` : ''
    const places = orderPlaces(
      day,
      data.places.filter((p) => p.dayId === day.id),
    )
    // Base stops get no point of their own (the hotel would show up once per stop), only their routes.
    const route = dayRoute(day, places)
    const label = (i: number) => (route[i].baseStop ? 'Base' : String(places.indexOf(route[i]) + 1))
    route.forEach((place, i) => {
      const previous = route[i - 1]
      const arriving = previous ? (legs.get(legKey(previous.id, place.id))?.segments ?? []) : []
      if (!place.baseStop) {
        points.push({
          name: `${prefix}${label(i)}. ${place.name}`,
          description: placeDescription(day, dayNumber, place, previous, arriving, travelersOf(data.trip)),
          lat: place.lat,
          lng: place.lng,
        })
      }
      arriving
        .filter((s) => s.path.length > 1)
        .forEach((segment) => {
          lines.push({
            name: `${prefix}${label(i - 1)} → ${label(i)} ${MODE_LABEL[segment.mode]}${segment.lineName ? ` · ${segment.lineName}` : ''}`,
            description: segmentText(segment),
            color: toHexColor(segmentColor(segment)) ?? MODE_COLOR[segment.mode],
            path: segment.path,
          })
        })
    })
  }
  return { points, lines }
}

function placeDescription(
  day: Day,
  dayNumber: number,
  place: Place,
  previous: Place | undefined,
  arriving: Segment[],
  travelers: number,
): string {
  const parts = [`Day ${dayNumber} · ${formatDay(day.date)}${day.title ? ` · ${day.title}` : ''}`]
  if (place.plannedTime) parts.push(`Time: ${place.plannedTime}`)
  const hours = hoursText(place, day.date)
  if (hours) parts.push(hours)
  if (place.address) parts.push(place.address)
  if (place.cost) parts.push(`Cost: ${describePlaceCost(place, travelers)}`)
  if (place.bookAhead) parts.push(place.booked ? BOOKED_LABEL[place.bookAhead] : BOOK_AHEAD_LABEL[place.bookAhead])
  if (previous && arriving.length > 0) {
    parts.push(`How to get here from ${previous.name}:\n${arriving.map((s) => `• ${segmentText(s)}`).join('\n')}`)
  }
  if (place.notes.trim()) parts.push(place.notes.trim())
  return parts.join('\n\n')
}

/** "Open 09:00–17:00 (last entry 16:30)" for the day's weekday, or "" when unknown. */
export function hoursText(place: Place, date: string): string {
  const window = describeWindow(windowFor(place.openingHours, weekdayOf(date)))
  if (!window) return ''
  const note = place.openingHours?.note ? ` (${place.openingHours.note})` : ''
  return window === 'Closed' ? `Closed this day${note}` : `Open ${window}${note}`
}

/** One segment in one or two lines, e.g. "Subway · Ginza Line: Kanda (Exit 2) → Asakusa · 10:02–10:15 · 13 min · ¥178". */
export function segmentText(segment: Segment): string {
  const original = segment.originalNames
  let head = MODE_LABEL[segment.mode]
  if (segment.lineName) head += ` · ${segment.lineName}${original?.line ? ` ${original.line}` : ''}`
  if (segment.operator) head += ` (${segment.operator})`

  const stops =
    segment.fromName || segment.toName
      ? `${stopText(segment.fromName, original?.from, segment.fromExit, segment.fromCode)} → ${stopText(segment.toName, original?.to, segment.toExit, segment.toCode)}`
      : ''
  const facts = [
    segment.departureTime ? `${formatTime(segment.departureTime)}–${formatTime(segment.arrivalTime)}` : '',
    segment.durationMinutes != null ? formatDuration(segment.durationMinutes) : '',
    segment.distanceMeters != null ? formatDistance(segment.distanceMeters) : '',
    segment.fare ? formatMoney(segment.fare) : '',
  ].filter(Boolean)

  return [head + (stops ? `: ${stops}` : ''), rideFacts(segment).join(' · '), facts.join(' · '), segment.notes?.trim() ?? '']
    .filter(Boolean)
    .join('\n')
}

function stopText(name: string | undefined, original: string | undefined, exit: string | undefined, code?: string): string {
  let text = name ?? '?'
  if (original && original !== name) text += ` ${original}`
  if (code) text += ` ${code}`
  if (exit) text += ` (${translateExit(exit)})`
  return text
}

/** Normalizes provider colors ("#RGB", "#RRGGBB", "RRGGBB") to "#rrggbb". */
function toHexColor(color: string | undefined): string | undefined {
  const hex = color?.trim().replace(/^#/, '')
  if (!hex) return undefined
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toLowerCase()}`
  if (/^[0-9a-f]{3}$/i.test(hex)) return `#${[...hex].map((c) => c + c).join('').toLowerCase()}`
  return undefined
}
